import { chromium } from "playwright";

export interface FetchLinkedInPageOptions {
  url: string;
  timeoutMs: number;
  headless: boolean;
}

export interface FetchedLinkedInSectionPage {
  key: string;
  requestedUrl: string;
  finalUrl: string;
  title?: string;
  accessible: boolean;
  html?: string;
}

export interface FetchedLinkedInPage {
  initialUrl: string;
  finalUrl: string;
  pageTitle?: string;
  html: string;
  isAuthwall: boolean;
  isBlocked: boolean;
  expandedActions: string[];
  sectionPages: FetchedLinkedInSectionPage[];
}

const SECTION_LINK_PATTERNS = [
  { key: "experience", match: "/details/experience/" },
  { key: "education", match: "/details/education/" },
  { key: "certifications", match: "/details/certifications/" },
  { key: "skills", match: "/details/skills/" },
  { key: "projects", match: "/details/projects/" },
  { key: "courses", match: "/details/courses/" },
  { key: "honors-awards", match: "/details/honors/" },
  { key: "languages", match: "/details/languages/" },
  { key: "volunteering", match: "/details/volunteering-experiences/" },
  { key: "recommendations", match: "/details/recommendations/" },
  { key: "activity", match: "/recent-activity/" }
] as const;

async function preparePage(page: import("playwright").Page): Promise<void> {
  await page.route("**/*", (route) => {
    const resourceType = route.request().resourceType();

    if (resourceType === "image" || resourceType === "media" || resourceType === "font") {
      return route.abort();
    }

    return route.continue();
  });
}

async function settlePage(page: import("playwright").Page, timeoutMs: number): Promise<void> {
  await page.waitForLoadState("domcontentloaded", {
    timeout: timeoutMs
  }).catch(() => undefined);

  await page.waitForLoadState("networkidle", {
    timeout: Math.min(timeoutMs, 1_200)
  }).catch(() => undefined);
}

async function scrollPage(page: import("playwright").Page): Promise<void> {
  await page.evaluate(async function () {
    const step = Math.max(500, Math.floor(window.innerHeight * 0.9));
    const maxY = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);

    for (let y = 0; y < maxY; y += step) {
      window.scrollTo(0, y);
      await new Promise(function (resolve) { window.setTimeout(resolve, 120); });
    }

    window.scrollTo(0, 0);
  }).catch(() => undefined);
}

async function expandLinkedInSections(page: import("playwright").Page): Promise<string[]> {
  const clicked = new Set<string>();

  for (let pass = 0; pass < 4; pass += 1) {
    await scrollPage(page);

    const passClicks = await page.evaluate(function () {
      const clickedLabels = [];
      const patterns = [
        /^show more$/i,
        /^show all$/i,
        /^see more$/i,
        /^see all$/i,
        /^\.\.\.\s*more$/i,
        /^…\s*more$/i
      ];
      const blockedPatterns = [
        /^sign in$/i,
        /^join now$/i,
        /^agree & join$/i,
        /^continue with google$/i
      ];

      const elements = Array.from(document.querySelectorAll("button, a[role='button'], a"));

      for (const element of elements) {
        if (!(element instanceof HTMLElement)) {
          continue;
        }

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) {
          continue;
        }

        const label = element.innerText.replace(/\s+/g, " ").trim();
        if (!label || label.length > 40) {
          continue;
        }

        if (blockedPatterns.some((pattern) => pattern.test(label))) {
          continue;
        }

        if (patterns.some((pattern) => pattern.test(label))) {
          element.click();
          clickedLabels.push(label);
        }
      }

      return clickedLabels;
    }) as string[];

    if (passClicks.length === 0) {
      continue;
    }

    for (const label of passClicks) {
      clicked.add(label);
    }

    await page.waitForTimeout(400);
  }

  return [...clicked];
}

async function collectSectionPages(
  context: import("playwright").BrowserContext,
  page: import("playwright").Page,
  timeoutMs: number
): Promise<FetchedLinkedInSectionPage[]> {
  const hrefs = await page.evaluate(function (patterns: typeof SECTION_LINK_PATTERNS) {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const resolved = new Map();

    for (const anchor of anchors) {
      if (!(anchor instanceof HTMLAnchorElement)) {
        continue;
      }

      const href = anchor.href;
      let matched;
      for (const pattern of patterns) {
        if (href.includes(pattern.match)) {
          matched = pattern;
          break;
        }
      }

      if (matched && !resolved.has(matched.key)) {
        resolved.set(matched.key, href);
      }
    }

    return [...resolved.entries()].map(([key, url]) => ({ key, url }));
  }, SECTION_LINK_PATTERNS) as Array<{ key: string; url: string }>;

  const pages: FetchedLinkedInSectionPage[] = [];

  for (const href of hrefs) {
    const detailPage = await context.newPage();

    try {
      await preparePage(detailPage);
      await detailPage.goto(href.url, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs
      });
      await settlePage(detailPage, timeoutMs);
      await expandLinkedInSections(detailPage);

      const finalUrl = detailPage.url();
      const title = await detailPage.title();
      const accessible = !/authwall|checkpoint|login|signup/i.test(finalUrl);

      pages.push({
        key: href.key,
        requestedUrl: href.url,
        finalUrl,
        title,
        accessible,
        html: accessible ? await detailPage.content() : undefined
      });
    } catch {
      pages.push({
        key: href.key,
        requestedUrl: href.url,
        finalUrl: href.url,
        accessible: false
      });
    } finally {
      await detailPage.close().catch(() => undefined);
    }
  }

  return pages;
}

export async function fetchLinkedInPage(options: FetchLinkedInPageOptions): Promise<FetchedLinkedInPage> {
  const browser = await chromium.launch({
    headless: options.headless
  });

  try {
    const context = await browser.newContext({
      locale: "en-US"
    });

    const page = await context.newPage();
    await preparePage(page);

    await page.goto(options.url, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs
    });
    await settlePage(page, options.timeoutMs);

    const finalUrl = page.url();
    const pageTitle = await page.title();
    const isAuthwall = /authwall/i.test(finalUrl);
    const isBlocked = /checkpoint|login-submit|captcha|challenge/i.test(finalUrl);
    const expandedActions = isAuthwall ? [] : await expandLinkedInSections(page);
    const html = await page.content();
    const sectionPages = isAuthwall || isBlocked
      ? []
      : await collectSectionPages(context, page, options.timeoutMs);

    return {
      initialUrl: options.url,
      finalUrl,
      pageTitle,
      html,
      isAuthwall,
      isBlocked,
      expandedActions,
      sectionPages
    };
  } finally {
    await browser.close();
  }
}

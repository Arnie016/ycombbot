import { load, type CheerioAPI } from "cheerio";
import type { FetchedLinkedInPage } from "./fetchLinkedInPage.js";
import type { RawLinkedInEntity } from "../types.js";
import { isUsableLinkedInPersonName } from "../utils/identity.js";
import { describeLinkedInUrl, detectLinkedInEntityType, normalizeWhitespace, pickFirst } from "../utils/linkedin.js";

interface ExtractLinkedInDataInput {
  fetchedPage: FetchedLinkedInPage;
  url: URL;
}

function extractFollowerCount(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/([\d,.]+)\s+followers/i);
  return match?.[1] ? `${match[1]} followers` : undefined;
}

function unwrapLinkedInRedirect(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) {
    return undefined;
  }

  try {
    const parsed = new URL(rawUrl);
    const redirectTarget = parsed.searchParams.get("url");
    return normalizeWhitespace(redirectTarget ?? rawUrl);
  } catch {
    return normalizeWhitespace(rawUrl);
  }
}

function textAt($: CheerioAPI, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const text = normalizeWhitespace($(selector).first().text());
    if (text) {
      return text;
    }
  }

  return undefined;
}

function attrAt($: CheerioAPI, selectors: string[], attribute: string): string | undefined {
  for (const selector of selectors) {
    const value = normalizeWhitespace($(selector).first().attr(attribute));
    if (value) {
      return value;
    }
  }

  return undefined;
}

function parseJsonLd($: CheerioAPI): Array<Record<string, unknown>> {
  const payloads: Array<Record<string, unknown>> = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text();
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object") {
            payloads.push(item as Record<string, unknown>);
          }
        }
      } else if (parsed && typeof parsed === "object") {
        payloads.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Ignore partial or invalid JSON-LD blocks.
    }
  });

  return payloads;
}

function pickJsonLdItem(payloads: Array<Record<string, unknown>>, type: "Person" | "Organization"): Record<string, unknown> | undefined {
  return payloads.find((payload) => {
    const rawType = payload["@type"];

    if (typeof rawType === "string") {
      return rawType === type;
    }

    if (Array.isArray(rawType)) {
      return rawType.includes(type);
    }

    return false;
  });
}

function parseDefinitionList($: CheerioAPI): Record<string, string> {
  const details: Record<string, string> = {};

  $("dt").each((index, term) => {
    const label = normalizeWhitespace($(term).text());
    const value = normalizeWhitespace($(term).next("dd").text());

    if (label && value) {
      details[label.toLowerCase()] = value;
    }

    const sameIndexValue = normalizeWhitespace($("dd").eq(index).text());
    if (label && sameIndexValue) {
      details[label.toLowerCase()] = sameIndexValue;
    }
  });

  return details;
}

function sectionExcerpt(html: string | undefined): string | undefined {
  if (!html) {
    return undefined;
  }

  const $ = load(html);
  const text = normalizeWhitespace($("main").text()) ?? normalizeWhitespace($("body").text());

  if (!text) {
    return undefined;
  }

  return text.slice(0, 1_200);
}

function cleanAuthwallText(value: string | undefined, isAuthwall: boolean): string | undefined {
  if (!value) {
    return undefined;
  }

  if (!isAuthwall) {
    return value;
  }

  if (
    /^join linkedin$/i.test(value) ||
    /750 million\+ members/i.test(value) ||
    /manage your professional identity/i.test(value)
  ) {
    return undefined;
  }

  return value;
}

export function extractLinkedInData(input: ExtractLinkedInDataInput): RawLinkedInEntity {
  const $ = load(input.fetchedPage.html);
  const jsonLdPayloads = parseJsonLd($);
  const type = detectLinkedInEntityType(input.url);
  const descriptor = describeLinkedInUrl(input.url);
  const metaDescription = cleanAuthwallText(
    attrAt($, ['meta[name="description"]', 'meta[property="og:description"]'], "content"),
    input.fetchedPage.isAuthwall
  );
  const canonicalUrl = pickFirst(
    input.fetchedPage.isAuthwall ? input.url.toString() : undefined,
    attrAt($, ['link[rel="canonical"]'], "href"),
    attrAt($, ['meta[property="og:url"]'], "content"),
    input.fetchedPage.finalUrl,
    input.url.toString()
  ) ?? input.url.toString();
  const notes: string[] = [];
  const sourceSignals: string[] = [];
  const definitionList = parseDefinitionList($);
  const sections = input.fetchedPage.sectionPages.map((section) => ({
    key: section.key,
    requestedUrl: section.requestedUrl,
    finalUrl: section.finalUrl,
    title: section.title,
    accessible: section.accessible,
    excerpt: sectionExcerpt(section.html)
  }));

  if (input.fetchedPage.isAuthwall) {
    notes.push("LinkedIn redirected this profile to authwall before deeper sections could load.");
  }

  if (input.fetchedPage.isBlocked) {
    notes.push("LinkedIn returned a blocked or challenge flow.");
  }

  if (type === "person") {
    const personJsonLd = pickJsonLdItem(jsonLdPayloads, "Person");
    const title = cleanAuthwallText(normalizeWhitespace($("title").text()), input.fetchedPage.isAuthwall);
    const name = cleanAuthwallText(pickFirst(
      typeof personJsonLd?.name === "string" ? personJsonLd.name : undefined,
      textAt($, ["h1", ".top-card-layout__title", ".top-card__title"]),
      title?.split("|")[0]
    ), input.fetchedPage.isAuthwall);
    const usableName = isUsableLinkedInPersonName(name) ? name : undefined;
    const headline = cleanAuthwallText(pickFirst(
      textAt($, [
        ".top-card-layout__headline",
        ".top-card__headline",
        ".text-body-medium.break-words"
      ]),
      metaDescription
    ), input.fetchedPage.isAuthwall);
    const about = textAt($, [
      ".core-section-container__content .show-more-less-text__text--less",
      ".summary .show-more-less-text__text--less",
      ".about-us__description",
      "section.about p"
    ]);
    const location = textAt($, [
      ".top-card__subline-item",
      ".top-card-layout__first-subline",
      ".not-first-middot"
    ]);
    const currentCompany = pickFirst(
      textAt($, [
        ".experience-group-header__company",
        ".top-card-link__description",
        "[data-test-experience-item] .profile-section-card__title"
      ]),
      typeof personJsonLd?.worksFor === "object" && personJsonLd?.worksFor && "name" in personJsonLd.worksFor
        ? normalizeWhitespace(String(personJsonLd.worksFor.name))
        : undefined
    );

    sourceSignals.push(...[usableName, headline, about, currentCompany].filter(Boolean) as string[]);

    return {
      kind: descriptor.kind,
      stableId: descriptor.stableId,
      hostVariant: descriptor.hostVariant,
      trackingParams: descriptor.trackingParams,
      type,
      url: input.url.toString(),
      canonicalUrl,
      access: {
        finalUrl: input.fetchedPage.finalUrl,
        pageTitle: input.fetchedPage.pageTitle,
        isAuthwall: input.fetchedPage.isAuthwall,
        isBlocked: input.fetchedPage.isBlocked,
        expandedActions: input.fetchedPage.expandedActions
      },
      name: usableName,
      headline,
      about,
      location,
      currentCompany,
      metaDescription,
      sections,
      sourceSignals,
      notes
    };
  }

  if (type === "company") {
    const orgJsonLd = pickJsonLdItem(jsonLdPayloads, "Organization");
    const name = pickFirst(
      typeof orgJsonLd?.name === "string" ? orgJsonLd.name : undefined,
      textAt($, ["h1", ".top-card-layout__title", ".org-top-card-summary__title"])
    );
    const headline = pickFirst(
      textAt($, [
        ".top-card-layout__headline",
        ".org-top-card-summary__tagline",
        ".org-top-card-summary-info-list__info-item"
      ]),
      metaDescription
    );
    const about = pickFirst(
      textAt($, [
        ".core-section-container__content p",
        ".org-about-us-organization-description__text",
        ".show-more-less-html__markup"
      ]),
      typeof orgJsonLd?.description === "string" ? orgJsonLd.description : undefined
    );
    const companyWebsite = pickFirst(
      unwrapLinkedInRedirect(typeof orgJsonLd?.url === "string" ? orgJsonLd.url : undefined),
      unwrapLinkedInRedirect(attrAt($, ['a[data-tracking-control-name="about_website"]'], "href"))
    );
    const industry = pickFirst(
      definitionList.industry,
      textAt($, [".org-page-details__definition-text"])
    );
    const followerCount = pickFirst(definitionList.followers, extractFollowerCount(metaDescription));
    const companySize = pickFirst(definitionList["company size"], definitionList.employees);

    sourceSignals.push(...[name, headline, about, industry, followerCount].filter(Boolean) as string[]);

  return {
    kind: descriptor.kind,
    stableId: descriptor.stableId,
    hostVariant: descriptor.hostVariant,
    trackingParams: descriptor.trackingParams,
    type,
      url: input.url.toString(),
      canonicalUrl,
      access: {
        finalUrl: input.fetchedPage.finalUrl,
        pageTitle: input.fetchedPage.pageTitle,
        isAuthwall: input.fetchedPage.isAuthwall,
        isBlocked: input.fetchedPage.isBlocked,
        expandedActions: input.fetchedPage.expandedActions
      },
      name,
      headline,
      about,
      companyWebsite,
      industry,
      followerCount,
      companySize,
      metaDescription,
      sections,
      sourceSignals,
      notes
    };
  }

  const fallbackName = pickFirst(
    textAt($, ["h1"]),
    normalizeWhitespace($("title").text())
  );

  sourceSignals.push(...[fallbackName, metaDescription].filter(Boolean) as string[]);

  notes.push("URL did not match /in/ or /company/. Result is generic.");

  return {
    type: "unknown",
    url: input.url.toString(),
    canonicalUrl,
    access: {
      finalUrl: input.fetchedPage.finalUrl,
      pageTitle: input.fetchedPage.pageTitle,
      isAuthwall: input.fetchedPage.isAuthwall,
      isBlocked: input.fetchedPage.isBlocked,
      expandedActions: input.fetchedPage.expandedActions
    },
    name: fallbackName,
    metaDescription,
    sections,
    sourceSignals,
    notes
  };
}

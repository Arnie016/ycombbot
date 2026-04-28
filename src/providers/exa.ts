import { load } from "cheerio";
import type { DiscoveryDocument, DiscoveryResult, RawLinkedInEntity } from "../types.js";
import { buildDiscoveryQueries } from "../utils/identity.js";

interface ExaSearchResponse {
  results?: Array<{
    title?: string;
    url?: string;
    publishedDate?: string;
    author?: string;
    text?: string;
  }>;
}

type ExaSearchResult = NonNullable<ExaSearchResponse["results"]>[number];

const BLOCKED_DOMAINS = [
  "chat-prompt.com",
  "aiprm.com",
  "instagram.com",
  "tiktok.com",
  "linktr.ee"
];

const PRIORITY_DOMAIN_SCORES: Array<[RegExp, number]> = [
  [/linkedin\.com$/i, 100],
  [/devpost\.com$/i, 90],
  [/github\.com$/i, 90],
  [/huggingface\.co$/i, 85],
  [/substack\.com$/i, 70],
  [/medium\.com$/i, 60],
  [/edu$/i, 75]
];

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isUsefulUrl(url: string): boolean {
  const hostname = hostnameOf(url);

  if (/linkedin\.com\/(authwall|login|signup)/i.test(url)) {
    return false;
  }

  if (/huggingface\.co\/.+\/(blob|raw|commit)\//i.test(url)) {
    return false;
  }

  if (/github\.com\/.+\/(commit|blob)\//i.test(url)) {
    return false;
  }

  if (/devpost\.com\/project-gallery/i.test(url)) {
    return false;
  }

  if (/devpost\.com\/software\/search/i.test(url)) {
    return false;
  }

  if (/devpost\.com\/[^/?#]+\/achievements/i.test(url)) {
    return false;
  }

  if (/linkedin\.com\/posts\/activity-/i.test(url)) {
    return false;
  }

  return !BLOCKED_DOMAINS.some((domain) => hostname.endsWith(domain));
}

function scoreDocument(document: DiscoveryDocument): number {
  const hostname = hostnameOf(document.url);
  let score = 0;

  for (const [pattern, weight] of PRIORITY_DOMAIN_SCORES) {
    if (pattern.test(hostname)) {
      score += weight;
      break;
    }
  }

  if (/project|startup|portfolio|profile|post|demo|hackathon/i.test(document.title)) {
    score += 15;
  }

  if (/winner|won|award|prize|1st place|first place/i.test(`${document.title} ${document.excerpt ?? ""}`)) {
    score += 22;
  }

  if (/student|university|school|college|research/i.test(`${document.title} ${document.excerpt ?? ""}`)) {
    score += 18;
  }

  if (/github\.com\/[^/]+\/[^/]+/i.test(document.url) || /huggingface\.co\/[^/]+\/[^/]+/i.test(document.url)) {
    score += 18;
  }

  if (document.excerpt) {
    score += Math.min(15, Math.floor(document.excerpt.length / 80));
  }

  return score;
}

function normalizeDocument(result: ExaSearchResult): DiscoveryDocument | undefined {
  if (!result?.url || !result.title || !isUsefulUrl(result.url)) {
    return undefined;
  }

  return {
    title: result.title,
    url: result.url,
    publishedDate: result.publishedDate,
    author: result.author,
    excerpt: result.text?.slice(0, 800),
    sourceType: "exa"
  };
}

async function fetchHtml(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!response.ok) {
      return undefined;
    }

    return await response.text();
  } catch {
    return undefined;
  }
}

function absoluteUrl(baseUrl: string, href: string | undefined): string | undefined {
  if (!href) {
    return undefined;
  }

  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function cleanText(value: string | undefined): string | undefined {
  return value?.replace(/\s+/g, " ").trim() || undefined;
}

async function expandDevpostPortfolio(url: string): Promise<DiscoveryDocument[]> {
  const html = await fetchHtml(url);
  if (!html) {
    return [];
  }

  const $ = load(html);
  const docs: DiscoveryDocument[] = [];
  const seen = new Set<string>();
  const profileDescription = cleanText($('meta[name="description"]').attr("content"));

  if (profileDescription) {
    docs.push({
      title: cleanText($('meta[property="og:title"]').attr("content")) || "Devpost profile",
      url,
      excerpt: profileDescription,
      sourceType: "exa"
    });
  }

  const projectUrls = new Set<string>();
  $('a[href*="/software/"]').each((_, element) => {
    const resolved = absoluteUrl(url, $(element).attr("href"));
    if (resolved && /devpost\.com\/software\/[^/?#]+/i.test(resolved) && !/built-with/i.test(resolved)) {
      projectUrls.add(resolved.split("?")[0]);
    }
  });

  for (const projectUrl of [...projectUrls].slice(0, 6)) {
    const projectHtml = await fetchHtml(projectUrl);
    if (!projectHtml || seen.has(projectUrl)) {
      continue;
    }

    seen.add(projectUrl);
    const project$ = load(projectHtml);
    const title = cleanText(project$('meta[property="og:title"]').attr("content")) || cleanText(project$("title").text());
    const excerpt = cleanText(project$('meta[property="og:description"]').attr("content"))
      || cleanText(project$('meta[name="description"]').attr("content"));

    if (!title) {
      continue;
    }

    docs.push({
      title,
      url: projectUrl,
      excerpt,
      sourceType: "exa"
    });
  }

  return docs;
}

async function expandGitHubProfile(url: string): Promise<DiscoveryDocument[]> {
  const html = await fetchHtml(url);
  if (!html) {
    return [];
  }

  const $ = load(html);
  const docs: DiscoveryDocument[] = [];
  const seen = new Set<string>();
  const profileDescription = cleanText($('meta[name="description"]').attr("content"));

  if (profileDescription) {
    docs.push({
      title: cleanText($("title").text()) || "GitHub profile",
      url,
      excerpt: profileDescription,
      sourceType: "exa"
    });
  }

  $("div.pinned-item-list-item-content").each((_, element) => {
    if (docs.length >= 7) {
      return false;
    }

    const repoPath = $(element).find('a[href^="/"]').first().attr("href");
    const repoUrl = absoluteUrl(url, repoPath);
    const title = cleanText($(element).find("span.repo").first().text());
    const excerpt = cleanText($(element).find("p.pinned-item-desc").first().text());

    if (!repoUrl || !title || seen.has(repoUrl)) {
      return;
    }

    seen.add(repoUrl);
    docs.push({
      title,
      url: repoUrl,
      excerpt,
      sourceType: "exa"
    });
  });

  return docs;
}

async function expandPublicProfile(document: DiscoveryDocument): Promise<DiscoveryDocument[]> {
  if (/devpost\.com\/[^/?#]+$/i.test(document.url) && !/devpost\.com\/software\//i.test(document.url)) {
    return expandDevpostPortfolio(document.url);
  }

  if (/github\.com\/[^/]+$/i.test(document.url)) {
    return expandGitHubProfile(document.url);
  }

  return [];
}

function looksAnchoredToPerson(document: DiscoveryDocument, anchorName?: string): boolean {
  if (!anchorName) {
    return true;
  }

  const haystack = `${document.title} ${document.excerpt ?? ""}`.toLowerCase();
  const tokens = anchorName.toLowerCase().split(/\s+/).filter((token) => token.length >= 3);
  const tokenMatches = tokens.filter((token) => haystack.includes(token)).length;

  if (tokenMatches >= Math.min(2, tokens.length)) {
    return true;
  }

  if (/devpost\.com\/(software\/|[^/?#]+$)/i.test(document.url) || /github\.com\/[^/]+(\/[^/]+)?$/i.test(document.url) || /huggingface\.co\/[^/]+(\/[^/]+)?$/i.test(document.url)) {
    return tokenMatches >= 1;
  }

  return false;
}

function includesExactSlug(document: DiscoveryDocument, slug: string | undefined): boolean {
  if (!slug) {
    return false;
  }

  const haystack = `${document.url} ${document.title} ${document.excerpt ?? ""}`.toLowerCase();
  const escapedSlug = slug.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escapedSlug}([^a-z0-9]|$)`, "i").test(haystack);
}

export async function discoverPublicProfileEvidence(entity: RawLinkedInEntity): Promise<DiscoveryResult | undefined> {
  const apiKey = process.env.EXA_API_KEY;

  if (!apiKey) {
    return undefined;
  }

  const queryHints = buildDiscoveryQueries(entity);
  const anchorName = entity.name;
  const exactSlug = entity.name ? undefined : entity.stableId;
  const documents = new Map<string, DiscoveryDocument>();
  const notes: string[] = [];

  const responses = await Promise.all(queryHints.map(async (query) => {
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: 5,
        text: true,
        includeText: anchorName ? [anchorName] : undefined,
        excludeDomains: BLOCKED_DOMAINS
      })
    });

    if (!response.ok) {
      return {
        query,
        error: `Exa search failed for query ${query} with status ${response.status}.`
      };
    }

    return {
      query,
      payload: await response.json() as ExaSearchResponse
    };
  }));

  for (const response of responses) {
    if (response.error) {
      notes.push(response.error);
      continue;
    }

    if (!response.payload) {
      continue;
    }

    for (const result of response.payload.results ?? []) {
      const document = normalizeDocument(result);
      if (
        document
        && looksAnchoredToPerson(document, anchorName)
        && (!exactSlug || includesExactSlug(document, exactSlug))
      ) {
        documents.set(document.url, document);
      }
    }
  }

  const expandable = [...documents.values()].filter((document) =>
    /devpost\.com\/[^/?#]+$/i.test(document.url) || /github\.com\/[^/]+$/i.test(document.url)
  );

  const expansions = await Promise.all(expandable.map((document) => expandPublicProfile(document)));
  for (const expandedDocuments of expansions) {
    for (const document of expandedDocuments) {
      if (
        isUsefulUrl(document.url)
        && looksAnchoredToPerson(document, anchorName)
        && (!exactSlug || includesExactSlug(document, exactSlug))
      ) {
        documents.set(document.url, document);
      }
    }
  }

  return {
    provider: "exa",
    queryHints,
    documents: [...documents.values()]
      .sort((left, right) => scoreDocument(right) - scoreDocument(left))
      .slice(0, 16),
    notes
  };
}

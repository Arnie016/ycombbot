import type {
  InsightBullet,
  NetworkingSummary,
  OutreachDraft,
  ProductContext,
  RawLinkedInEntity,
  ScrapeResponse
} from "../types.js";
import { normalizeWhitespace, truncate } from "../utils/linkedin.js";

const STOPWORDS = new Set([
  "and",
  "about",
  "after",
  "also",
  "another",
  "because",
  "briefs",
  "build",
  "company",
  "does",
  "each",
  "first",
  "from",
  "have",
  "into",
  "just",
  "more",
  "most",
  "other",
  "over",
  "people",
  "product",
  "profiles",
  "public",
  "reply",
  "same",
  "that",
  "their",
  "there",
  "these",
  "this",
  "turns",
  "very",
  "want",
  "with",
  "your"
]);

function tokenize(values: Array<string | undefined>): string[] {
  return values
    .flatMap((value) => (value ?? "").toLowerCase().split(/[^a-z0-9+.#-]+/))
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function detectSeniority(value: string | undefined): string {
  const text = (value ?? "").toLowerCase();

  if (/(founder|ceo|co-founder|chief|vp|vice president|head of|director|partner)/.test(text)) {
    return "senior";
  }

  if (/(lead|principal|manager|staff|owner)/.test(text)) {
    return "mid-senior";
  }

  return "individual";
}

function fitKeywords(entity: RawLinkedInEntity, product: ProductContext): string[] {
  const haystack = tokenize([
    entity.name,
    entity.headline,
    entity.about,
    entity.currentCompany,
    entity.industry,
    entity.metaDescription
  ]);
  const productTokens = tokenize([
    product.productName,
    product.productSummary,
    ...(product.productKeywords ?? [])
  ]);

  const matches = new Set<string>();

  for (const token of productTokens) {
    if (haystack.includes(token)) {
      matches.add(token);
    }
  }

  return [...matches];
}

function pickSectionExcerpt(entity: RawLinkedInEntity, keys: string[]): string | undefined {
  for (const key of keys) {
    const match = entity.sections.find((section) => section.key === key && section.excerpt);
    if (match?.excerpt) {
      return match.excerpt;
    }
  }

  return undefined;
}

function personBullets(entity: RawLinkedInEntity, product: ProductContext): InsightBullet[] {
  const deepExcerpt = pickSectionExcerpt(entity, [
    "experience",
    "education",
    "certifications",
    "activity",
    "skills"
  ]);

  if (entity.access.isAuthwall && !entity.headline && !entity.about && !deepExcerpt) {
    return [
      {
        title: "Public access is gated",
        detail: "LinkedIn redirected this profile to authwall, so deep sections like education, activity, and certifications were not publicly reachable.",
        confidence: "high"
      },
      {
        title: "What you can trust right now",
        detail: entity.metaDescription ?? "Only a shallow public shell is visible without additional source material.",
        confidence: entity.metaDescription ? "medium" : "low"
      },
      {
        title: "What to collect next",
        detail: "Ask for a profile PDF, exported resume, or copied section text for experience, education, certifications, and recent activity.",
        confidence: "high"
      }
    ];
  }

  const seniority = detectSeniority(entity.headline);
  const matchedKeywords = fitKeywords(entity, product);
  const roleLine = [entity.headline, entity.currentCompany ? `at ${entity.currentCompany}` : undefined]
    .filter(Boolean)
    .join(" ");
  const currentRole = roleLine || entity.metaDescription || "Current role is partially visible on the public page.";
  const fitLine = matchedKeywords.length > 0
    ? `Profile language overlaps with ${matchedKeywords.slice(0, 3).join(", ")}.`
    : "Profile suggests relevant domain context, but product-specific overlap is weak on the public page.";
  const evidenceLine = entity.about
    ? truncate(entity.about, 180)
    : deepExcerpt
      ? truncate(deepExcerpt, 180)
      : fitLine;
  const networkingAngle = matchedKeywords.length > 0
    ? `Lead with the ${matchedKeywords[0]} angle and make the ask concrete in one sentence.`
    : entity.access.isAuthwall
      ? "Before outreach, collect one stronger signal from their resume, portfolio, or copied LinkedIn sections."
    : "Lead with a crisp reason for reaching out, then ask for one specific next step.";

  return [
    {
      title: "Current role and decision level",
      detail: seniority === "senior"
        ? `${currentRole} This looks like a senior decision-maker or sponsor.`
        : `${currentRole} This looks closer to an operator or individual contributor.`,
      confidence: entity.headline ? "high" : "medium"
    },
    {
      title: "Why they are relevant",
      detail: `${evidenceLine} ${fitLine}`,
      confidence: entity.about || deepExcerpt ? "high" : "medium"
    },
    {
      title: "Best networking angle",
      detail: networkingAngle,
      confidence: matchedKeywords.length > 0 ? "high" : "medium"
    }
  ];
}

function companyBullets(entity: RawLinkedInEntity, product: ProductContext): InsightBullet[] {
  const matchedKeywords = fitKeywords(entity, product);
  const whatTheyDo = entity.about || entity.headline || entity.metaDescription || "Company summary is partial on the public page.";
  const targetSignal = [
    entity.industry ? `Industry: ${entity.industry}.` : undefined,
    entity.followerCount ? `Followers: ${entity.followerCount}.` : undefined,
    entity.companySize ? `Size: ${entity.companySize}.` : undefined
  ]
    .filter(Boolean)
    .join(" ");
  const fitLine = matchedKeywords.length > 0
    ? `Your product language overlaps with ${matchedKeywords.slice(0, 3).join(", ")}.`
    : `Use the company page to infer the likely buyer, then personalize around a concrete workflow pain.`;

  return [
    {
      title: "What the company does",
      detail: truncate(whatTheyDo, 200),
      confidence: entity.about || entity.headline ? "high" : "medium"
    },
    {
      title: "Why this company is worth targeting",
      detail: targetSignal || "Public company detail is limited, so treat this as a lightweight prospecting snapshot.",
      confidence: targetSignal ? "medium" : "low"
    },
    {
      title: "Best intro angle",
      detail: fitLine,
      confidence: matchedKeywords.length > 0 ? "high" : "medium"
    }
  ];
}

function buildNetworkingSummary(entity: RawLinkedInEntity, bullets: InsightBullet[], product: ProductContext): NetworkingSummary {
  const matches = fitKeywords(entity, product);
  const seniorityBoost = detectSeniority(entity.headline) === "senior" ? 20 : 8;
  const aboutBoost = entity.about ? 15 : 0;
  const companyBoost = entity.followerCount || entity.companySize ? 10 : 0;
  const score = Math.min(100, 35 + seniorityBoost + aboutBoost + companyBoost + matches.length * 8);

  return {
    score,
    whyThisMatters: bullets[1]?.detail ?? "Public signals were limited.",
    recommendedAngle: bullets[2]?.detail ?? "Keep the first message specific and short."
  };
}

function buildOutreachDraft(entity: RawLinkedInEntity, bullets: InsightBullet[], product: ProductContext): OutreachDraft {
  const introTarget = entity.name ?? "this profile";
  const openerReason = (bullets[1]?.detail ?? "there looks to be a strong fit").replace(/[.!\s]+$/g, "");
  const opener = product.productName
    ? `Saw your LinkedIn and thought ${product.productName} might be relevant because ${openerReason.toLowerCase()}.`
    : `Saw your LinkedIn and reached out because ${openerReason.toLowerCase()}.`;
  const shareText = `${introTarget}\n1. ${bullets[0]?.detail ?? "Role data is partial."}\n2. ${bullets[1]?.detail ?? "Fit data is partial."}\n3. ${bullets[2]?.detail ?? "Outreach angle is generic."}`;

  return {
    opener: truncate(opener, 280),
    shareText: truncate(shareText, 700)
  };
}

export function deriveInsights(entity: RawLinkedInEntity, product: ProductContext): ScrapeResponse {
  const normalizedProduct: ProductContext = {
    productName: normalizeWhitespace(product.productName),
    productSummary: normalizeWhitespace(product.productSummary),
    productKeywords: (product.productKeywords ?? []).map((item) => item.trim()).filter(Boolean)
  };

  const topThree = entity.type === "company"
    ? companyBullets(entity, normalizedProduct)
    : personBullets(entity, normalizedProduct);

  return {
    scrapedAt: new Date().toISOString(),
    entity,
    topThree,
    networking: buildNetworkingSummary(entity, topThree, normalizedProduct),
    outreach: buildOutreachDraft(entity, topThree, normalizedProduct)
  };
}

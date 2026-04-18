import type {
  CurrentIdentity,
  DiscoveryResult,
  ProjectHighlight,
  RawLinkedInEntity,
  StrongestSignal,
  StructuredProfile
} from "../types.js";
import { guessNameFromLinkedInUrl } from "../utils/identity.js";

interface OpenAIChoiceResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

function fillFallbackBestFootForward(
  profile: StructuredProfile,
  discovery?: DiscoveryResult
): StructuredProfile {
  const normalizedProfile: StructuredProfile = {
    bestFootForward: profile.bestFootForward ?? "",
    currentIdentity: profile.currentIdentity,
    whatTheyreAbout: profile.whatTheyreAbout,
    topThreeThings: profile.topThreeThings ?? [],
    coreStrengths: profile.coreStrengths ?? [],
    credibilitySignals: profile.credibilitySignals ?? [],
    strongestSignalsDetailed: profile.strongestSignalsDetailed ?? [],
    projectHighlights: profile.projectHighlights ?? [],
    externalProfiles: profile.externalProfiles ?? [],
    bestIntroAngle: profile.bestIntroAngle
  };

  if (normalizedProfile.bestFootForward.trim()) {
    return normalizedProfile;
  }

  const topDocs = (discovery?.documents ?? []).slice(0, 3);

  if (!topDocs.length) {
    return normalizedProfile;
  }

  const summary = topDocs
    .map((document) => document.title)
    .join("; ");

  const externalProfiles = normalizedProfile.externalProfiles.length > 0
    ? normalizedProfile.externalProfiles
    : topDocs.map((document) => document.url);

  return {
    ...normalizedProfile,
    bestFootForward: `Public footprint suggests strong signals around ${summary}.`,
    topThreeThings: normalizedProfile.topThreeThings.length > 0 ? normalizedProfile.topThreeThings : topDocs.map((document) => cleanTitle(document.title)).slice(0, 3),
    externalProfiles
  };
}

function cleanTitle(value: string): string {
  return value
    .replace(/^https?:\/\/\S+$/i, "")
    .replace(/\s*\|\s*linkedin.*$/i, "")
    .replace(/\s*-\s*linkedin$/i, "")
    .replace(/\s*\|\s*devpost.*$/i, "")
    .replace(/\s*posted.*$/i, "")
    .replace(/^[A-Z][\w\s'.-]+’s Post$/i, "LinkedIn build post")
    .replace(/[·•]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function looksRelevantToPerson(title: string, url: string, anchorName?: string): boolean {
  if (/project gallery|premier accelerator-backed/i.test(title)) {
    return false;
  }

  if (/github\.com\/[^/]+\/[^/]+/i.test(url) || /huggingface\.co\/[^/]+\/[^/]+/i.test(url)) {
    return true;
  }

  if (/devpost\.com/i.test(url)) {
    return true;
  }

  if (/linkedin\.com\/posts\//i.test(url)) {
    return anchorName ? new RegExp(anchorName.replace(/\s+/g, "\\s+"), "i").test(title) : true;
  }

  return false;
}

function firstMatch(texts: string[], patterns: RegExp[]): string | undefined {
  for (const text of texts) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
  }

  return undefined;
}

function inferCurrentIdentity(entity: RawLinkedInEntity, discovery?: DiscoveryResult): CurrentIdentity | undefined {
  const texts = [
    entity.headline ?? "",
    entity.about ?? "",
    entity.metaDescription ?? "",
    ...(discovery?.documents ?? []).flatMap((document) => [document.title, document.excerpt ?? ""])
  ].filter(Boolean);

  const organization = firstMatch(texts, [
    /student at ([^.|\n]+)/i,
    /(?:founder|engineer|developer|researcher|designer|builder) at ([^.|\n]+)/i,
    /at ([A-Z][^.|,\n]{2,60})/i
  ]) ?? entity.currentCompany;

  const currentRole = firstMatch(texts, [
    /\b(founder|co-founder|engineer|developer|researcher|designer|builder|student)\b/i
  ]) ?? entity.headline;

  const workOrStudy = firstMatch(texts, [
    /(student at [^.|\n]+)/i,
    /((?:founder|engineer|developer|researcher|designer|builder) at [^.|\n]+)/i
  ]) ?? (entity.headline || organization || "");

  const school = firstMatch(texts, [
    /\b([A-Z][A-Za-z&.\- ]+(?:University|College|School|Institute|Polytechnic))\b/i,
    /\b(NUS|Stanford|SMU|MIT|CMU|SUTD|NTU)\b/i
  ]);

  const badOrganization = organization && /\b(linkedin|hugging face|devpost|github)\b/i.test(organization);
  const eventLikeOrganization = organization && /\b(hackathon|placed|winner|award|built)\b/i.test(organization);
  const normalizedOrganization = badOrganization || eventLikeOrganization ? undefined : organization;

  if (!workOrStudy && !normalizedOrganization && !school) {
    return undefined;
  }

  return {
    workOrStudy: school
      ? `Student at ${school}`
      : (badOrganization || eventLikeOrganization)
        ? "Not confidently inferable from public sources."
        : workOrStudy || "Not confidently inferable from public sources.",
    currentRole: currentRole || (school ? "Student" : "Not confidently inferable"),
    organization: normalizedOrganization || school || "Not confidently inferable",
    location: entity.location || "",
    confidence: school || normalizedOrganization ? "medium" : "low"
  };
}

function strongestSignalsFromDiscovery(discovery?: DiscoveryResult): StrongestSignal[] {
  const signals: StrongestSignal[] = [];

  for (const document of discovery?.documents ?? []) {
    const title = cleanTitle(document.title);
    const text = `${document.title} ${document.excerpt ?? ""}`;

    if (/winner|won|award|prize|1st place|first place|2nd place|second place|placed 2nd|placed 1st|placed 3rd/i.test(text)) {
      signals.push({
        signal: title,
        proof: document.url
      });
      continue;
    }

    if (/devpost\.com|huggingface\.co\/[^/]+\/[^/]+|github\.com\/[^/]+\/[^/]+/i.test(document.url)) {
      signals.push({
        signal: title,
        proof: document.url
      });
    }

    if (signals.length >= 5) {
      break;
    }
  }

  return signals.slice(0, 4);
}

function projectHighlightsFromDiscovery(discovery?: DiscoveryResult): ProjectHighlight[] {
  const documents = discovery?.documents ?? [];
  const highlights: ProjectHighlight[] = [];
  const anchorName = discovery?.documents.find((document) => /linkedin\.com\/in\//i.test(document.url))?.title?.split("|")[0]?.trim();
  const preferred = [...documents].sort((left, right) => {
    const score = (document: typeof left) => {
      if (/devpost\.com\/software\//i.test(document.url)) return 110;
      if (/devpost\.com/i.test(document.url)) return 95;
      if (/huggingface\.co\/[^/]+\/[^/]+/i.test(document.url)) return 95;
      if (/github\.com\/[^/]+\/[^/]+/i.test(document.url)) return 90;
      if (/github\.com\/[^/]+$/i.test(document.url)) return 75;
      if (/linkedin\.com\/posts\//i.test(document.url)) return 70;
      return 0;
    };

    return score(right) - score(left);
  });

  for (const document of preferred) {
    if (highlights.length >= 3) {
      break;
    }

    if (!/devpost\.com|huggingface\.co|github\.com|linkedin\.com\/posts\//i.test(document.url)) {
      continue;
    }

    if (!looksRelevantToPerson(document.title, document.url, anchorName)) {
      continue;
    }

    const text = `${document.title} ${document.excerpt ?? ""}`;
    const techStack = [];

    if (/openai|ai|gpt|llm/i.test(text)) {
      techStack.push("AI");
    }
    if (/github|repo|commit|open source/i.test(text)) {
      techStack.push("Open source");
    }
    if (/gradio/i.test(text)) {
      techStack.push("Gradio");
    }
    if (/hugging ?face/i.test(text)) {
      techStack.push("Hugging Face");
    }
    if (/mcp|hackathon/i.test(text)) {
      techStack.push("Hackathon build");
    }

    let summary = document.excerpt?.slice(0, 180) || `Public project evidence found on ${new URL(document.url).hostname.replace(/^www\./, "")}.`;

    if (/devpost\.com/i.test(document.url)) {
      summary = /\/software\//i.test(document.url)
        ? "Public hackathon project page on Devpost."
        : "Public hackathon portfolio and shipped project history on Devpost.";
    } else if (/huggingface\.co/i.test(document.url)) {
      summary = "Public AI model or artifact on Hugging Face, suggesting hands-on model work.";
    } else if (/github\.com\/[^/]+$/i.test(document.url)) {
      summary = "Public GitHub profile with multiple repositories and pinned technical projects.";
    } else if (/linkedin\.com\/posts\//i.test(document.url) && /mcp|hackathon|award|won/i.test(text)) {
      summary = "Public LinkedIn post showing a hackathon build or award result.";
    }

    highlights.push({
      name: cleanTitle(document.title),
      summary,
      techStack,
      evidence: [cleanTitle(document.title)],
      sourceUrls: [document.url],
      credibilityScore: techStack.length >= 2 ? 8 : 6
    });
  }

  return highlights;
}

function heuristicStructuredProfile(
  entity: RawLinkedInEntity,
  discovery?: DiscoveryResult
): StructuredProfile | undefined {
  const documents = discovery?.documents ?? [];
  const anchorName = entity.name ?? guessNameFromLinkedInUrl(entity.url);

  if (!documents.length) {
    return undefined;
  }

  const topDocs = documents.slice(0, 3);
  const profileUrls = documents
    .map((document) => document.url)
    .filter((url) => /(github\.com|devpost\.com|huggingface\.co|linkedin\.com\/in\/)/i.test(url))
    .slice(0, 6);

  const strengths = new Set<string>();

  for (const document of documents) {
    const text = `${document.title} ${document.excerpt ?? ""}`.toLowerCase();

    if (/hackathon|mcp|project|demo|build|app/i.test(text)) {
      strengths.add("Project shipping");
    }

    if (/github|commit|repo|open source/i.test(text)) {
      strengths.add("Public technical work");
    }

    if (/huggingface|model|space|ai|openai/i.test(text)) {
      strengths.add("AI prototyping");
    }

    if (/university|college|school|institute|polytechnic|\bnus\b|\bmit\b|\bcmu\b|\bntu\b|\bsmu\b|\bsutd\b/i.test(text)) {
      strengths.add("Academic and builder credibility");
    }
  }

  const strengthsList = [...strengths].slice(0, 3);
  const currentIdentity = inferCurrentIdentity(entity, discovery);
  const projectHighlights = projectHighlightsFromDiscovery(discovery);
  const strongestSignalsDetailed = strongestSignalsFromDiscovery(discovery);
  const topThreeThings = [...new Set([
    currentIdentity?.workOrStudy && !/not confidently inferable/i.test(currentIdentity.workOrStudy)
      ? currentIdentity.workOrStudy
      : undefined,
    ...projectHighlights.map((project) => project.name),
    ...strongestSignalsDetailed.map((item) => item.signal)
  ].filter(Boolean) as string[])].slice(0, 3);
  const bestFootForward = projectHighlights.length > 0
    ? `Public evidence points to hands-on work around ${projectHighlights.map((project) => project.name).slice(0, 2).join(" and ")}.`
    : strengthsList.length > 0
      ? `Public footprint shows ${strengthsList.join(", ").toLowerCase()}.`
      : `Public footprint suggests strong signals around ${topDocs.map((document) => cleanTitle(document.title)).join("; ")}.`;

  return {
    bestFootForward,
    currentIdentity,
    whatTheyreAbout: projectHighlights[0]
      ? `Appears to be building around ${projectHighlights.map((project) => project.name).slice(0, 2).join(" and ")}.`
      : undefined,
    topThreeThings,
    coreStrengths: [...strengths].slice(0, 4),
    credibilitySignals: topDocs.map((document) => cleanTitle(document.title)),
    strongestSignalsDetailed,
    projectHighlights,
    externalProfiles: profileUrls.length > 0 ? profileUrls : [entity.url]
      ,
    bestIntroAngle: projectHighlights[0]
      ? `Lead with ${projectHighlights[0].name} and ask what they are building next.`
      : undefined
  };
}

const structuredProfileSchema = {
  name: "structured_profile",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      bestFootForward: { type: "string" },
      currentIdentity: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              workOrStudy: { type: "string" },
              currentRole: { type: "string" },
              organization: { type: "string" },
              location: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] }
            },
            required: ["workOrStudy", "currentRole", "organization", "location", "confidence"]
          },
          { type: "null" }
        ]
      },
      whatTheyreAbout: { type: "string" },
      topThreeThings: {
        type: "array",
        items: { type: "string" }
      },
      coreStrengths: {
        type: "array",
        items: { type: "string" }
      },
      credibilitySignals: {
        type: "array",
        items: { type: "string" }
      },
      strongestSignalsDetailed: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            signal: { type: "string" },
            proof: { type: "string" }
          },
          required: ["signal", "proof"]
        }
      },
      projectHighlights: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            summary: { type: "string" },
            techStack: {
              type: "array",
              items: { type: "string" }
            },
            evidence: {
              type: "array",
              items: { type: "string" }
            },
            sourceUrls: {
              type: "array",
              items: { type: "string" }
            },
            credibilityScore: { type: "number" }
          },
          required: ["name", "summary", "techStack", "evidence", "sourceUrls", "credibilityScore"]
        }
      },
      externalProfiles: {
        type: "array",
        items: { type: "string" }
      },
      bestIntroAngle: { type: "string" }
    },
    required: [
      "bestFootForward",
      "currentIdentity",
      "whatTheyreAbout",
      "topThreeThings",
      "coreStrengths",
      "credibilitySignals",
      "strongestSignalsDetailed",
      "projectHighlights",
      "externalProfiles",
      "bestIntroAngle"
    ]
  }
} as const;

function buildEvidenceBlock(entity: RawLinkedInEntity, discovery?: DiscoveryResult): string {
  const lines = [
    `LinkedIn URL: ${entity.url}`,
    `LinkedIn access final URL: ${entity.access.finalUrl}`,
    `LinkedIn authwall: ${entity.access.isAuthwall}`,
    `Name: ${entity.name ?? ""}`,
    `Headline: ${entity.headline ?? ""}`,
    `Location: ${entity.location ?? ""}`,
    `About: ${entity.about ?? ""}`,
    `Current company: ${entity.currentCompany ?? ""}`,
    `Notes: ${entity.notes.join(" | ")}`
  ];

  for (const section of entity.sections.slice(0, 8)) {
    lines.push(`LinkedIn section ${section.key}: ${section.excerpt ?? ""}`);
  }

  for (const document of discovery?.documents ?? []) {
    lines.push(`Source: ${document.title} | ${document.url} | ${document.excerpt ?? ""}`);
  }

  return lines.join("\n");
}

function allowedEvidenceUrls(entity: RawLinkedInEntity, discovery?: DiscoveryResult): Set<string> {
  const urls = new Set<string>([
    entity.url,
    entity.canonicalUrl
  ]);

  if (entity.companyWebsite) {
    urls.add(entity.companyWebsite);
  }

  for (const section of entity.sections) {
    urls.add(section.requestedUrl);
    urls.add(section.finalUrl);
  }

  for (const document of discovery?.documents ?? []) {
    urls.add(document.url);
  }

  return urls;
}

function sanitizeProjectHighlights(
  highlights: ProjectHighlight[],
  allowedUrls: Set<string>
): ProjectHighlight[] {
  return highlights.filter((highlight) => {
    if (!highlight.sourceUrls.length) {
      return false;
    }

    return highlight.sourceUrls.every((url) => allowedUrls.has(url));
  });
}

function sanitizeStructuredProfile(
  profile: StructuredProfile,
  entity: RawLinkedInEntity,
  discovery?: DiscoveryResult
): StructuredProfile {
  const allowedUrls = allowedEvidenceUrls(entity, discovery);
  const externalProfiles = (profile.externalProfiles ?? []).filter((url) => allowedUrls.has(url));
  const projectHighlights = sanitizeProjectHighlights(profile.projectHighlights ?? [], allowedUrls);

  return fillFallbackBestFootForward({
    ...profile,
    topThreeThings: profile.topThreeThings ?? [],
    coreStrengths: profile.coreStrengths ?? [],
    credibilitySignals: profile.credibilitySignals ?? [],
    strongestSignalsDetailed: profile.strongestSignalsDetailed ?? [],
    projectHighlights,
    externalProfiles
  }, discovery);
}

export async function synthesizeStructuredProfile(
  entity: RawLinkedInEntity,
  discovery?: DiscoveryResult
): Promise<StructuredProfile | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return undefined;
  }

  if (!discovery?.documents.length && entity.access.isAuthwall) {
    return undefined;
  }

  if (entity.access.isAuthwall) {
    return heuristicStructuredProfile(entity, discovery);
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "Return JSON only. You are a public-footprint researcher for a live networking product. Be concrete, not flattering. Prefer exact nouns: company names, school names, project names, technologies, awards, hackathons, repositories, models, demos. Do not use generic labels like public technical work or project shipping unless paired with specific evidence. Every top skill and strongest signal must be backed by a concrete project, artifact, or public proof. If something is uncertain, say not confidently inferable."
        },
        {
          role: "user",
          content: `Given this LinkedIn anchor and public evidence, extract the most essential, concrete, event-useful information about this person. Focus on current identity, strongest proof of work, and what matters in a founder room.\n\n${buildEvidenceBlock(entity, discovery)}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: structuredProfileSchema
      }
    })
  });

  if (!response.ok) {
    return undefined;
  }

  const payload = await response.json() as OpenAIChoiceResponse;
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    return undefined;
  }

  return sanitizeStructuredProfile(JSON.parse(content) as StructuredProfile, entity, discovery);
}

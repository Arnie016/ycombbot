import type {
  BotAward,
  BotProject,
  BotProfileResponse,
  DiscoveryDocument,
  DiscoveryResult,
  PresentationLink,
  PresentationResult,
  RawLinkedInEntity,
  ScrapeResponse,
  StructuredProfile
} from "../types.js";
import { extractLinkedInSlug, guessNameFromLinkedInUrl } from "../utils/identity.js";

export interface ProfileBuildOptions {
  researchMode?: "strict" | "balanced" | "exploratory";
  maxProjects?: number;
  maxLinks?: number;
  includeWeakSignals?: boolean;
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function classifyLink(url: string): PresentationLink["kind"] {
  if (/github\.com/i.test(url)) {
    return "github";
  }

  if (/linkedin\.com/i.test(url)) {
    return "linkedin";
  }

  if (/devpost\.com|huggingface\.co/i.test(url)) {
    return "project";
  }

  return "portfolio";
}

function linkLabel(url: string, document?: DiscoveryDocument): string {
  if (document?.title) {
    return document.title;
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function cleanProjectName(value: string): string {
  return value
    .replace(/^https?:\/\/\S+$/i, "")
    .replace(/\s*\|\s*linkedin.*$/i, "")
    .replace(/\s*\|\s*devpost.*$/i, "")
    .replace(/\s*posted.*$/i, "")
    .replace(/^[A-Z][\w\s'.-]+(?:’|')s Post$/i, "LinkedIn post")
    .replace(/[·•]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value: string | undefined): string | undefined {
  return value
    ?.replace(/\s+/g, " ")
    .replace(/Sign Up \| LinkedIn/gi, "")
    .trim() || undefined;
}

function sentence(value: string | undefined): string | undefined {
  const trimmed = compactText(value);
  if (!trimmed) {
    return undefined;
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function inferSkillsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const skills: string[] = [];

  const pairs: Array<[RegExp, string]> = [
    [/\btypescript\b/, "TypeScript"],
    [/\bjavascript\b/, "JavaScript"],
    [/\bpython\b/, "Python"],
    [/\breact\b/, "React"],
    [/\bstreamlit\b/, "Streamlit"],
    [/\baws|amazon web services|sagemaker|bedrock|s3\b/, "AWS"],
    [/\blangchain\b/, "LangChain"],
    [/\brag\b/, "RAG"],
    [/\bcomputer vision\b/, "Computer Vision"],
    [/\bnlp|natural language processing\b/, "NLP"],
    [/\bllama\b/, "Llama"],
    [/\bopenai|llm|gpt\b/, "LLMs"],
    [/\bhugging ?face\b/, "Hugging Face"],
    [/\bgradio\b/, "Gradio"],
    [/\bvercel\b/, "Vercel"],
    [/\bhackathon|mcp\b/, "Hackathons"],
    [/\bgithub|repo|commit|open source\b/, "Open source"]
  ];

  for (const [pattern, label] of pairs) {
    if (pattern.test(lower)) {
      skills.push(label);
    }
  }

  return skills;
}

function inferSkillsFromEntity(entity: RawLinkedInEntity): string[] {
  return inferSkillsFromText([
    entity.headline,
    entity.about,
    entity.currentCompany,
    entity.metaDescription,
    ...entity.sourceSignals
  ].filter(Boolean).join(" "));
}

function impressiveProjects(discovery?: DiscoveryResult, options?: ProfileBuildOptions): BotProject[] {
  const docs = discovery?.documents ?? [];
  const researchMode = options?.researchMode ?? "balanced";
  const maxProjects = options?.maxProjects ?? 3;
  const picked = docs.filter((document) =>
    (/devpost\.com\/software\//i.test(document.url)
      || /huggingface\.co\/[^/]+\/[^/]+$/i.test(document.url)
      || /github\.com\/[^/]+\/[^/]+$/i.test(document.url)
      || (researchMode !== "strict" && /linkedin\.com\/posts\//i.test(document.url)))
    && !/project gallery|premier accelerator-backed|software projects from hackathons/i.test(document.title)
  );
  const projects: BotProject[] = [];

  for (const document of picked) {
    if (projects.length >= Math.max(1, maxProjects)) {
      break;
    }

    const title = cleanProjectName(document.title);
    if (!title || /^linkedin post$/i.test(title) && !document.excerpt) {
      continue;
    }

    let whyImpressive = document.excerpt
      ? document.excerpt.slice(0, 220).trim()
      : `Public artifact found on ${new URL(document.url).hostname.replace(/^www\./, "")}.`;

    if (/winner|won|award|1st place|first place|2nd place|second place|placed 2nd|placed 1st|placed 3rd/i.test(`${document.title} ${document.excerpt ?? ""}`)) {
      whyImpressive = document.excerpt?.slice(0, 180).trim()
        || "Public award or winning result tied to this project.";
    } else if (/devpost\.com\/software\//i.test(document.url)) {
      whyImpressive = "Public hackathon project page with concrete build details.";
    } else if (/huggingface\.co/i.test(document.url)) {
      whyImpressive = "Public AI model or artifact showing hands-on technical work.";
    } else if (/github\.com\/[^/]+\/[^/]+$/i.test(document.url)) {
      whyImpressive = "Public repository showing shipped technical work.";
    }

    projects.push({
      name: title,
      whyImpressive,
      skills: inferSkillsFromText(`${document.title} ${document.excerpt ?? ""}`).slice(0, 5),
      sourceUrl: document.url
    });
  }

  return projects;
}

function extractAwards(discovery?: DiscoveryResult): BotAward[] {
  const awards: BotAward[] = [];
  const seen = new Set<string>();

  for (const document of discovery?.documents ?? []) {
    const text = `${document.title} ${document.excerpt ?? ""}`;

    const resultMatch = text.match(/(Winner[^.|;\n]*|Best [^.|\n]*|1st place[^.|;\n]*|First place[^.|;\n]*|2nd place[^.|;\n]*|Second place[^.|;\n]*|placed 2nd[^.|;\n]*|placed 1st[^.|;\n]*|won [^.|\n]*)/i);
    const eventMatch = text.match(/(OpenAI Open Model Hackathon|MCP(?:'s|’s)? 1st Birthday Hackathon|Cursor Hackathon Singapore|Mistral AI Worldwide Hackathon(?: \(SG\))?|TikTok TechJam 2025|Cloud Run Hackathon|AWS AI Agent Global Hackathon|Hack the Track presented by Toyota GR)/i);

    if (!resultMatch && !eventMatch) {
      continue;
    }

    const event = eventMatch?.[1] || cleanProjectName(document.title);
    const result = resultMatch?.[1] || "Award or competition result mentioned in public source.";
    const key = `${event}::${result}`.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    awards.push({
      event,
      result: result.replace(/^won\s+/i, "").trim(),
      sourceUrl: document.url
    });

    if (awards.length >= 4) {
      break;
    }
  }

  return awards;
}

function whatTheyDo(entity: RawLinkedInEntity, structuredProfile?: StructuredProfile, discovery?: DiscoveryResult): string | undefined {
  if (structuredProfile?.whatTheyreAbout) {
    return structuredProfile.whatTheyreAbout;
  }

  const projects = structuredProfile?.projectHighlights?.slice(0, 2) ?? impressiveProjects(discovery, { maxProjects: 2 }).slice(0, 2);
  if (projects.length) {
    const names = projects.map((project) => project.name);
    return names.length > 1
      ? `Builds ${names[0]} and ${names[1]}.`
      : `Builds ${names[0]}.`;
  }

  if (entity.about) {
    return sentence(entity.about);
  }

  return undefined;
}

function fallbackProjects(entity: RawLinkedInEntity): BotProject[] {
  const candidates = [
    ...entity.sections
      .filter((section) => section.excerpt && /project|build|demo|startup|hackathon|research|certif/i.test(section.excerpt))
      .map((section) => ({
        title: cleanProjectName(section.title || section.key),
        detail: compactText(section.excerpt),
        url: section.finalUrl
      })),
    ...entity.sourceSignals
      .filter((signal) => /project|build|demo|startup|hackathon|research|ai|openai|gpt/i.test(signal))
      .map((signal) => ({
        title: cleanProjectName(signal.split(/[|:-]/)[0] || signal),
        detail: compactText(signal),
        url: entity.url
      }))
  ];

  const projects: BotProject[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const key = candidate.title.toLowerCase();

    if (!candidate.title || seen.has(key)) {
      continue;
    }

    seen.add(key);
    projects.push({
      name: candidate.title,
      whyImpressive: candidate.detail || "Public profile evidence suggests meaningful technical work.",
      skills: inferSkillsFromText(`${candidate.title} ${candidate.detail ?? ""}`).slice(0, 4),
      sourceUrl: candidate.url
    });

    if (projects.length >= 3) {
      break;
    }
  }

  return projects;
}

function topSkills(
  presentation: PresentationResult,
  entity: RawLinkedInEntity,
  structuredProfile?: StructuredProfile,
  discovery?: DiscoveryResult
): string[] {
  const skills = [] as string[];

  for (const document of discovery?.documents ?? []) {
    skills.push(...inferSkillsFromText(`${document.title} ${document.excerpt ?? ""}`));
  }

  for (const project of structuredProfile?.projectHighlights ?? []) {
    skills.push(...project.techStack);
  }

  skills.push(...inferSkillsFromEntity(entity));

  return dedupe(skills).slice(0, 8);
}

function inferWorkOrStudy(entity: RawLinkedInEntity, discovery?: DiscoveryResult): string | undefined {
  const texts = [
    [entity.headline, entity.currentCompany].filter(Boolean).join(" "),
    entity.metaDescription,
    ...entity.sourceSignals,
    ...(discovery?.documents ?? []).flatMap((document) => [document.title, document.excerpt])
  ].filter(Boolean) as string[];

  for (const text of texts) {
    const normalized = compactText(text) ?? text;

    const studentMatch = normalized.match(/student at ([^.|\n]+)/i);
    if (studentMatch?.[1]) {
      return `Student at ${studentMatch[1].trim()}`;
    }

    const workMatch = normalized.match(/(?:founder|engineer|developer|researcher|builder|designer) at ([^.|\n]+)/i);
    if (workMatch?.[0]) {
      return workMatch[0].trim();
    }

    const schoolMatch = normalized.match(/\b(NUS|National University of Singapore|Stanford|Y Combinator|Singapore Management University)\b/i);
    if (schoolMatch?.[1]) {
      return schoolMatch[1];
    }
  }

  if (entity.currentCompany && entity.headline) {
    return `${entity.headline} at ${entity.currentCompany}`;
  }

  if (entity.headline) {
    return entity.headline;
  }

  return undefined;
}

function displayName(entity: RawLinkedInEntity, discovery?: DiscoveryResult): string {
  if (entity.name && !/^(sign up|join linkedin|linkedin)$/i.test(entity.name.trim())) {
    return entity.name;
  }

  const fromSlug = guessNameFromLinkedInUrl(entity.url);
  if (fromSlug) {
    return fromSlug;
  }

  const linkedInResult = discovery?.documents.find((document) => /linkedin\.com\/in\//i.test(document.url));
  if (linkedInResult?.title) {
    return linkedInResult.title.split("|")[0]?.trim() || "Unknown profile";
  }

  return "Unknown profile";
}

function subtitle(entity: RawLinkedInEntity, payload: ScrapeResponse): string {
  if (entity.type === "company") {
    return [entity.headline, entity.industry, entity.followerCount].filter(Boolean).join(" · ") || "Public company profile";
  }

  if (entity.headline) {
    return [entity.headline, entity.location].filter(Boolean).join(" · ");
  }

  if (entity.access.isAuthwall) {
    return "LinkedIn authwall, using public footprint fallback";
  }

  return payload.topThree[0]?.detail || "Public profile snapshot";
}

function topSignals(
  payload: ScrapeResponse,
  structuredProfile?: StructuredProfile,
  entity?: RawLinkedInEntity
): string[] {
  const signals = new Set<string>();

  for (const item of structuredProfile?.strongestSignalsDetailed ?? []) {
    signals.add(item.signal);
  }

  for (const bullet of payload.topThree) {
    if (!/public access is gated|what you can trust right now|what to collect next/i.test(bullet.title)) {
      signals.add(bullet.title);
    }
  }

  for (const signal of entity?.sourceSignals ?? []) {
    if (/project|startup|hackathon|research|founder|student|engineer|developer|ai/i.test(signal)) {
      signals.add(compactText(signal) ?? signal);
    }
  }

  return [...signals].slice(0, 5);
}

function bestLinks(
  entity: RawLinkedInEntity,
  discovery?: DiscoveryResult,
  structuredProfile?: StructuredProfile,
  options?: ProfileBuildOptions
): PresentationLink[] {
  const links = new Map<string, PresentationLink>();
  const researchMode = options?.researchMode ?? "balanced";
  const maxLinks = options?.maxLinks ?? 4;
  const priorityUrls = [
    entity.url,
    ...(structuredProfile?.externalProfiles ?? [])
  ];

  for (const url of priorityUrls) {
    links.set(url, {
      label: linkLabel(url),
      url,
      kind: classifyLink(url)
    });
  }

  for (const document of discovery?.documents ?? []) {
    if (links.size >= Math.max(6, maxLinks + 2)) {
      break;
    }

    if (/instagram\.com|tiktok\.com|linktr\.ee/i.test(document.url)) {
      continue;
    }

    if (researchMode === "strict" && /linkedin\.com\/posts\//i.test(document.url)) {
      continue;
    }

    if (!links.has(document.url)) {
      links.set(document.url, {
        label: linkLabel(document.url, document),
        url: document.url,
        kind: classifyLink(document.url)
      });
    }
  }

  return [...links.values()].slice(0, Math.max(1, maxLinks));
}

export function buildPresentation(
  payload: ScrapeResponse,
  discovery?: DiscoveryResult,
  structuredProfile?: StructuredProfile,
  options?: ProfileBuildOptions
): PresentationResult {
  const status = payload.entity.access.isAuthwall
    ? "authwall"
    : payload.entity.access.isBlocked
      ? "partial"
      : "public";

  return {
    displayName: displayName(payload.entity, discovery),
    subtitle: subtitle(payload.entity, payload),
    status,
    summary: sentence(
      structuredProfile?.bestFootForward
      || payload.entity.metaDescription
      || payload.entity.about
      || payload.topThree[1]?.detail
      || payload.networking.whyThisMatters
    ) || "Public profile evidence is limited.",
    topStrengths: (structuredProfile?.coreStrengths ?? []).slice(0, 4),
    topSignals: topSignals(payload, structuredProfile, payload.entity).slice(0, options?.includeWeakSignals ? 6 : 4),
    bestLinks: bestLinks(payload.entity, discovery, structuredProfile, options),
    nextStep: payload.topThree[2]?.detail || payload.networking.recommendedAngle,
    sourceCount: (discovery?.documents.length ?? 0) + payload.entity.sections.length
  };
}

export function buildBotProfile(
  payload: ScrapeResponse,
  discovery?: DiscoveryResult,
  structuredProfile?: StructuredProfile,
  options?: ProfileBuildOptions
): BotProfileResponse {
  const presentation = buildPresentation(payload, discovery, structuredProfile, options);
  const maxProjects = options?.maxProjects ?? 3;
  const maxLinks = options?.maxLinks ?? 4;
  const discoveryProjects = impressiveProjects(discovery, options).slice(0, maxProjects);
  const projects = structuredProfile?.projectHighlights?.length
    ? structuredProfile.projectHighlights.slice(0, maxProjects).map((project) => ({
        name: cleanProjectName(project.name),
        whyImpressive: project.summary,
        skills: dedupe(project.techStack).slice(0, 5),
        sourceUrl: project.sourceUrls[0]
      }))
    : discoveryProjects.length > 0
      ? discoveryProjects
      : fallbackProjects(payload.entity);

  const workOrStudy = inferWorkOrStudy(payload.entity, discovery);

  return {
    name: presentation.displayName,
    slug: extractLinkedInSlug(payload.entity.url),
    headline: payload.entity.headline,
    location: payload.entity.location,
    workOrStudy: structuredProfile?.currentIdentity?.workOrStudy || workOrStudy,
    currentRole: structuredProfile?.currentIdentity?.currentRole,
    organization: structuredProfile?.currentIdentity?.organization,
    status: presentation.status,
    whatTheyDo: whatTheyDo(payload.entity, structuredProfile, discovery),
    awards: extractAwards(discovery),
    impressiveProjects: projects,
    topSkills: topSkills(presentation, payload.entity, structuredProfile, discovery),
    strongestSignals: presentation.topSignals,
    bestIntroAngle: structuredProfile?.bestIntroAngle,
    links: presentation.bestLinks
      .filter((link) => link.kind !== "source")
      .slice(0, maxLinks)
      .map((link) => ({
        label: link.label,
        url: link.url
      })),
    nextStep: presentation.nextStep
  };
}

export function buildBotText(profile: BotProfileResponse): string {
  const lines = [profile.name];

  if (profile.workOrStudy) {
    lines.push(`Work / Study: ${profile.workOrStudy}`);
  } else if (profile.headline) {
    lines.push(`Work / Study: ${profile.headline}`);
  }

  if ((profile.currentRole && !/not confidently inferable/i.test(profile.currentRole))
    || (profile.organization && !/not confidently inferable/i.test(profile.organization))) {
    lines.push(`Role: ${[profile.currentRole, profile.organization].filter(Boolean).join(" @ ")}`);
  }

  lines.push("");
  if (profile.whatTheyDo) {
    lines.push(`What they do: ${profile.whatTheyDo}`);
    lines.push("");
  }

  if (profile.awards.length) {
    lines.push("Awards / Competitions:");
    for (const award of profile.awards.slice(0, 3)) {
      lines.push(`- ${award.event}: ${award.result}`);
    }
    lines.push("");
  }

  if (profile.impressiveProjects.length) {
    lines.push("Top projects:");

    for (const project of profile.impressiveProjects.slice(0, 3)) {
      const skills = project.skills.length ? ` [${project.skills.join(", ")}]` : "";
      lines.push(`- ${project.name}: ${project.whyImpressive}${skills}`);
    }
    lines.push("");
  }

  if (profile.topSkills.length) {
    lines.push(`Top skills: ${profile.topSkills.join(", ")}`);
    lines.push("");
  }

  if (profile.strongestSignals.length) {
    lines.push("Strongest signals:");
    for (const signal of profile.strongestSignals) {
      lines.push(`- ${signal}`);
    }
    lines.push("");
  }

  if (profile.links.length) {
    lines.push("Links:");
    for (const link of profile.links) {
      lines.push(`- ${link.label}: ${link.url}`);
    }
    lines.push("");
  }

  if (profile.bestIntroAngle) {
    lines.push(`Best intro angle: ${profile.bestIntroAngle}`);
  }

  return lines.join("\n").trim();
}

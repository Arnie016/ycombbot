import { enrichPublicArtifact, type PublicArtifactEnrichment } from "./enrichPublicArtifact.js";

export type CollaborationIntent =
  | "feedback"
  | "contributors"
  | "cofounder"
  | "users"
  | "design_partner"
  | "hiring"
  | "internship"
  | "study_group"
  | "showcase";

export interface TelegramRepoShareInput {
  url: string;
  telegram?: {
    groupId?: string;
    messageId?: string;
    userId?: string;
    username?: string;
  };
  projectPitch?: string;
  lookingFor?: string;
  tags?: string[];
  intents?: CollaborationIntent[];
  eventContext?: string;
}

export interface TelegramInlineAction {
  label: string;
  callbackData: string;
  privacy: "public_signal" | "private_dm";
}

export interface TelegramRepoShareCard {
  shareId: string;
  status: "ready" | "unsupported";
  title: string;
  subtitle: string;
  primaryUrl: string;
  projectPitch?: string;
  lookingFor?: string;
  tags: string[];
  intents: CollaborationIntent[];
  eventContext?: string;
  evidenceCount: number;
  identitySafety: {
    canInferPersonIdentity: false;
    note: string;
  };
  shareText: string;
  inlineActions: TelegramInlineAction[];
  consensusPrompts: string[];
  matchSeeds: Array<{
    kind: string;
    value: string;
    confidence: "high" | "medium" | "low";
  }>;
  nextStep: string;
}

export interface TelegramRepoShareResult {
  input: TelegramRepoShareInput;
  enrichment: PublicArtifactEnrichment;
  card: TelegramRepoShareCard;
}

export interface TelegramRepoMatchCandidate {
  shareId: string;
  title: string;
  primaryUrl: string;
  tags?: string[];
  intents?: CollaborationIntent[];
  matchSeeds?: Array<{
    kind: string;
    value: string;
    confidence: "high" | "medium" | "low";
  }>;
  lookingFor?: string;
}

export interface TelegramRepoMatchResult {
  score: number;
  verdict: "strong" | "possible" | "weak";
  reasons: string[];
  introSuggestion: string;
  candidate: TelegramRepoMatchCandidate;
}

const DEFAULT_INTENTS: CollaborationIntent[] = ["showcase", "feedback"];
const MAX_TAGS = 8;
const CALLBACK_PREFIX = "repo_collab";

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9+#.-]+/g, "-").replace(/^-+|-+$/g, "");
}

function uniqueTokens(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const value of values ?? []) {
    const token = normalizeToken(value);
    if (token && !seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }

  return tokens.slice(0, MAX_TAGS);
}

function uniqueIntents(values: CollaborationIntent[] | undefined): CollaborationIntent[] {
  const intents = values?.length ? values : DEFAULT_INTENTS;
  return [...new Set(intents)].slice(0, 5);
}

function stableShareId(url: string): string {
  let hash = 0;
  for (const character of url) {
    hash = Math.imul(31, hash) + character.charCodeAt(0) | 0;
  }

  return `repo_${Math.abs(hash).toString(36)}`;
}

function callback(shareId: string, action: string): string {
  return `${CALLBACK_PREFIX}:${action}:${shareId}`;
}

function buildInlineActions(shareId: string): TelegramInlineAction[] {
  return [
    {
      label: "I can help",
      callbackData: callback(shareId, "help"),
      privacy: "public_signal"
    },
    {
      label: "Want intro",
      callbackData: callback(shareId, "intro"),
      privacy: "private_dm"
    },
    {
      label: "Save repo",
      callbackData: callback(shareId, "save"),
      privacy: "private_dm"
    },
    {
      label: "Find similar",
      callbackData: callback(shareId, "similar"),
      privacy: "private_dm"
    }
  ];
}

function buildConsensusPrompts(intents: CollaborationIntent[]): string[] {
  const prompts = [
    "Is this worth showing to more builders?",
    "Would you use this or give feedback?",
    "Do you know someone who should collaborate on this?"
  ];

  if (intents.includes("hiring") || intents.includes("internship")) {
    prompts.push("Would you refer someone for this opportunity?");
  }

  if (intents.includes("cofounder") || intents.includes("contributors")) {
    prompts.push("Do you know a strong collaborator for this build?");
  }

  return prompts.slice(0, 4);
}

function cleanSentence(value: string | undefined, maxLength: number): string | undefined {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return undefined;
  }

  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trim()}...` : cleaned;
}

function buildShareText(card: {
  title: string;
  subtitle: string;
  projectPitch?: string;
  lookingFor?: string;
  tags: string[];
  primaryUrl: string;
}): string {
  const lines = [
    `Repo/build: ${card.title}`,
    card.subtitle,
    card.projectPitch ? `What it is: ${card.projectPitch}` : undefined,
    card.lookingFor ? `Looking for: ${card.lookingFor}` : undefined,
    card.tags.length ? `Tags: ${card.tags.map((tag) => `#${tag}`).join(" ")}` : undefined,
    "Tap a button if you can help, want an intro, or want similar builders.",
    card.primaryUrl
  ];

  return lines.filter(Boolean).join("\n");
}

function unsupportedCard(input: TelegramRepoShareInput, enrichment: PublicArtifactEnrichment): TelegramRepoShareCard {
  const shareId = stableShareId(enrichment.normalizedUrl);

  return {
    shareId,
    status: "unsupported",
    title: "Unsupported collaboration link",
    subtitle: "Ask for a GitHub, Devpost, Hugging Face, or X/Twitter artifact link.",
    primaryUrl: enrichment.normalizedUrl,
    projectPitch: cleanSentence(input.projectPitch, 240),
    lookingFor: cleanSentence(input.lookingFor, 180),
    tags: uniqueTokens(input.tags),
    intents: uniqueIntents(input.intents),
    eventContext: cleanSentence(input.eventContext, 80),
    evidenceCount: 0,
    identitySafety: {
      canInferPersonIdentity: false,
      note: "This link was not turned into a collaboration card. Do not infer a person from it."
    },
    shareText: "Drop a GitHub repo, Devpost project, Hugging Face artifact, or X/Twitter build post to create a collaboration card.",
    inlineActions: [],
    consensusPrompts: [],
    matchSeeds: [],
    nextStep: "Ask the user for a public build artifact link or a trusted profile link."
  };
}

export function prepareTelegramRepoShare(input: TelegramRepoShareInput): TelegramRepoShareResult {
  const enrichment = enrichPublicArtifact(input.url);
  const artifactCard = enrichment.card;

  if (!artifactCard) {
    return {
      input,
      enrichment,
      card: unsupportedCard(input, enrichment)
    };
  }

  const shareId = stableShareId(artifactCard.primaryUrl);
  const tags = uniqueTokens([
    ...(input.tags ?? []),
    artifactCard.provider,
    artifactCard.objectKind,
    artifactCard.slug ?? "",
    artifactCard.owner ?? ""
  ]);
  const intents = uniqueIntents(input.intents);
  const projectPitch = cleanSentence(input.projectPitch, 240);
  const lookingFor = cleanSentence(input.lookingFor, 180);
  const title = artifactCard.title;
  const subtitle = `${artifactCard.subtitle} shared for collaboration`;
  const shareText = buildShareText({
    title,
    subtitle,
    projectPitch,
    lookingFor,
    tags,
    primaryUrl: artifactCard.primaryUrl
  });

  return {
    input,
    enrichment,
    card: {
      shareId,
      status: "ready",
      title,
      subtitle,
      primaryUrl: artifactCard.primaryUrl,
      projectPitch,
      lookingFor,
      tags,
      intents,
      eventContext: cleanSentence(input.eventContext, 80),
      evidenceCount: artifactCard.evidence.length,
      identitySafety: {
        canInferPersonIdentity: false,
        note: "Repo owners, handles, and project slugs are collaboration signals only; reveal a person only after opt-in."
      },
      shareText,
      inlineActions: buildInlineActions(shareId),
      consensusPrompts: buildConsensusPrompts(intents),
      matchSeeds: artifactCard.matchSeeds,
      nextStep: "Post this card in Telegram with inline actions, then send private matches only to users who opt in."
    }
  };
}

function overlap(left: string[] | undefined, right: string[] | undefined): string[] {
  const rightSet = new Set(uniqueTokens(right));
  return uniqueTokens(left).filter((value) => rightSet.has(value));
}

function complementaryIntent(left: CollaborationIntent[], right: CollaborationIntent[]): string | undefined {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  if (leftSet.has("contributors") && (rightSet.has("feedback") || rightSet.has("showcase"))) {
    return "one side is looking for contributors while the other is open to build feedback or showcasing";
  }

  if (leftSet.has("feedback") && (rightSet.has("users") || rightSet.has("design_partner"))) {
    return "feedback intent lines up with user or design partner discovery";
  }

  if (leftSet.has("internship") && rightSet.has("hiring")) {
    return "internship and hiring intent are complementary";
  }

  if (leftSet.has("cofounder") && rightSet.has("cofounder")) {
    return "both sides are explicitly open to cofounder exploration";
  }

  return undefined;
}

function seedOverlap(
  left: TelegramRepoShareCard,
  right: TelegramRepoMatchCandidate
): string[] {
  const rightSeeds = new Set((right.matchSeeds ?? []).map((seed) => `${seed.kind}:${seed.value}`));
  return left.matchSeeds
    .map((seed) => `${seed.kind}:${seed.value}`)
    .filter((seed) => rightSeeds.has(seed));
}

export function scoreTelegramRepoMatch(
  source: TelegramRepoShareCard,
  candidate: TelegramRepoMatchCandidate
): TelegramRepoMatchResult {
  const reasons: string[] = [];
  let score = 0;

  const sharedTags = overlap(source.tags, candidate.tags);
  if (sharedTags.length) {
    score += Math.min(40, sharedTags.length * 12);
    reasons.push(`shared tags: ${sharedTags.map((tag) => `#${tag}`).join(" ")}`);
  }

  const sourceIntents = source.intents;
  const candidateIntents = uniqueIntents(candidate.intents);
  const sameIntents = sourceIntents.filter((intent) => candidateIntents.includes(intent));
  if (sameIntents.length) {
    score += Math.min(25, sameIntents.length * 8);
    reasons.push(`same collaboration intent: ${sameIntents.join(", ")}`);
  }

  const complementary = complementaryIntent(sourceIntents, candidateIntents);
  if (complementary) {
    score += 22;
    reasons.push(complementary);
  }

  const sharedSeeds = seedOverlap(source, candidate);
  if (sharedSeeds.length) {
    score += Math.min(18, sharedSeeds.length * 6);
    reasons.push("similar public artifact signals");
  }

  if (candidate.lookingFor && source.lookingFor) {
    score += 8;
    reasons.push("both cards state what kind of collaboration they want");
  }

  const cappedScore = Math.min(100, score);
  const verdict = cappedScore >= 65 ? "strong" : cappedScore >= 35 ? "possible" : "weak";
  const introSuggestion = verdict === "weak"
    ? `Ask what they are building around ${candidate.title} before suggesting a collaboration.`
    : `Hey, I saw ${candidate.title} and your ${source.title} card. You both seem aligned on ${sharedTags[0] ? `#${sharedTags[0]}` : "building in a similar direction"} - want to compare notes?`;

  return {
    score: cappedScore,
    verdict,
    reasons: reasons.length ? reasons : ["not enough overlap yet; collect more tags, intents, or feedback"],
    introSuggestion,
    candidate
  };
}

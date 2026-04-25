import type { IntakeObjectKind, ProfileProvider, ProfileUrlIntake } from "../utils/profileIntake.js";
import { classifyProfileUrl } from "../utils/profileIntake.js";

export type ArtifactEvidenceSource = "url";

export interface ArtifactEvidenceItem {
  field: string;
  value: string;
  source: ArtifactEvidenceSource;
  confidence: "high" | "medium" | "low";
  note: string;
}

export interface ArtifactMatchSeed {
  kind: "provider" | "artifact_kind" | "owner" | "handle" | "project_slug" | "profile_url";
  value: string;
  confidence: "high" | "medium" | "low";
}

export interface PublicArtifactCard {
  provider: ProfileProvider;
  objectKind: IntakeObjectKind;
  stableId?: string;
  title: string;
  subtitle: string;
  primaryUrl: string;
  owner?: string;
  handle?: string;
  slug?: string;
  canSupportPersonProfile: boolean;
  canInferPersonIdentity: false;
  identityGate: ProfileUrlIntake["identityGate"];
  evidence: ArtifactEvidenceItem[];
  matchSeeds: ArtifactMatchSeed[];
  provenance: ProfileUrlIntake["provenance"];
  notes: string[];
  recommendedNextStep: string;
}

export interface PublicArtifactEnrichment {
  inputUrl: string;
  normalizedUrl: string;
  route: ProfileUrlIntake["route"];
  intake: ProfileUrlIntake;
  card?: PublicArtifactCard;
  notes: string[];
}

const ARTIFACT_PROVIDERS = new Set<ProfileProvider>([
  "github",
  "devpost",
  "huggingface",
  "x"
]);

function providerLabel(provider: ProfileProvider): string {
  switch (provider) {
    case "github":
      return "GitHub";
    case "devpost":
      return "Devpost";
    case "huggingface":
      return "Hugging Face";
    case "x":
      return "X/Twitter";
    case "linkedin":
      return "LinkedIn";
    case "blog":
      return "Blog";
    case "resume":
      return "Resume";
    case "personal_site":
      return "Personal site";
    default:
      return "Unknown provider";
  }
}

function artifactLabel(objectKind: IntakeObjectKind): string {
  return objectKind.replace(/_/g, " ");
}

function canonicalTitle(intake: ProfileUrlIntake): string {
  if (intake.stableId) {
    return intake.stableId;
  }

  if (intake.handle) {
    return intake.handle;
  }

  return intake.normalizedUrl;
}

function buildEvidence(intake: ProfileUrlIntake): ArtifactEvidenceItem[] {
  return intake.provenance.map((signal) => ({
    field: signal.field,
    value: signal.value,
    source: signal.source,
    confidence: "high",
    note: `${providerLabel(intake.provider)} ${signal.field} came directly from the normalized URL.`
  }));
}

function buildMatchSeeds(intake: ProfileUrlIntake): ArtifactMatchSeed[] {
  const seeds: ArtifactMatchSeed[] = [
    {
      kind: "provider",
      value: intake.provider,
      confidence: "high"
    },
    {
      kind: "artifact_kind",
      value: intake.objectKind,
      confidence: "high"
    }
  ];

  if (intake.owner) {
    seeds.push({
      kind: "owner",
      value: intake.owner,
      confidence: "medium"
    });
  }

  if (intake.handle) {
    seeds.push({
      kind: "handle",
      value: intake.handle,
      confidence: "low"
    });
  }

  if (intake.slug) {
    seeds.push({
      kind: "project_slug",
      value: intake.slug,
      confidence: intake.objectKind === "profile" ? "low" : "medium"
    });
  }

  if (intake.provider === "resume" || intake.provider === "personal_site" || intake.provider === "blog") {
    seeds.push({
      kind: "profile_url",
      value: intake.normalizedUrl,
      confidence: "medium"
    });
  }

  return seeds;
}

function canSupportPersonProfile(intake: ProfileUrlIntake): boolean {
  return intake.route === "public_artifact_enricher"
    && ARTIFACT_PROVIDERS.has(intake.provider)
    && intake.objectKind !== "unknown";
}

function nextStepFor(intake: ProfileUrlIntake): string {
  if (intake.objectKind === "profile") {
    return `Fetch public ${providerLabel(intake.provider)} profile metadata, then require corroboration before attaching it to a person.`;
  }

  return `Use this ${providerLabel(intake.provider)} ${artifactLabel(intake.objectKind)} as project evidence only after it is corroborated by a trusted profile or user-provided context.`;
}

export function enrichPublicArtifact(rawUrlOrIntake: string | ProfileUrlIntake): PublicArtifactEnrichment {
  const intake = typeof rawUrlOrIntake === "string"
    ? classifyProfileUrl(rawUrlOrIntake)
    : rawUrlOrIntake;
  const notes = [...intake.notes];

  if (!canSupportPersonProfile(intake)) {
    return {
      inputUrl: intake.inputUrl,
      normalizedUrl: intake.normalizedUrl,
      route: intake.route,
      intake,
      notes: [
        ...notes,
        "No public artifact card was created because this URL is not routed to the public artifact enricher."
      ]
    };
  }

  const title = canonicalTitle(intake);
  const subtitle = `${providerLabel(intake.provider)} ${artifactLabel(intake.objectKind)}`;
  const evidence = buildEvidence(intake);

  return {
    inputUrl: intake.inputUrl,
    normalizedUrl: intake.normalizedUrl,
    route: intake.route,
    intake,
    card: {
      provider: intake.provider,
      objectKind: intake.objectKind,
      stableId: intake.stableId,
      title,
      subtitle,
      primaryUrl: intake.normalizedUrl,
      owner: intake.owner,
      handle: intake.handle,
      slug: intake.slug,
      canSupportPersonProfile: true,
      canInferPersonIdentity: false,
      identityGate: intake.identityGate,
      evidence,
      matchSeeds: buildMatchSeeds(intake),
      provenance: intake.provenance,
      notes: [
        "This card contains URL-derived artifact evidence only.",
        "Do not turn handles, owners, or project slugs into person identity claims without corroboration."
      ],
      recommendedNextStep: nextStepFor(intake)
    },
    notes
  };
}

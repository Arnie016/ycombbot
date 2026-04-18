export type LinkedInEntityType = "person" | "company" | "unknown";

export interface ProductContext {
  productName?: string;
  productSummary?: string;
  productKeywords?: string[];
}

export interface LinkedInAccessState {
  finalUrl: string;
  pageTitle?: string;
  isAuthwall: boolean;
  isBlocked: boolean;
  expandedActions: string[];
}

export interface LinkedInSectionSnapshot {
  key: string;
  requestedUrl: string;
  finalUrl: string;
  title?: string;
  accessible: boolean;
  excerpt?: string;
}

export interface DiscoveryDocument {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  excerpt?: string;
  sourceType: "exa";
}

export interface DiscoveryResult {
  provider: "exa" | "none";
  queryHints: string[];
  documents: DiscoveryDocument[];
  notes: string[];
}

export interface ProjectHighlight {
  name: string;
  summary: string;
  techStack: string[];
  evidence: string[];
  sourceUrls: string[];
  credibilityScore: number;
}

export interface CurrentIdentity {
  workOrStudy: string;
  currentRole: string;
  organization: string;
  location: string;
  confidence: "high" | "medium" | "low";
}

export interface StrongestSignal {
  signal: string;
  proof: string;
}

export interface StructuredProfile {
  bestFootForward: string;
  currentIdentity?: CurrentIdentity;
  whatTheyreAbout?: string;
  topThreeThings: string[];
  coreStrengths: string[];
  credibilitySignals: string[];
  strongestSignalsDetailed: StrongestSignal[];
  projectHighlights: ProjectHighlight[];
  externalProfiles: string[];
  bestIntroAngle?: string;
}

export interface PresentationLink {
  label: string;
  url: string;
  kind: "linkedin" | "github" | "portfolio" | "project" | "source";
}

export interface PresentationResult {
  displayName: string;
  subtitle: string;
  status: "public" | "authwall" | "partial";
  summary: string;
  topStrengths: string[];
  topSignals: string[];
  bestLinks: PresentationLink[];
  nextStep: string;
  sourceCount: number;
}

export interface BotProject {
  name: string;
  whyImpressive: string;
  skills: string[];
  sourceUrl?: string;
}

export interface BotAward {
  event: string;
  result: string;
  sourceUrl?: string;
}

export interface BotLink {
  label: string;
  url: string;
}

export interface BotProfileResponse {
  name: string;
  slug?: string;
  headline?: string;
  location?: string;
  workOrStudy?: string;
  currentRole?: string;
  organization?: string;
  status: "public" | "authwall" | "partial";
  whatTheyDo?: string;
  awards: BotAward[];
  impressiveProjects: BotProject[];
  topSkills: string[];
  strongestSignals: string[];
  bestIntroAngle?: string;
  links: BotLink[];
  nextStep: string;
}

export interface RawLinkedInEntity {
  type: LinkedInEntityType;
  url: string;
  canonicalUrl: string;
  access: LinkedInAccessState;
  name?: string;
  headline?: string;
  about?: string;
  location?: string;
  currentCompany?: string;
  companyWebsite?: string;
  industry?: string;
  followerCount?: string;
  companySize?: string;
  metaDescription?: string;
  sections: LinkedInSectionSnapshot[];
  sourceSignals: string[];
  notes: string[];
}

export interface InsightBullet {
  title: string;
  detail: string;
  confidence: "high" | "medium" | "low";
}

export interface NetworkingSummary {
  score: number;
  whyThisMatters: string;
  recommendedAngle: string;
}

export interface OutreachDraft {
  opener: string;
  shareText: string;
}

export interface ScrapeResponse {
  scrapedAt: string;
  entity: RawLinkedInEntity;
  discovery?: DiscoveryResult;
  structuredProfile?: StructuredProfile;
  presentation?: PresentationResult;
  topThree: InsightBullet[];
  networking: NetworkingSummary;
  outreach: OutreachDraft;
}

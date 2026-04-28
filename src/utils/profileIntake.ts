export type ProfileProvider =
  | "linkedin"
  | "github"
  | "devpost"
  | "huggingface"
  | "x"
  | "blog"
  | "resume"
  | "personal_site"
  | "unknown";

export type IntakeObjectKind =
  | "profile"
  | "company"
  | "school"
  | "job"
  | "post"
  | "article"
  | "repository"
  | "project"
  | "model"
  | "space"
  | "dataset"
  | "blog_post"
  | "resume_file"
  | "site"
  | "directory"
  | "unknown";

export type IntakeRoute =
  | "linkedin_profile_pipeline"
  | "public_artifact_enricher"
  | "website_metadata_probe"
  | "unsupported";

export interface IntakeIdentityGate {
  canInferPersonIdentity: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface IntakeProvenanceSignal {
  field: string;
  value: string;
  source: "url";
}

export interface ProfileUrlIntake {
  inputUrl: string;
  normalizedUrl: string;
  provider: ProfileProvider;
  objectKind: IntakeObjectKind;
  route: IntakeRoute;
  stableId?: string;
  handle?: string;
  owner?: string;
  slug?: string;
  host: string;
  pathSegments: string[];
  identityGate: IntakeIdentityGate;
  provenance: IntakeProvenanceSignal[];
  notes: string[];
}

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "si",
  "source",
  "trk",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term"
]);

const RESUME_EXTENSIONS = /\.(?:pdf|doc|docx)$/i;
const BLOG_HOSTS = [
  "medium.com",
  "substack.com",
  "dev.to",
  "hashnode.dev",
  "mirror.xyz"
];
const GITHUB_RESERVED_ROOTS = new Set([
  "about",
  "apps",
  "collections",
  "customer-stories",
  "enterprise",
  "events",
  "explore",
  "features",
  "github-copilot",
  "login",
  "marketplace",
  "new",
  "notifications",
  "organizations",
  "pricing",
  "pulls",
  "search",
  "settings",
  "sponsors",
  "topics",
  "trending"
]);
const X_RESERVED_ROOTS = new Set([
  "compose",
  "explore",
  "hashtag",
  "home",
  "i",
  "intent",
  "messages",
  "notifications",
  "search",
  "settings",
  "share"
]);
const HUGGINGFACE_RESERVED_ROOTS = new Set([
  "blog",
  "brand",
  "chat",
  "collections",
  "datasets",
  "docs",
  "enterprise",
  "join",
  "learn",
  "login",
  "models",
  "new",
  "organizations",
  "papers",
  "pricing",
  "settings",
  "spaces",
  "tasks"
]);

function parseUrl(rawUrl: string): URL {
  let candidate = rawUrl.trim();

  if (!candidate.startsWith("http://") && !candidate.startsWith("https://")) {
    candidate = `https://${candidate}`;
  }

  return new URL(candidate);
}

function cleanHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function segmentsFor(url: URL): string[] {
  try {
    return decodeURIComponent(url.pathname).split("/").filter(Boolean);
  } catch {
    return url.pathname.split("/").filter(Boolean);
  }
}

function normalizedUrl(url: URL): string {
  const copy = new URL(url.toString());
  copy.hash = "";

  for (const key of [...copy.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
      copy.searchParams.delete(key);
    }
  }

  if (copy.pathname !== "/" && copy.pathname.endsWith("/")) {
    copy.pathname = copy.pathname.replace(/\/+$/, "");
  }

  copy.hostname = copy.hostname.toLowerCase();
  return copy.toString();
}

function urlSignal(field: string, value: string | undefined): IntakeProvenanceSignal[] {
  return value ? [{ field, value, source: "url" }] : [];
}

function handleOnlyGate(provider: string, handle?: string): IntakeIdentityGate {
  return {
    canInferPersonIdentity: false,
    confidence: "low",
    reason: handle
      ? `${provider} handle "${handle}" is only a routing key; do not infer a real person, role, school, company, or project from it alone.`
      : `${provider} URL does not expose enough identity evidence by itself.`
  };
}

function artifactGate(kind: string): IntakeIdentityGate {
  return {
    canInferPersonIdentity: false,
    confidence: "low",
    reason: `${kind} URLs can provide project evidence, but they are not enough to identify a person without corroborating profile evidence.`
  };
}

function websiteGate(provider: ProfileProvider): IntakeIdentityGate {
  return {
    canInferPersonIdentity: false,
    confidence: "low",
    reason: `${provider === "resume" ? "Resume" : "Website"} URLs need fetched page metadata or user-authorized content before identity can be trusted.`
  };
}

function baseResult(rawUrl: string, url: URL, provider: ProfileProvider): Omit<ProfileUrlIntake, "objectKind" | "route" | "identityGate"> {
  return {
    inputUrl: rawUrl,
    normalizedUrl: normalizedUrl(url),
    provider,
    host: cleanHost(url.hostname),
    pathSegments: segmentsFor(url),
    provenance: [],
    notes: []
  };
}

function classifyLinkedIn(rawUrl: string, url: URL): ProfileUrlIntake {
  const base = baseResult(rawUrl, url, "linkedin");
  const [first, second, third] = base.pathSegments;
  const lowerFirst = first?.toLowerCase();
  const lowerSecond = second?.toLowerCase();

  if (lowerFirst === "in" && second) {
    return {
      ...base,
      objectKind: "profile",
      route: "linkedin_profile_pipeline",
      stableId: second,
      handle: second,
      identityGate: handleOnlyGate("LinkedIn", second),
      provenance: urlSignal("linkedin_profile_slug", second)
    };
  }

  if (lowerFirst === "company" && second) {
    return {
      ...base,
      objectKind: "company",
      route: "linkedin_profile_pipeline",
      stableId: second,
      slug: second,
      identityGate: artifactGate("LinkedIn company"),
      provenance: urlSignal("linkedin_company_slug", second)
    };
  }

  if (lowerFirst === "school" && second) {
    return {
      ...base,
      objectKind: "school",
      route: "linkedin_profile_pipeline",
      stableId: second,
      slug: second,
      identityGate: artifactGate("LinkedIn school"),
      provenance: urlSignal("linkedin_school_slug", second)
    };
  }

  if (lowerFirst === "jobs" && lowerSecond === "view" && third) {
    const stableId = third.match(/(\d+)$/)?.[1] ?? third;
    return {
      ...base,
      objectKind: "job",
      route: "public_artifact_enricher",
      stableId,
      slug: third,
      identityGate: artifactGate("LinkedIn job"),
      provenance: urlSignal("linkedin_job_id", stableId)
    };
  }

  if (lowerFirst === "posts" && second) {
    const stableId = second.match(/activity-(\d+)/i)?.[1] ?? second;
    return {
      ...base,
      objectKind: "post",
      route: "public_artifact_enricher",
      stableId,
      slug: second,
      identityGate: artifactGate("LinkedIn post"),
      provenance: urlSignal("linkedin_post_id", stableId)
    };
  }

  if (lowerFirst === "feed" && lowerSecond === "update") {
    const stableId = decodeURIComponent(url.pathname).match(/activity:(\d+)/i)?.[1];
    return {
      ...base,
      objectKind: "post",
      route: "public_artifact_enricher",
      stableId,
      identityGate: artifactGate("LinkedIn post"),
      provenance: urlSignal("linkedin_activity_id", stableId)
    };
  }

  if (lowerFirst === "pulse" && second) {
    return {
      ...base,
      objectKind: "article",
      route: "public_artifact_enricher",
      stableId: second,
      slug: second,
      identityGate: artifactGate("LinkedIn article"),
      provenance: urlSignal("linkedin_article_slug", second)
    };
  }

  return {
    ...base,
    objectKind: lowerFirst === "pub" ? "directory" : "unknown",
    route: "unsupported",
    identityGate: handleOnlyGate("LinkedIn"),
    notes: ["LinkedIn URL is supported only after it resolves to a known object type."]
  };
}

function classifyGitHub(rawUrl: string, url: URL): ProfileUrlIntake {
  const base = baseResult(rawUrl, url, "github");
  const [owner, repo, third] = base.pathSegments;
  const lowerOwner = owner?.toLowerCase();

  if ((lowerOwner === "orgs" || lowerOwner === "users") && repo && !third) {
    return {
      ...base,
      objectKind: "profile",
      route: "public_artifact_enricher",
      stableId: repo,
      handle: repo,
      identityGate: handleOnlyGate("GitHub", repo),
      provenance: urlSignal("github_handle", repo),
      notes: [`Normalized GitHub ${lowerOwner === "orgs" ? "organization" : "user"} route to a handle-only profile.`]
    };
  }

  if (!owner || GITHUB_RESERVED_ROOTS.has(lowerOwner ?? "") || lowerOwner === "orgs" || lowerOwner === "users") {
    return {
      ...base,
      objectKind: owner ? "directory" : "unknown",
      route: "unsupported",
      identityGate: handleOnlyGate("GitHub"),
      notes: owner
        ? [`GitHub reserved route "${owner}" is not treated as a person, organization, or repository artifact.`]
        : ["GitHub URL has no user, organization, or repository path."]
    };
  }

  if (owner && repo) {
    const stableId = `${owner}/${repo}`;
    return {
      ...base,
      objectKind: "repository",
      route: "public_artifact_enricher",
      stableId,
      owner,
      slug: repo,
      identityGate: artifactGate("GitHub repository"),
      provenance: [
        ...urlSignal("github_owner", owner),
        ...urlSignal("github_repository", repo)
      ]
    };
  }

  return {
    ...base,
    objectKind: "profile",
    route: "public_artifact_enricher",
    stableId: owner,
    handle: owner,
    identityGate: handleOnlyGate("GitHub", owner),
    provenance: urlSignal("github_handle", owner)
  };
}

function classifyDevpost(rawUrl: string, url: URL): ProfileUrlIntake {
  const base = baseResult(rawUrl, url, "devpost");
  const [first, second] = base.pathSegments;

  if (first?.toLowerCase() === "software" && second) {
    return {
      ...base,
      objectKind: "project",
      route: "public_artifact_enricher",
      stableId: second,
      slug: second,
      identityGate: artifactGate("Devpost project"),
      provenance: urlSignal("devpost_project_slug", second)
    };
  }

  if (first) {
    return {
      ...base,
      objectKind: "profile",
      route: "public_artifact_enricher",
      stableId: first,
      handle: first,
      identityGate: handleOnlyGate("Devpost", first),
      provenance: urlSignal("devpost_handle", first)
    };
  }

  return {
    ...base,
    objectKind: "unknown",
    route: "unsupported",
    identityGate: handleOnlyGate("Devpost")
  };
}

function classifyHuggingFace(rawUrl: string, url: URL): ProfileUrlIntake {
  const base = baseResult(rawUrl, url, "huggingface");
  const [first, second, third] = base.pathSegments;
  const lowerFirst = first?.toLowerCase();

  if ((first === "spaces" || first === "datasets") && second && third) {
    const stableId = `${second}/${third}`;
    return {
      ...base,
      objectKind: first === "spaces" ? "space" : "dataset",
      route: "public_artifact_enricher",
      stableId,
      owner: second,
      slug: third,
      identityGate: artifactGate(`Hugging Face ${first === "spaces" ? "Space" : "dataset"}`),
      provenance: [
        ...urlSignal("huggingface_owner", second),
        ...urlSignal(`huggingface_${first === "spaces" ? "space" : "dataset"}`, third)
      ]
    };
  }

  if (!first || HUGGINGFACE_RESERVED_ROOTS.has(lowerFirst ?? "")) {
    return {
      ...base,
      objectKind: first ? "directory" : "unknown",
      route: "unsupported",
      identityGate: handleOnlyGate("Hugging Face"),
      notes: first
        ? [`Hugging Face reserved route "${first}" is not treated as a person, organization, model, Space, or dataset artifact.`]
        : ["Hugging Face URL has no profile, model, Space, or dataset path."]
    };
  }

  if (first && second) {
    const stableId = `${first}/${second}`;
    return {
      ...base,
      objectKind: "model",
      route: "public_artifact_enricher",
      stableId,
      owner: first,
      slug: second,
      identityGate: artifactGate("Hugging Face model"),
      provenance: [
        ...urlSignal("huggingface_owner", first),
        ...urlSignal("huggingface_model", second)
      ]
    };
  }

  if (first) {
    return {
      ...base,
      objectKind: "profile",
      route: "public_artifact_enricher",
      stableId: first,
      handle: first,
      identityGate: handleOnlyGate("Hugging Face", first),
      provenance: urlSignal("huggingface_handle", first)
    };
  }

  return {
    ...base,
    objectKind: "unknown",
    route: "unsupported",
    identityGate: handleOnlyGate("Hugging Face")
  };
}

function classifyX(rawUrl: string, url: URL): ProfileUrlIntake {
  const base = baseResult(rawUrl, url, "x");
  const [handle, second, third] = base.pathSegments;
  const lowerHandle = handle?.toLowerCase();

  if (!handle || X_RESERVED_ROOTS.has(lowerHandle ?? "")) {
    return {
      ...base,
      objectKind: handle ? "directory" : "unknown",
      route: "unsupported",
      identityGate: handleOnlyGate("X/Twitter"),
      notes: handle
        ? [`X/Twitter reserved route "${handle}" is not treated as a person profile or public post artifact.`]
        : ["X/Twitter URL has no profile handle or post path."]
    };
  }

  if (handle && second === "status" && third) {
    return {
      ...base,
      objectKind: "post",
      route: "public_artifact_enricher",
      stableId: third,
      handle,
      identityGate: artifactGate("X/Twitter post"),
      provenance: [
        ...urlSignal("x_handle", handle),
        ...urlSignal("x_status_id", third)
      ]
    };
  }

  if (handle) {
    return {
      ...base,
      objectKind: "profile",
      route: "public_artifact_enricher",
      stableId: handle,
      handle,
      identityGate: handleOnlyGate("X/Twitter", handle),
      provenance: urlSignal("x_handle", handle)
    };
  }

  return {
    ...base,
    objectKind: "unknown",
    route: "unsupported",
    identityGate: handleOnlyGate("X/Twitter")
  };
}

function classifyWebsite(rawUrl: string, url: URL): ProfileUrlIntake {
  const base = baseResult(rawUrl, url, RESUME_EXTENSIONS.test(url.pathname) ? "resume" : BLOG_HOSTS.some((host) => baseResult(rawUrl, url, "unknown").host.endsWith(host)) ? "blog" : "personal_site");
  const slug = base.pathSegments.at(-1);
  const isResume = base.provider === "resume";
  const isBlogPost = base.provider === "blog" && base.pathSegments.length > 0;

  return {
    ...base,
    objectKind: isResume ? "resume_file" : isBlogPost ? "blog_post" : "site",
    route: "website_metadata_probe",
    stableId: base.normalizedUrl,
    slug,
    identityGate: websiteGate(base.provider),
    provenance: [
      ...urlSignal("host", base.host),
      ...urlSignal(isResume ? "resume_path" : "path", url.pathname)
    ]
  };
}

export function classifyProfileUrl(rawUrl: string): ProfileUrlIntake {
  const url = parseUrl(rawUrl);
  const host = cleanHost(url.hostname);

  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    return classifyLinkedIn(rawUrl, url);
  }

  if (host === "github.com" || host.endsWith(".github.com")) {
    return classifyGitHub(rawUrl, url);
  }

  if (host === "devpost.com" || host.endsWith(".devpost.com")) {
    return classifyDevpost(rawUrl, url);
  }

  if (host === "huggingface.co" || host.endsWith(".huggingface.co")) {
    return classifyHuggingFace(rawUrl, url);
  }

  if (host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com") {
    return classifyX(rawUrl, url);
  }

  if (host.includes(".")) {
    return classifyWebsite(rawUrl, url);
  }

  const base = baseResult(rawUrl, url, "unknown");
  return {
    ...base,
    objectKind: "unknown",
    route: "unsupported",
    identityGate: {
      canInferPersonIdentity: false,
      confidence: "low",
      reason: "URL host is not recognized as a public profile or public artifact provider."
    }
  };
}

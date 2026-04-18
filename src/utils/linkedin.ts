export function ensureLinkedInUrl(rawUrl: string): URL {
  let candidate = rawUrl.trim();

  if (!candidate.startsWith("http://") && !candidate.startsWith("https://")) {
    candidate = `https://${candidate}`;
  }

  const url = new URL(candidate);

  if (!(url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com"))) {
    throw new Error("Only linkedin.com public URLs are supported.");
  }

  return url;
}

export type LinkedInObjectKind =
  | "profile"
  | "company"
  | "school"
  | "job"
  | "post"
  | "article"
  | "legacy_profile"
  | "directory"
  | "unknown";

export interface LinkedInUrlDescriptor {
  kind: LinkedInObjectKind;
  stableId?: string;
  canonicalSlug?: string;
  hostVariant: string;
  trackingParams: Record<string, string>;
}

function normalizedPath(url: URL): string {
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    return url.pathname;
  }
}

export function describeLinkedInUrl(url: URL): LinkedInUrlDescriptor {
  const path = normalizedPath(url);
  const pathname = path.toLowerCase();
  const trackingParams: Record<string, string> = {};

  for (const [key, value] of url.searchParams.entries()) {
    if (pathname.startsWith("/profile/view") && key === "id") {
      trackingParams[key] = value;
      continue;
    }

    if (/^(trk|trackingid|refid|position|pagenum|locale|authtype|authtoken|trkinfo)$/i.test(key)) {
      trackingParams[key] = value;
    }
  }

  if (pathname.startsWith("/in/")) {
    const slug = path.split("/").filter(Boolean)[1];
    return {
      kind: "profile",
      stableId: slug,
      canonicalSlug: slug,
      hostVariant: url.hostname.toLowerCase(),
      trackingParams
    };
  }

  if (pathname.startsWith("/company/")) {
    const slug = path.split("/").filter(Boolean)[1];
    return {
      kind: "company",
      stableId: slug,
      canonicalSlug: slug,
      hostVariant: url.hostname.toLowerCase(),
      trackingParams
    };
  }

  if (pathname.startsWith("/school/")) {
    const slug = path.split("/").filter(Boolean)[1];
    return {
      kind: "school",
      stableId: slug,
      canonicalSlug: slug,
      hostVariant: url.hostname.toLowerCase(),
      trackingParams
    };
  }

  if (pathname.startsWith("/jobs/view/")) {
    const tail = path.split("/").filter(Boolean).at(-1) ?? "";
    const numericId = tail.match(/(\d+)$/)?.[1];
    return {
      kind: "job",
      stableId: numericId ?? tail,
      canonicalSlug: tail,
      hostVariant: url.hostname.toLowerCase(),
      trackingParams
    };
  }

  if (pathname.startsWith("/feed/update/")) {
    const activityId = path.match(/activity:(\d+)/i)?.[1];
    return {
      kind: "post",
      stableId: activityId,
      canonicalSlug: activityId,
      hostVariant: url.hostname.toLowerCase(),
      trackingParams
    };
  }

  if (pathname.startsWith("/posts/")) {
    const tail = path.split("/").filter(Boolean).at(-1) ?? "";
    const activityId = tail.match(/activity-(\d+)/i)?.[1];
    return {
      kind: "post",
      stableId: activityId ?? tail,
      canonicalSlug: tail,
      hostVariant: url.hostname.toLowerCase(),
      trackingParams
    };
  }

  if (pathname.startsWith("/pulse/")) {
    const slug = path.split("/").filter(Boolean)[1];
    return {
      kind: "article",
      stableId: slug,
      canonicalSlug: slug,
      hostVariant: url.hostname.toLowerCase(),
      trackingParams
    };
  }

  if (pathname.startsWith("/profile/view")) {
    const id = url.searchParams.get("id") ?? undefined;
    return {
      kind: "legacy_profile",
      stableId: id,
      canonicalSlug: id,
      hostVariant: url.hostname.toLowerCase(),
      trackingParams
    };
  }

  if (pathname.startsWith("/pub/dir/")) {
    return {
      kind: "directory",
      hostVariant: url.hostname.toLowerCase(),
      trackingParams
    };
  }

  return {
    kind: "unknown",
    hostVariant: url.hostname.toLowerCase(),
    trackingParams
  };
}

export function detectLinkedInEntityType(url: URL): "person" | "company" | "unknown" {
  const descriptor = describeLinkedInUrl(url);

  if (descriptor.kind === "profile") {
    return "person";
  }

  if (descriptor.kind === "company") {
    return "company";
  }

  return "unknown";
}

export function normalizeWhitespace(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

export function pickFirst(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => Boolean(normalizeWhitespace(value)));
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

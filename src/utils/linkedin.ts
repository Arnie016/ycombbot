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

export function detectLinkedInEntityType(url: URL): "person" | "company" | "unknown" {
  const pathname = url.pathname.toLowerCase();

  if (pathname.startsWith("/in/")) {
    return "person";
  }

  if (pathname.startsWith("/company/")) {
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

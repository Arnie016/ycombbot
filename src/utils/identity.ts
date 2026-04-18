import type { RawLinkedInEntity } from "../types.js";

const HANDLE_TOKENS = new Set([
  "ai",
  "app",
  "apps",
  "builder",
  "builds",
  "coach",
  "code",
  "creator",
  "dev",
  "digital",
  "founder",
  "hq",
  "inc",
  "io",
  "lab",
  "labs",
  "official",
  "studio",
  "tech",
  "x"
]);

function titleCaseToken(token: string): string {
  if (!token) {
    return token;
  }

  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

export function extractLinkedInSlug(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.at(-1);
  } catch {
    return undefined;
  }
}

export function guessNameFromLinkedInUrl(url: string): string | undefined {
  const slug = extractLinkedInSlug(url);

  if (!slug) {
    return undefined;
  }

  const slugTokens = slug
    .split(/[-_]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const nameTokens: string[] = [];

  for (const token of slugTokens) {
    if (/\d/.test(token)) {
      break;
    }

    if (/^[a-z]+$/i.test(token) && !HANDLE_TOKENS.has(token.toLowerCase()) && token.length >= 2) {
      nameTokens.push(token);
    }
  }

  if (nameTokens.length < 2) {
    return undefined;
  }

  return nameTokens.map(titleCaseToken).join(" ");
}

export function buildDiscoveryQueries(entity: RawLinkedInEntity): string[] {
  const name = entity.name ?? guessNameFromLinkedInUrl(entity.url);
  const queries = new Set<string>();
  const currentCompany = entity.currentCompany?.trim();
  const slug = extractLinkedInSlug(entity.url);

  if (name) {
    queries.add(`"${name}"`);
    queries.add(`"${name}" github`);
    queries.add(`"${name}" devpost`);
    queries.add(`"${name}" hugging face OR huggingface`);
    queries.add(`"${name}" github OR portfolio OR site OR devpost OR hugging face OR substack`);
    queries.add(`"${name}" project OR startup OR hackathon OR demo`);
    queries.add(`"${name}" won OR winner OR award hackathon`);
    queries.add(`"${name}" devpost winner OR award`);
    queries.add(`"${name}" 1st place OR first place OR finalist OR runner up`);
    queries.add(`"${name}" research OR paper OR university project`);
    queries.add(`"${name}" linkedin`);
    queries.add(`"${name}" university OR school OR student`);
    queries.add(`"${name}" founder OR engineer OR developer OR researcher`);
    queries.add(`"${name}" open source OR repository OR github`);
  }

  if (name && currentCompany) {
    queries.add(`"${name}" "${currentCompany}"`);
  }

  if (slug) {
    queries.add(`"${slug}"`);
  }

  queries.add(`"${entity.url}"`);

  return [...queries]
    .filter((query) => !/""/.test(query))
    .slice(0, 12);
}

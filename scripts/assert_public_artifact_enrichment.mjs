import assert from "node:assert/strict";
import { enrichPublicArtifact } from "../dist/pipeline/enrichPublicArtifact.js";

function assertCard(rawUrl, expected) {
  const enrichment = enrichPublicArtifact(rawUrl);

  assert.equal(enrichment.route, "public_artifact_enricher");
  assert.ok(enrichment.card, `${rawUrl} should produce a public artifact card`);
  assert.equal(enrichment.card.canSupportPersonProfile, true);
  assert.equal(enrichment.card.canInferPersonIdentity, false);
  assert.equal(enrichment.card.identityGate.canInferPersonIdentity, false);
  assert.match(enrichment.card.identityGate.reason, /not enough|do not infer|without corroborating/i);

  for (const [key, value] of Object.entries(expected)) {
    assert.equal(enrichment.card[key], value, `${rawUrl} expected card.${key}=${value}, got ${enrichment.card[key]}`);
  }

  assert.ok(enrichment.card.evidence.length >= 1, `${rawUrl} should include URL provenance evidence`);
  assert.ok(enrichment.card.matchSeeds.some((seed) => seed.kind === "provider"), `${rawUrl} should include provider match seed`);
  assert.match(enrichment.card.notes.join(" "), /URL-derived artifact evidence only/);

  return enrichment;
}

const githubRepo = assertCard("https://github.com/openai/openai-node?utm_source=yc", {
  provider: "github",
  objectKind: "repository",
  stableId: "openai/openai-node",
  title: "openai/openai-node",
  owner: "openai",
  slug: "openai-node"
});
assert.equal(githubRepo.normalizedUrl, "https://github.com/openai/openai-node");
assert.ok(githubRepo.card.evidence.some((item) => item.field === "github_owner" && item.confidence === "high"));
assert.ok(githubRepo.card.matchSeeds.some((seed) => seed.kind === "owner" && seed.value === "openai"));

assertCard("https://devpost.com/software/pacman-ai", {
  provider: "devpost",
  objectKind: "project",
  stableId: "pacman-ai",
  title: "pacman-ai",
  slug: "pacman-ai"
});

assertCard("https://huggingface.co/spaces/openai/whisper", {
  provider: "huggingface",
  objectKind: "space",
  stableId: "openai/whisper",
  title: "openai/whisper",
  owner: "openai",
  slug: "whisper"
});

const website = enrichPublicArtifact("https://example.com/about?utm_source=hn");
assert.equal(website.route, "website_metadata_probe");
assert.equal(website.card, undefined);
assert.match(website.notes.join(" "), /No public artifact card/);

console.log("public artifact enrichment assertions passed");

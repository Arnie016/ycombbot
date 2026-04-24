import assert from "node:assert/strict";
import { classifyProfileUrl } from "../dist/utils/profileIntake.js";

function assertIntake(rawUrl, expected) {
  const intake = classifyProfileUrl(rawUrl);

  for (const [key, value] of Object.entries(expected)) {
    assert.equal(intake[key], value, `${rawUrl} expected ${key}=${value}, got ${intake[key]}`);
  }

  assert.equal(intake.identityGate.canInferPersonIdentity, false, `${rawUrl} must not infer person identity from URL alone`);
  assert.equal(intake.identityGate.confidence, "low", `${rawUrl} should start with low identity confidence`);

  return intake;
}

const linkedIn = assertIntake("linkedin.com/in/ojasx/?trk=public_profile", {
  provider: "linkedin",
  objectKind: "profile",
  route: "linkedin_profile_pipeline",
  stableId: "ojasx"
});
assert.equal(linkedIn.normalizedUrl, "https://linkedin.com/in/ojasx");
assert.match(linkedIn.identityGate.reason, /do not infer/i);

assertIntake("https://github.com/openai/openai-node?utm_source=hn", {
  provider: "github",
  objectKind: "repository",
  route: "public_artifact_enricher",
  stableId: "openai/openai-node",
  owner: "openai",
  slug: "openai-node"
});

assertIntake("https://github.com/gaearon", {
  provider: "github",
  objectKind: "profile",
  route: "public_artifact_enricher",
  stableId: "gaearon",
  handle: "gaearon"
});

assertIntake("https://devpost.com/software/pacman-ai", {
  provider: "devpost",
  objectKind: "project",
  route: "public_artifact_enricher",
  stableId: "pacman-ai"
});

assertIntake("https://huggingface.co/spaces/openai/whisper", {
  provider: "huggingface",
  objectKind: "space",
  route: "public_artifact_enricher",
  stableId: "openai/whisper",
  owner: "openai",
  slug: "whisper"
});

assertIntake("https://x.com/sama/status/123456789", {
  provider: "x",
  objectKind: "post",
  route: "public_artifact_enricher",
  stableId: "123456789",
  handle: "sama"
});

assertIntake("https://example.com/resume.pdf?utm_campaign=demo", {
  provider: "resume",
  objectKind: "resume_file",
  route: "website_metadata_probe"
});

assertIntake("https://example.com/about", {
  provider: "personal_site",
  objectKind: "site",
  route: "website_metadata_probe"
});

console.log("profile intake assertions passed");

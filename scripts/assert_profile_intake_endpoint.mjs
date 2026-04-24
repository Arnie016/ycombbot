import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { classifyIntakeInternal } = await import("../dist/index.js");

const result = classifyIntakeInternal({
  urls: [
    "linkedin.com/in/ojasx/?trk=public_profile",
    "https://github.com/openai/openai-node?utm_source=hn",
    "https://huggingface.co/spaces/openai/whisper",
    "https://example.com/resume.pdf?utm_campaign=demo"
  ]
});

assert.equal(result.ok, true);
assert.equal(result.status, 200);
assert.equal(result.body.intakes.length, 4);
assert.deepEqual(result.body.intakes.map((intake) => intake.provider), [
  "linkedin",
  "github",
  "huggingface",
  "resume"
]);
assert.equal(result.body.intakes[0].identityGate.canInferPersonIdentity, false);
assert.equal(result.body.intakes[1].stableId, "openai/openai-node");

const invalid = classifyIntakeInternal({});
assert.equal(invalid.ok, false);
assert.equal(invalid.status, 400);

console.log("profile intake endpoint assertions passed");

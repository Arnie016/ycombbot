import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { enrichIntakeInternal } = await import("../dist/index.js");

const single = enrichIntakeInternal({
  url: "https://github.com/openai/openai-node?utm_source=yc"
});

assert.equal(single.ok, true);
assert.equal(single.status, 200);
assert.equal(single.body.enrichment.card.provider, "github");
assert.equal(single.body.enrichment.card.objectKind, "repository");
assert.equal(single.body.enrichment.card.canInferPersonIdentity, false);
assert.equal(single.body.enrichment.card.identityGate.canInferPersonIdentity, false);
assert.equal(single.body.enrichment.card.primaryUrl, "https://github.com/openai/openai-node");

const batch = enrichIntakeInternal({
  urls: [
    "https://github.com/openai/openai-node",
    "https://devpost.com/software/pacman-ai",
    "https://huggingface.co/openai/whisper",
    "https://example.com/resume.pdf"
  ]
});

assert.equal(batch.ok, true);
assert.equal(batch.status, 200);
assert.equal(batch.body.enrichments.length, 4);
assert.deepEqual(batch.body.enrichments.map((item) => item.intake.provider), [
  "github",
  "devpost",
  "huggingface",
  "resume"
]);
assert.equal(batch.body.enrichments[0].card.stableId, "openai/openai-node");
assert.equal(batch.body.enrichments[1].card.stableId, "pacman-ai");
assert.equal(batch.body.enrichments[2].card.objectKind, "model");
assert.equal(batch.body.enrichments[3].card, undefined);
assert.match(batch.body.enrichments[3].notes.join(" "), /No public artifact card/);

const invalid = enrichIntakeInternal({});
assert.equal(invalid.ok, false);
assert.equal(invalid.status, 400);

console.log("public artifact endpoint assertions passed");

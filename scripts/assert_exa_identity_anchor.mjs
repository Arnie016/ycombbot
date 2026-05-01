import assert from "node:assert/strict";
import { discoverPublicProfileEvidence } from "../dist/providers/exa.js";

const originalApiKey = process.env.EXA_API_KEY;
const originalFetch = globalThis.fetch;

function makeEntity(slug, overrides = {}) {
  const url = `https://www.linkedin.com/in/${slug}/`;
  return {
    type: "unknown",
    url,
    canonicalUrl: url,
    kind: "profile",
    stableId: slug,
    hostVariant: "www.linkedin.com",
    access: {
      finalUrl: url,
      isAuthwall: true,
      isBlocked: false,
      expandedActions: []
    },
    sections: [],
    sourceSignals: [],
    notes: [],
    ...overrides
  };
}

async function captureRequestBodies(entity) {
  const bodies = [];
  process.env.EXA_API_KEY = "test-key";
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return {
      ok: true,
      async json() {
        return { results: [] };
      }
    };
  };

  await discoverPublicProfileEvidence(entity);
  return bodies;
}

try {
  const noNameBodies = await captureRequestBodies(makeEntity("arnav-salkade-27076a201"));
  assert.ok(noNameBodies.length > 0, "expected Exa search requests for no-name entity");
  assert.ok(
    noNameBodies.every((body) => body.includeText === undefined),
    "no-name LinkedIn profiles must not use guessed slug-derived names as Exa includeText anchors"
  );

  const localizedNotFoundBodies = await captureRequestBodies(makeEntity("ojasx", { name: "لم يتم العثور على الصفحة" }));
  assert.ok(localizedNotFoundBodies.length > 0, "expected Exa search requests for localized not-found entity");
  assert.ok(
    localizedNotFoundBodies.every((body) => body.includeText === undefined),
    "localized LinkedIn not-found text must not become an Exa includeText anchor"
  );

  const namedBodies = await captureRequestBodies(makeEntity("yangshun", { name: "Yangshun Tay" }));
  assert.ok(namedBodies.length > 0, "expected Exa search requests for named entity");
  assert.ok(
    namedBodies.every((body) => Array.isArray(body.includeText) && body.includeText.includes("Yangshun Tay")),
    "named LinkedIn profiles should keep the real scraped name as the Exa includeText anchor"
  );

  console.log("Exa identity anchor assertions passed");
} finally {
  if (originalApiKey === undefined) {
    delete process.env.EXA_API_KEY;
  } else {
    process.env.EXA_API_KEY = originalApiKey;
  }

  globalThis.fetch = originalFetch;
}

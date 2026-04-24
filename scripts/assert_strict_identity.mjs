import assert from "node:assert/strict";
import { buildBotProfile, buildBotText } from "../dist/presentation/buildPresentation.js";
import { buildDiscoveryQueries } from "../dist/utils/identity.js";

function makePayload(slug, overrides = {}) {
  const url = `https://www.linkedin.com/in/${slug}/`;
  return {
    scrapedAt: new Date(0).toISOString(),
    entity: {
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
    },
    topThree: [],
    networking: {
      score: 0,
      whyThisMatters: "",
      recommendedAngle: "Lead with a simple founder/operator question: what are you building lately?"
    },
    outreach: {
      opener: "",
      shareText: ""
    }
  };
}

function assertSparseFallback(slug) {
  const payload = makePayload(slug);
  const profile = buildBotProfile(payload, undefined, undefined, { strictIdentity: true });
  const text = buildBotText(profile);

  assert.equal(profile.name, "Unknown profile", `${slug} should not become a display name`);
  assert.equal(profile.confidence?.identity, "low", `${slug} should have low identity confidence`);
  assert.equal(profile.workOrStudy, undefined, `${slug} should not infer work/study`);
  assert.equal(profile.currentRole, undefined, `${slug} should not infer current role`);
  assert.equal(profile.organization, undefined, `${slug} should not infer organization`);
  assert.match(profile.whatTheyDo ?? "", /Low-public-footprint builder or operator/);
  assert.ok(text.indexOf("Intro angle:") < text.indexOf("Links:"), `${slug} should render intro before links`);
}

for (const slug of ["ojasx", "arnav-salkade-27076a201", "yangshun"]) {
  assertSparseFallback(slug);
}

const noNameQueries = buildDiscoveryQueries(makePayload("arnav-salkade-27076a201").entity);
assert.deepEqual(noNameQueries, [
  "\"arnav-salkade-27076a201\"",
  "\"https://www.linkedin.com/in/arnav-salkade-27076a201/\""
]);

const namedEntity = makePayload("yangshun", {
  name: "Yangshun Tay",
  currentCompany: "GreatFrontEnd"
}).entity;
const namedQueries = buildDiscoveryQueries(namedEntity);
assert.ok(namedQueries.includes("\"Yangshun Tay\" github"));
assert.ok(namedQueries.includes("\"Yangshun Tay\" \"GreatFrontEnd\""));

console.log("strict identity assertions passed");

import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const {
  prepareTelegramRepoShareInternal,
  matchTelegramRepoSharesInternal
} = await import("../dist/index.js");

const prepared = prepareTelegramRepoShareInternal({
  url: "https://github.com/openai/openai-node?utm_source=telegram",
  projectPitch: "SDK experiments for AI app builders at NUS.",
  lookingFor: "People building TypeScript agents or Telegram bots.",
  tags: ["AI", "TypeScript", "Telegram Bots"],
  intents: ["feedback", "contributors"],
  telegram: {
    groupId: "-100123",
    messageId: "42",
    userId: "7",
    username: "builder"
  }
});

assert.equal(prepared.ok, true);
assert.equal(prepared.status, 200);
assert.equal(prepared.body.card.status, "ready");
assert.equal(prepared.body.card.identitySafety.canInferPersonIdentity, false);
assert.ok(prepared.body.card.inlineActions.length >= 4);
assert.ok(prepared.body.card.shareText.includes("openai/openai-node"));

const matches = matchTelegramRepoSharesInternal({
  source: {
    url: "https://github.com/openai/openai-node",
    tags: ["typescript", "telegram-bots", "ai"],
    intents: ["feedback", "contributors"],
    lookingFor: "Telegram bot collaborators."
  },
  candidates: [
    {
      shareId: "repo_good",
      title: "nus-telegram-match",
      primaryUrl: "https://github.com/example/nus-telegram-match",
      tags: ["typescript", "telegram-bots", "ai"],
      intents: ["users", "design_partner"],
      lookingFor: "NUS students to try it."
    },
    {
      shareId: "repo_weak",
      title: "ios-calendar-widget",
      primaryUrl: "https://github.com/example/ios-calendar-widget",
      tags: ["swift", "calendar"],
      intents: ["showcase"]
    }
  ]
});

assert.equal(matches.ok, true);
assert.equal(matches.status, 200);
assert.equal(matches.body.matches.length, 2);
assert.equal(matches.body.matches[0].candidate.shareId, "repo_good");
assert.equal(matches.body.matches[0].verdict, "strong");
assert.ok(matches.body.matches[0].score > matches.body.matches[1].score);

const invalid = prepareTelegramRepoShareInternal({
  url: "https://github.com/openai/openai-node",
  intents: ["invalid"]
});

assert.equal(invalid.ok, false);
assert.equal(invalid.status, 400);

console.log("telegram repo collaboration endpoint assertions passed");

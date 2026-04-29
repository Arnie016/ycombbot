import assert from "node:assert/strict";
import {
  prepareTelegramRepoShare,
  scoreTelegramRepoMatch
} from "../dist/pipeline/telegramRepoCollab.js";

const prepared = prepareTelegramRepoShare({
  url: "https://github.com/openai/openai-node?utm_source=telegram",
  projectPitch: "SDK experiments for AI app builders at NUS.",
  lookingFor: "People building TypeScript agents or Telegram bots.",
  tags: ["AI", "TypeScript", "Telegram Bots"],
  intents: ["feedback", "contributors"],
  eventContext: "NUS Ask group"
});

assert.equal(prepared.card.status, "ready");
assert.equal(prepared.card.title, "openai/openai-node");
assert.equal(prepared.card.primaryUrl, "https://github.com/openai/openai-node");
assert.equal(prepared.card.identitySafety.canInferPersonIdentity, false);
assert.match(prepared.card.identitySafety.note, /collaboration signals only/i);
assert.ok(prepared.card.tags.includes("typescript"));
assert.ok(prepared.card.tags.includes("github"));
assert.ok(prepared.card.shareText.includes("Tap a button"));
assert.ok(prepared.card.inlineActions.some((action) => action.label === "Want intro" && action.privacy === "private_dm"));
assert.ok(prepared.card.consensusPrompts.length >= 3);
assert.ok(prepared.card.matchSeeds.some((seed) => seed.kind === "provider" && seed.value === "github"));

const match = scoreTelegramRepoMatch(prepared.card, {
  shareId: "repo_candidate",
  title: "nus-telegram-agents",
  primaryUrl: "https://github.com/example/nus-telegram-agents",
  tags: ["typescript", "telegram-bots", "ai"],
  intents: ["users", "design_partner"],
  lookingFor: "Students to test an event matching bot."
});

assert.equal(match.verdict, "strong");
assert.ok(match.score >= 65);
assert.match(match.reasons.join(" "), /shared tags/i);
assert.match(match.introSuggestion, /compare notes/i);

const unsupported = prepareTelegramRepoShare({
  url: "https://example.com/about",
  tags: ["portfolio"]
});

assert.equal(unsupported.card.status, "unsupported");
assert.equal(unsupported.card.inlineActions.length, 0);
assert.match(unsupported.card.nextStep, /public build artifact/i);

console.log("telegram repo collaboration assertions passed");

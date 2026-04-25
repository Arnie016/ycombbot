import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { getConfig } from "./config.js";
import { enrichProfile } from "./pipeline/enrichProfile.js";
import { enrichPublicArtifact } from "./pipeline/enrichPublicArtifact.js";
import { deriveInsights } from "./insights/deriveInsights.js";
import { buildBotProfile, buildBotText, buildPresentation, type ProfileBuildOptions } from "./presentation/buildPresentation.js";
import { discoverPublicProfileEvidence } from "./providers/exa.js";
import { fetchLinkedInPage } from "./scraper/fetchLinkedInPage.js";
import { extractLinkedInData } from "./scraper/extractLinkedInData.js";
import type { BotProfileResponse, RawLinkedInEntity, ScrapeResponse } from "./types.js";
import { describeLinkedInUrl, ensureLinkedInUrl } from "./utils/linkedin.js";
import { classifyProfileUrl } from "./utils/profileIntake.js";

export const app = express();
const config = getConfig();
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(moduleDirectory, "..");
export const publicIndexPath = path.join(appRoot, "public", "index.html");

const inspectSchema = z.object({
  url: z.string().min(1).optional(),
  urls: z.array(z.string().min(1)).max(10).optional(),
  mode: z.enum(["url_only", "linkedin_only", "public_web_enriched"]).optional(),
  strictIdentity: z.boolean().optional(),
  productName: z.string().trim().min(1).optional(),
  productSummary: z.string().trim().min(1).optional(),
  productKeywords: z.array(z.string().trim().min(1)).max(12).optional(),
  researchMode: z.enum(["strict", "balanced", "exploratory"]).optional(),
  maxProjects: z.number().int().min(1).max(5).optional(),
  maxLinks: z.number().int().min(1).max(6).optional(),
  includeWeakSignals: z.boolean().optional()
}).superRefine((value, context) => {
  if (!value.url && (!value.urls || value.urls.length === 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either url or urls."
    });
  }
});

const intakeSchema = z.object({
  url: z.string().min(1).optional(),
  urls: z.array(z.string().min(1)).max(20).optional()
}).superRefine((value, context) => {
  if (!value.url && (!value.urls || value.urls.length === 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either url or urls."
    });
  }
});

app.use(express.json());

app.get("/", (_request, response) => {
  response.sendFile(publicIndexPath);
});

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "linkedin-insight-scraper"
  });
});

export function classifyIntakeInternal(requestBody: unknown) {
  const parsed = intakeSchema.safeParse(requestBody);

  if (!parsed.success) {
    return {
      ok: false as const,
      status: 400,
      body: {
        error: "Invalid request body.",
        details: parsed.error.flatten()
      }
    };
  }

  try {
    const urls = parsed.data.urls?.length ? parsed.data.urls : [parsed.data.url!];
    const intakes = urls.map((urlInput) => classifyProfileUrl(urlInput));

    return {
      ok: true as const,
      status: 200,
      body: urls.length === 1 ? { intake: intakes[0] } : { intakes }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown intake classification error.";
    return {
      ok: false as const,
      status: 400,
      body: {
        error: message
      }
    };
  }
}

app.post("/intake/classify", (request, response) => {
  const result = classifyIntakeInternal(request.body);

  response.status(result.status).json(result.body);
});

export function enrichIntakeInternal(requestBody: unknown) {
  const parsed = intakeSchema.safeParse(requestBody);

  if (!parsed.success) {
    return {
      ok: false as const,
      status: 400,
      body: {
        error: "Invalid request body.",
        details: parsed.error.flatten()
      }
    };
  }

  try {
    const urls = parsed.data.urls?.length ? parsed.data.urls : [parsed.data.url!];
    const enrichments = urls.map((urlInput) => enrichPublicArtifact(urlInput));

    return {
      ok: true as const,
      status: 200,
      body: urls.length === 1 ? { enrichment: enrichments[0] } : { enrichments }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown intake enrichment error.";
    return {
      ok: false as const,
      status: 400,
      body: {
        error: message
      }
    };
  }
}

app.post("/intake/enrich", (request, response) => {
  const result = enrichIntakeInternal(request.body);

  response.status(result.status).json(result.body);
});

async function inspectSingle(urlInput: string, parsed: z.infer<typeof inspectSchema>) {
  const strictIdentity = parsed.strictIdentity ?? true;
  const buildOptions: ProfileBuildOptions = {
    researchMode: parsed.researchMode,
    maxProjects: parsed.maxProjects,
    maxLinks: parsed.maxLinks,
    includeWeakSignals: parsed.includeWeakSignals,
    strictIdentity
  };
  const url = ensureLinkedInUrl(urlInput);
  const allowDiscovery = (parsed.mode ?? "public_web_enriched") === "public_web_enriched";
  const descriptor = describeLinkedInUrl(url);
  const seedEntity: RawLinkedInEntity = {
    type: "unknown",
    url: url.toString(),
    canonicalUrl: url.toString(),
    kind: descriptor.kind,
    stableId: descriptor.stableId,
    hostVariant: descriptor.hostVariant,
    trackingParams: descriptor.trackingParams,
    access: {
      finalUrl: url.toString(),
      isAuthwall: false,
      isBlocked: false,
      expandedActions: []
    },
    sections: [],
    sourceSignals: [],
    notes: []
  };
  const discoveryPromise = allowDiscovery ? discoverPublicProfileEvidence(seedEntity) : undefined;

  if ((parsed.mode ?? "public_web_enriched") === "url_only") {
    const botProfile: BotProfileResponse = {
      kind: seedEntity.kind,
      stableId: seedEntity.stableId,
      hostVariant: seedEntity.hostVariant,
      canonicalSlug: descriptor.canonicalSlug,
      name: "Unknown profile",
      slug: descriptor.canonicalSlug,
      status: "partial",
      awards: [],
      impressiveProjects: [],
      topSkills: [],
      strongestSignals: [],
      links: [
        {
          label: "linkedin.com",
          url: url.toString()
        }
      ],
      nextStep: "URL-only mode returns only LinkedIn object classification and stable identifiers."
    };
    const fullPayload: ScrapeResponse = {
      scrapedAt: new Date().toISOString(),
      entity: seedEntity,
      topThree: [],
      networking: {
        score: 0,
        whyThisMatters: "",
        recommendedAngle: ""
      },
      outreach: {
        opener: "",
        shareText: ""
      }
    };

    return {
      fullPayload,
      botProfile
    };
  }

  const fetchedPage = await fetchLinkedInPage({
    url: url.toString(),
    timeoutMs: config.scraperTimeoutMs,
    headless: config.scraperHeadless
  });
  const entity = extractLinkedInData({
    fetchedPage,
    url
  });
  const payload = deriveInsights(entity, {
    productName: parsed.productName,
    productSummary: parsed.productSummary,
    productKeywords: parsed.productKeywords
  });
  const allowSynthesis = (parsed.mode ?? "public_web_enriched") !== "linkedin_only" || !strictIdentity;
  const enrichment = await enrichProfile(entity, discoveryPromise, {
    enableDiscovery: allowDiscovery,
    enableSynthesis: allowSynthesis
  });
  const fullPayload = {
    ...payload,
    discovery: enrichment.discovery,
    structuredProfile: enrichment.structuredProfile,
    presentation: buildPresentation(payload, enrichment.discovery, enrichment.structuredProfile, buildOptions)
  };

  return {
    fullPayload,
    botProfile: buildBotProfile(fullPayload, enrichment.discovery, enrichment.structuredProfile, buildOptions)
  };
}

async function inspectInternal(requestBody: unknown) {
  const parsed = inspectSchema.safeParse(requestBody);

  if (!parsed.success) {
    return {
      ok: false as const,
      status: 400,
      body: {
        error: "Invalid request body.",
        details: parsed.error.flatten()
      }
    };
  }

  try {
    const urls = parsed.data.urls?.length ? parsed.data.urls : [parsed.data.url!];
    const results = await Promise.all(urls.map((urlInput) => inspectSingle(urlInput, parsed.data)));

    return {
      ok: true as const,
      status: 200,
      body: urls.length === 1
        ? results[0]
        : {
            fullPayloads: results.map((result) => result.fullPayload),
            botProfiles: results.map((result) => result.botProfile)
          }
    };
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown scraper error.";
    return {
      ok: false as const,
      status: 500,
      body: {
        error: message
      }
    };
  }
}

app.post("/inspect", async (request, response) => {
  const result = await inspectInternal(request.body);

  if (!result.ok) {
    response.status(result.status).json(result.body);
    return;
  }

  response.json("botProfile" in result.body ? result.body.botProfile : { profiles: result.body.botProfiles });
});

app.post("/profile", async (request, response) => {
  const result = await inspectInternal(request.body);

  if (!result.ok) {
    response.status(result.status).json(result.body);
    return;
  }

  response.json("botProfile" in result.body ? result.body.botProfile : { profiles: result.body.botProfiles });
});

app.post("/inspect/text", async (request, response) => {
  const result = await inspectInternal(request.body);

  if (!result.ok) {
    response.status(result.status).type("text/plain").send(result.body.error);
    return;
  }

  response.type("text/plain").send(
    "botProfile" in result.body
      ? buildBotText(result.body.botProfile)
      : result.body.botProfiles.map((profile) => buildBotText(profile)).join("\n\n---\n\n")
  );
});

app.post("/profile/text", async (request, response) => {
  const result = await inspectInternal(request.body);

  if (!result.ok) {
    response.status(result.status).type("text/plain").send(result.body.error);
    return;
  }

  response.type("text/plain").send(
    "botProfile" in result.body
      ? buildBotText(result.body.botProfile)
      : result.body.botProfiles.map((profile) => buildBotText(profile)).join("\n\n---\n\n")
  );
});

app.post("/inspect/full", async (request, response) => {
  const result = await inspectInternal(request.body);

  if (!result.ok) {
    response.status(result.status).json(result.body);
    return;
  }

  response.json("fullPayload" in result.body ? result.body.fullPayload : { profiles: result.body.fullPayloads });
});

app.post("/profile/full", async (request, response) => {
  const result = await inspectInternal(request.body);

  if (!result.ok) {
    response.status(result.status).json(result.body);
    return;
  }

  response.json("fullPayload" in result.body ? result.body.fullPayload : { profiles: result.body.fullPayloads });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(config.port, () => {
    console.log(`linkedin-insight-scraper listening on http://localhost:${config.port}`);
  });
}

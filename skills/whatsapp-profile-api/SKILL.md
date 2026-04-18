---
name: whatsapp-profile-api
description: Use when wiring a WhatsApp bot or thin client to the LinkedIn Profile Brief API that accepts one or many LinkedIn URLs and returns the best public, evidence-backed profile summary for each person.
---

# WhatsApp Profile API

This skill is the handoff for the backend in `/Users/arnav/Desktop/ycomb`.

Use it when a bot needs to:
- accept a LinkedIn URL from a user
- call one backend endpoint
- receive a structured profile brief
- return a short WhatsApp-friendly summary or share card

## Deployment Status

Current local dev URL:
- `http://localhost:3001`

Production deployment:
- not configured yet in this repo
- use `render.yaml` at repo root to create the Render web service

GitHub repo:
- `https://github.com/Arnie016/ycombbot`

## Core Rule

The WhatsApp bot should make **one HTTP request** to this backend.

The backend itself does the heavier work:
- LinkedIn page fetch
- public-footprint discovery
- Devpost/GitHub expansion
- evidence ranking
- structured summarization

So yes, there are multiple internal network calls, but the bot only makes one call.

## Main Endpoint

Use:
- `POST /profile`

Single profile request:

```json
{
  "url": "https://www.linkedin.com/in/example-person/",
  "mode": "public_web_enriched",
  "strictIdentity": true,
  "productName": "WarmIntro",
  "productSummary": "WhatsApp-first networking assistant that turns public profiles into intro-ready briefs.",
  "productKeywords": ["networking", "introductions", "whatsapp"],
  "researchMode": "balanced",
  "maxProjects": 3,
  "maxLinks": 4,
  "includeWeakSignals": false
}
```

Batch request:

```json
{
  "urls": [
    "https://www.linkedin.com/in/person-one/",
    "https://www.linkedin.com/in/person-two/"
  ],
  "productName": "WarmIntro",
  "productSummary": "WhatsApp-first networking assistant that turns public profiles into intro-ready briefs.",
  "productKeywords": ["networking", "introductions", "whatsapp"]
}
```

Rules:
- send either `url` or `urls`
- `urls` supports up to 10 links per request
- batch mode returns `{ "profiles": [...] }`

Optional request controls:
- `mode`
  - `url_only`: URL classification only
  - `linkedin_only`: LinkedIn-visible facts only
  - `public_web_enriched`: LinkedIn plus public web evidence
- `strictIdentity`
  - `true`: do not promote weak slug or external matches into person identity
  - `false`: allow more permissive naming fallback
- `researchMode`
  - `strict`: prefer higher-confidence artifacts, fewer weak links and fewer LinkedIn posts
  - `balanced`: default
  - `exploratory`: allow broader evidence and weaker public signals
- `maxProjects`: `1..5`
- `maxLinks`: `1..6`
- `includeWeakSignals`: `true|false`

## Text Endpoint

Use:
- `POST /profile/text`

This returns a plain-text card for terminals, debugging, or direct WhatsApp formatting.

## Debug Endpoint

Use:
- `POST /profile/full`

This returns the raw scrape, discovery docs, and structured evidence.
Use this for debugging only, not as the bot-facing payload.

## Response Shape

Single profile response from `POST /profile`:

```json
{
  "kind": "profile | company | school | job | post | article | legacy_profile | directory | unknown",
  "stableId": "string",
  "hostVariant": "string",
  "canonicalSlug": "string",
  "name": "string",
  "slug": "string",
  "headline": "string",
  "location": "string",
  "workOrStudy": "string",
  "currentRole": "string",
  "organization": "string",
  "status": "public | authwall | partial",
  "whatTheyDo": "string",
  "awards": [
    {
      "event": "string",
      "result": "string",
      "sourceUrl": "string"
    }
  ],
  "impressiveProjects": [
    {
      "name": "string",
      "whyImpressive": "string",
      "skills": ["string"],
      "sourceUrl": "string"
    }
  ],
  "topSkills": ["string"],
  "strongestSignals": ["string"],
  "bestIntroAngle": "string",
  "links": [
    {
      "label": "string",
      "url": "string"
    }
  ],
  "nextStep": "string"
}
```

Batch response from `POST /profile`:

```json
{
  "profiles": [
    {
      "name": "string",
      "status": "public"
    }
  ]
}
```

## Presentation Contract

The bot should present the fields in this order:

1. `name`
2. `workOrStudy`
3. `currentRole` + `organization`
4. `whatTheyDo`
5. `awards` (max 3)
6. `impressiveProjects` (max 3)
7. `topSkills` (max 6)
8. `bestIntroAngle`
9. `links` (max 4)

Do not lead with:
- authwall notes
- generic filler like "public technical work"
- raw debug notes

If a field is missing, omit it instead of printing junk.

## WhatsApp Rendering

Recommended message shape:

```text
Name
Work / Study
Role @ Organization

What they do: ...

Awards:
- ...

Top projects:
- Project name: why it matters

Top skills: ...

Intro angle: ...
```

## How the Backend Works

For each LinkedIn URL:

1. Normalize the LinkedIn URL.
2. Classify the LinkedIn object type and stable identifier.
3. If the selected mode allows, fetch the LinkedIn page with Playwright.
4. Detect:
   - `public`
   - `authwall`
   - `partial`
5. If the selected mode allows, run public-web discovery from the LinkedIn slug/name anchor.
6. Expand strong public profiles:
   - Devpost portfolio -> project pages
   - GitHub profile -> pinned repositories
7. Rank evidence.
8. Return structured fields.

Important:
- this service does **not** log into LinkedIn
- it does **not** bypass authwall
- it does **not** use private cookies or session scraping

## Latency

Latency comes from:
- browser page load
- search/discovery calls
- follow-up fetches to public Devpost/GitHub pages

Current practical behavior:
- single profile: usually a few seconds
- batch of many profiles: slower because each profile still needs its own fetch/discovery path

If low latency matters:
- prefer one profile per bot interaction
- cache by canonical LinkedIn URL
- use batch only for admin/research workflows, not for live user chat

If you want more degree of freedom:

```json
{
  "url": "https://www.linkedin.com/in/example-person/",
  "researchMode": "exploratory",
  "maxProjects": 5,
  "maxLinks": 6,
  "includeWeakSignals": true
}
```

If authenticity matters more than recall:

```json
{
  "url": "https://www.linkedin.com/in/example-person/",
  "mode": "linkedin_only",
  "strictIdentity": true
}
```

## Environment Variables

Required for best results:
- `EXA_API_KEY`
- `OPENAI_API_KEY`

Optional:
- none currently required for the stable `/profile` path

## Run Locally

```bash
npm install
npx playwright install chromium
PORT=3001 npm run dev
```

## Render Deploy Steps

Use these exact steps:

1. Open Render dashboard.
2. Click `New`.
3. Click `Blueprint`.
4. Connect `Arnie016/ycombbot`.
5. Let Render read the repo-root `render.yaml`.
6. Set the secret env vars:
   - `EXA_API_KEY`
   - `OPENAI_API_KEY`
7. Keep the blueprint defaults:
   - runtime `node`
   - region `singapore`
   - health check `/health`
8. Click `Apply`.
9. Wait for the first deploy to finish.

Render settings expected by this repo:
- runtime: `node`
- build command: `npm install && npx playwright install chromium && npm run build`
- start command: `npm run start`
- region: `singapore`
- health check: `/health`
- browsers path: `/opt/render/project/.render-playwright`

After deploy, the live base URL will look like:
- `https://<service-name>.onrender.com`

Then the bot should call:
- `https://<service-name>.onrender.com/profile`
- `https://<service-name>.onrender.com/profile/text`
- `https://<service-name>.onrender.com/profile/full`

## What The Friend Owns

The friend building the WhatsApp bot should only own:
- taking a LinkedIn URL from the chat
- calling `/profile`
- rendering the returned fields
- caching or rate limiting on the bot side

The friend should not:
- scrape LinkedIn directly
- duplicate the discovery logic
- call multiple research providers from the bot
- rebuild ranking logic in WhatsApp code

## Curl Examples

Single:

```bash
curl -s -X POST http://localhost:3001/profile \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/in/yangshun/?skipRedirect=true"
  }'
```

Batch:

```bash
curl -s -X POST http://localhost:3001/profile \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.linkedin.com/in/adrinmanohar/?skipRedirect=true",
      "https://www.linkedin.com/in/kevinmatthews-ci/?skipRedirect=true",
      "https://www.linkedin.com/in/yangshun/?skipRedirect=true",
      "https://www.linkedin.com/in/gabriel-chua/?skipRedirect=true"
    ]
  }'
```

Text:

```bash
curl -s -X POST http://localhost:3001/profile/text \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/in/yangshun/?skipRedirect=true"
  }'
```

## Files To Know

- API routes: `/Users/arnav/Desktop/ycomb/src/index.ts`
- presentation layer: `/Users/arnav/Desktop/ycomb/src/presentation/buildPresentation.ts`
- discovery: `/Users/arnav/Desktop/ycomb/src/providers/exa.ts`
- LinkedIn fetch: `/Users/arnav/Desktop/ycomb/src/scraper/fetchLinkedInPage.ts`
- identity/slug parsing: `/Users/arnav/Desktop/ycomb/src/utils/identity.ts`
- Render deploy blueprint: `/Users/arnav/Desktop/ycomb/render.yaml`

## Current Weaknesses

- some profiles still come back thin if public footprint is weak
- awards extraction is decent but not complete
- role/org inference can still be noisy on partially public LinkedIn pages
- batch requests increase latency

Why a profile like Gabriel Chua was weak:
- LinkedIn was authwalled
- the strongest public results were posts and a website, not rich project pages
- there were fewer concrete repos/award pages/artifacts tied confidently to the same person
- the backend therefore stayed conservative instead of inventing detail

## Bot Rule Of Thumb

Use `/profile` as the single source of truth.

Do not make the WhatsApp bot scrape LinkedIn itself.
Do not duplicate the research logic in the bot.
Keep the bot thin:
- send URL in
- render response out

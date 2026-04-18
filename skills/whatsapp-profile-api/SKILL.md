---
name: whatsapp-profile-api
description: Complete handoff for the LinkedIn-to-profile-card backend in /Users/arnav/Desktop/ycomb, including deployment status, GitHub repo, Render steps, endpoint contract, research stack, identity rules, output shape, and WhatsApp bot integration.
---

# WhatsApp Profile API

This is the single source of truth for the backend in `/Users/arnav/Desktop/ycomb`.

The product goal is:
- user sends a LinkedIn URL to a WhatsApp bot
- the bot makes one backend call
- the backend returns the best high-signal, evidence-backed profile card possible
- the bot sends that card back in a clean intro-ready format

The core output should feel like:

```text
Yangshun Tay
AI Frontend Engineer at GreatFrontEnd

Builds developer education and interview-prep products.

Top projects:
- Tech Interview Handbook
- Front End Interview Handbook

Top skills:
React, Open source, GitHub, Frontend

Intro angle:
Frontend engineering educator with strong product credibility.

Links:
- LinkedIn
- GitHub
```

The backend is responsible for producing the data needed for that shape.

## Current Status

Deployment status:
- not deployed on Render from this workspace yet
- current working local base URL: `http://localhost:3001`

GitHub repo:
- `https://github.com/Arnie016/ycombbot`

Latest pushed commit when this handoff was written:
- `70ef7ce`

Can your friend use it right now:
- yes, by cloning the GitHub repo and either:
  - running locally
  - deploying to Render from the included blueprint

Can they access a public deployed URL right now:
- no, not until one of you completes the Render deploy

## What The Backend Does

For every LinkedIn link, the system does this:

1. Parse and normalize the LinkedIn URL.
2. Classify the LinkedIn object type:
   - `profile`
   - `company`
   - `school`
   - `job`
   - `post`
   - `article`
   - `legacy_profile`
   - `directory`
   - `unknown`
3. Extract the stable identifier from the URL itself.
4. Depending on mode, optionally fetch the LinkedIn page with Playwright.
5. Detect:
   - `public`
   - `authwall`
   - `partial`
6. Depending on mode, optionally run public-web discovery.
7. Expand stronger public artifacts:
   - GitHub repos
   - Devpost projects
   - Hugging Face models/artifacts
   - visible LinkedIn project/meta evidence
8. Rank the evidence.
9. Return one structured profile object or text card.

The backend, not the bot, owns:
- scraping
- identity rules
- research provider fanout
- evidence ranking
- summarization
- output shaping

## What The Bot Should Do

The WhatsApp bot should stay thin.

Bot responsibilities:
- accept one LinkedIn URL from the user
- call `POST /profile`
- render the returned fields
- optionally cache by canonical LinkedIn URL

The bot should not:
- scrape LinkedIn itself
- call Exa itself
- call OpenAI itself
- rebuild ranking logic
- guess missing fields

Every WhatsApp message should map to one backend call.

## Identity Rules

This is important.

The original failure mode was vanity slugs such as:
- `ojasx`

That slug is not a real name.
The system now avoids turning that into fake identity.

Identity policy:

- `url_only`
  - return only what the URL itself proves
- `linkedin_only`
  - return only what is visible on LinkedIn itself
- `public_web_enriched`
  - allow external public evidence

With `strictIdentity: true`:
- do not convert vanity handles into full names
- do not merge weak external matches into confirmed identity
- do not promote brand-style slugs into person names

So:
- `arnav-salkade-27076a201` can reasonably resolve to a likely human name
- `ojasx` should remain unresolved if LinkedIn itself does not show the name

Recommended bot default:

```json
{
  "mode": "public_web_enriched",
  "strictIdentity": true
}
```

If you want maximum authenticity over recall:

```json
{
  "mode": "linkedin_only",
  "strictIdentity": true
}
```

## Research Stack Used

Current stack used by this backend:

- LinkedIn URL parser
- Playwright page fetcher
- LinkedIn page extractor
- Exa public discovery
- public profile expansion for stronger artifacts
- OpenAI synthesis for structured profile shaping

Concretely:

- URL parsing and classification:
  - `src/utils/linkedin.ts`
- slug/name heuristics:
  - `src/utils/identity.ts`
- LinkedIn page fetching:
  - `src/scraper/fetchLinkedInPage.ts`
- LinkedIn page extraction:
  - `src/scraper/extractLinkedInData.ts`
- Exa discovery:
  - `src/providers/exa.ts`
- enrichment orchestration:
  - `src/pipeline/enrichProfile.ts`
- output shaping:
  - `src/presentation/buildPresentation.ts`
- API routes:
  - `src/index.ts`

What the external research layer tries to find:
- GitHub repos and profiles
- Devpost projects and hackathon work
- Hugging Face artifacts
- public LinkedIn posts
- public portfolio pages
- public evidence pages that mention named projects, awards, or strong technical proof

What should be kept:
- named projects
- awards with source URLs
- repeated concrete skills
- strongest signals with evidence
- good links like LinkedIn, GitHub, Devpost, portfolio

What should be removed or deprioritized:
- generic filler
- weak mirror pages
- irrelevant social links
- random posts with no project value
- vague summaries like "public technical work"

## Endpoint Contract

Base URL locally:
- `http://localhost:3001`

Primary bot endpoint:
- `POST /profile`

Other endpoints:
- `POST /profile/text`
- `POST /profile/full`
- `GET /health`

Alias endpoints also exist:
- `POST /inspect`
- `POST /inspect/text`
- `POST /inspect/full`

Use `/profile` for the bot.

## Request Body

Single-link request:

```json
{
  "url": "https://www.linkedin.com/in/example-person/",
  "mode": "public_web_enriched",
  "strictIdentity": true,
  "researchMode": "balanced",
  "maxProjects": 3,
  "maxLinks": 4,
  "includeWeakSignals": false,
  "productName": "WarmIntro",
  "productSummary": "WhatsApp-first networking assistant that turns public profiles into intro-ready briefs.",
  "productKeywords": ["networking", "introductions", "whatsapp"]
}
```

Batch request:

```json
{
  "urls": [
    "https://www.linkedin.com/in/person-one/",
    "https://www.linkedin.com/in/person-two/"
  ],
  "mode": "public_web_enriched",
  "strictIdentity": true
}
```

Rules:
- send either `url` or `urls`
- `urls` supports up to 10
- single request returns one profile object
- batch request returns `{ "profiles": [...] }`

## Request Controls

### `mode`

- `url_only`
  - no page fetch
  - no external discovery
  - only LinkedIn object classification + stable identifiers

- `linkedin_only`
  - page fetch allowed
  - only LinkedIn-visible facts
  - no external public-web enrichment

- `public_web_enriched`
  - page fetch allowed
  - external public-web research allowed
  - best mode for the actual bot

### `strictIdentity`

- `true`
  - conservative identity
  - protects against false names
  - recommended for production

- `false`
  - more permissive fallback naming
  - not recommended for the bot default

### `researchMode`

- `strict`
  - higher precision
  - fewer weak links
  - fewer weak LinkedIn posts

- `balanced`
  - current default

- `exploratory`
  - broader recall
  - can surface weaker public artifacts
  - useful for sparse profiles

### `maxProjects`

- allowed range: `1..5`

### `maxLinks`

- allowed range: `1..6`

### `includeWeakSignals`

- `true`
  - allows weaker signals to appear
- `false`
  - keeps the card tighter

## Response Shape

Primary JSON response from `POST /profile`:

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

This is the bot-facing contract.

## Output Rendering Contract

The bot should present the profile in this order:

1. `name`
2. `workOrStudy`
3. short `whatTheyDo`
4. `awards` up to 3
5. `impressiveProjects` up to 3
6. `topSkills` up to 6
7. `bestIntroAngle`
8. `links`

Important rendering rule:
- links should appear at the end
- include the highest-value links first
- usually:
  - LinkedIn
  - GitHub
  - Devpost
  - portfolio

Do not lead with:
- raw authwall notes
- debug notes
- generic phrases
- filler traits with no proof

## Ideal WhatsApp Shape

This is the intended WhatsApp-style card:

```text
Yangshun Tay
AI Frontend Engineer at GreatFrontEnd

Builds developer education and interview-prep products.

Top projects:
- Tech Interview Handbook
- Front End Interview Handbook
- GreatFrontEnd

Top skills:
React, Open source, GitHub, Frontend

Intro angle:
Frontend engineering educator with strong product credibility.

Links:
- LinkedIn: https://www.linkedin.com/in/yangshun/
- GitHub: https://github.com/yangshun
```

That is the behavioral target.

## Current Repo Layout

Important files and what they do:

- `package.json`
  - scripts and dependencies
- `render.yaml`
  - Render blueprint
- `README.md`
  - repo-level docs
- `WHATSAPP_BOT_HANDOFF.md`
  - quick friend handoff doc
- `scripts/profile_card.sh`
  - simple local curl wrapper

Source files:

- `src/index.ts`
  - Express server
  - request validation
  - routes
  - mode handling
- `src/types.ts`
  - shared types
- `src/utils/linkedin.ts`
  - LinkedIn URL parsing/classification
- `src/utils/identity.ts`
  - slug/name heuristics
- `src/scraper/fetchLinkedInPage.ts`
  - Playwright fetch
- `src/scraper/extractLinkedInData.ts`
  - page extraction
- `src/providers/exa.ts`
  - discovery provider
- `src/providers/openai.ts`
  - structured synthesis
- `src/pipeline/enrichProfile.ts`
  - enrichment orchestration
- `src/presentation/buildPresentation.ts`
  - bot JSON and text shaping
- `src/insights/deriveInsights.ts`
  - insight generation
- `src/config.ts`
  - environment config

Public static files:

- `public/index.html`
- `public/main.js`
- `public/styles.css`

## Local Run

Clone and run:

```bash
git clone https://github.com/Arnie016/ycombbot.git
cd ycombbot
npm install
npx playwright install chromium
export EXA_API_KEY="..."
export OPENAI_API_KEY="..."
PORT=3001 npm run dev
```

Health check:

```bash
curl -s http://localhost:3001/health
```

Single profile:

```bash
curl -s -X POST http://localhost:3001/profile \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/in/yangshun/?skipRedirect=true",
    "mode": "public_web_enriched",
    "strictIdentity": true,
    "researchMode": "balanced",
    "maxProjects": 3,
    "maxLinks": 4
  }'
```

Text card:

```bash
curl -s -X POST http://localhost:3001/profile/text \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/in/yangshun/?skipRedirect=true",
    "mode": "public_web_enriched",
    "strictIdentity": true
  }'
```

Debug payload:

```bash
curl -s -X POST http://localhost:3001/profile/full \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/in/yangshun/?skipRedirect=true",
    "mode": "public_web_enriched",
    "strictIdentity": true
  }'
```

## Render Deployment

This repo is deploy-ready, but not deployed yet.

Repo to connect:
- `https://github.com/Arnie016/ycombbot`

Blueprint file:
- repo root `render.yaml`

Current Render config in the blueprint:
- service type: `web`
- runtime: `node`
- plan: `starter`
- region: `singapore`
- health check: `/health`
- build command:
  - `npm install && npx playwright install chromium && npm run build`
- start command:
  - `npm run start`

Required env vars on Render:
- `EXA_API_KEY`
- `OPENAI_API_KEY`

Additional blueprint env vars already set:
- `NODE_VERSION=22`
- `PORT=10000`
- `PLAYWRIGHT_BROWSERS_PATH=/opt/render/project/.render-playwright`

Exact Render steps:

1. Open Render dashboard.
2. Click `New`.
3. Click `Blueprint`.
4. Select GitHub repo `Arnie016/ycombbot`.
5. Let Render detect `render.yaml`.
6. Enter:
   - `EXA_API_KEY`
   - `OPENAI_API_KEY`
7. Apply the blueprint.
8. Wait for deploy to finish.
9. Open:
   - `https://<service-name>.onrender.com/health`
10. Then test:
   - `https://<service-name>.onrender.com/profile`
   - `https://<service-name>.onrender.com/profile/text`

Expected live endpoints after deploy:
- `https://<service-name>.onrender.com/health`
- `https://<service-name>.onrender.com/profile`
- `https://<service-name>.onrender.com/profile/text`
- `https://<service-name>.onrender.com/profile/full`

## What The Friend Should Build

The WhatsApp integration should be simple:

1. Receive user message.
2. Extract LinkedIn URL.
3. Send one POST request to `/profile`.
4. Render the returned fields into a WhatsApp message.
5. Include links at the end.

Recommended default request from the bot:

```json
{
  "url": "<linkedin-url-from-user>",
  "mode": "public_web_enriched",
  "strictIdentity": true,
  "researchMode": "balanced",
  "maxProjects": 3,
  "maxLinks": 4,
  "includeWeakSignals": false
}
```

Recommended end-user output:

```text
Name
Role / Work / Study

What they do

Awards
Top projects
Top skills
Intro angle
Links
```

## Product Logic

Why the links at the end matter:
- they let the recipient verify the profile
- they let the network effect continue
- they give the next click:
  - LinkedIn
  - GitHub
  - Devpost
  - portfolio

So yes, links should stay in the final message.

## Known Limits

- authwalled LinkedIn profiles remain sparse in `linkedin_only`
- public-web enrichment depends on the person having a real public footprint
- some profiles will still be thin
- project ranking is better than before, but not perfect for every profile
- live deployment still needs to be completed manually in Render

## Short Answer

Is it deployed on Render:
- no

Can your friend use it:
- yes

How:
- clone from GitHub
- deploy from `render.yaml`
- point the WhatsApp bot at `/profile`

What URL should the bot eventually call:
- `https://<service-name>.onrender.com/profile`

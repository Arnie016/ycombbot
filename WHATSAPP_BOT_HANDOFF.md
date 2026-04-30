# WhatsApp Bot Handoff

This backend takes a LinkedIn URL and returns the best public, evidence-backed summary it can find about that person.

GitHub repo:

```text
https://github.com/Arnie016/ycombbot
```

## What The Bot Should Do

1. User sends a LinkedIn URL in WhatsApp.
2. Bot sends that URL to this backend.
3. Bot receives one structured profile object.
4. Bot renders a short card/message from that object.

The bot should stay thin.
It should not scrape LinkedIn itself.
It should not call Exa/OpenAI directly.
It should only call this backend.

## Current Local Base URL

```text
http://localhost:3001
```

## Main Endpoint

```text
POST /profile
```

Use this for the WhatsApp bot.

## Other Endpoints

```text
POST /profile/text
POST /profile/full
POST /intake/classify
POST /intake/enrich
POST /telegram/repo-share/prepare
POST /telegram/repo-share/match
GET /health
```

- `/profile/text` is plain text
- `/profile/full` is debug only
- `/intake/classify` classifies any supported profile or artifact URL without fetching
- `/intake/enrich` returns safe public-artifact evidence cards for non-LinkedIn links
- `/telegram/repo-share/prepare` formats repo/build links for Telegram collaboration posts
- `/telegram/repo-share/match` scores opted-in repo/build cards for collaborator discovery

## Single Profile Request

```bash
curl -s -X POST http://localhost:3001/profile \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/in/yangshun/?skipRedirect=true",
    "mode": "public_web_enriched",
    "strictIdentity": true,
    "researchMode": "balanced",
    "maxProjects": 3,
    "maxLinks": 4,
    "includeWeakSignals": false
  }'
```

## Batch Request

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

## Request Rules

- Send either `url` or `urls`
- `url` returns one profile object
- `urls` returns `{ "profiles": [...] }`
- Use single-link mode for normal WhatsApp usage
- Use batch mode only for admin/research workflows

Optional request controls:
- `mode`
  - `url_only`
  - `linkedin_only`
  - `public_web_enriched`
- `strictIdentity`: `true|false`
- `researchMode`
  - `strict`
  - `balanced`
  - `exploratory`
- `maxProjects`: `1..5`
- `maxLinks`: `1..6`
- `includeWeakSignals`: `true|false`

## Response Shape

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

## Recommended WhatsApp Rendering

Render fields in this order:

1. `name`
2. `workOrStudy`
3. `currentRole` + `organization`
4. `whatTheyDo`
5. `awards` up to 3
6. `impressiveProjects` up to 3
7. `topSkills` up to 6
8. `bestIntroAngle`
9. `links` up to 4

If a field is missing, omit it.
Do not print raw authwall/debug language unless the result is thin.

Mode guidance:
- `url_only`: classification only, no page facts, no external research
- `linkedin_only`: only facts visible on LinkedIn itself
- `public_web_enriched`: LinkedIn plus public web evidence

Identity rule:
- keep `strictIdentity: true` for the bot
- that prevents vanity slugs and weak external matches from becoming fake names

## Example WhatsApp Message

```text
Yangshun Tay
AI Frontend Engineer at GreatFrontEnd

Builds developer education products and frontend learning resources.

Top projects:
- Tech Interview Handbook
- Front End Interview Handbook

Top skills:
React, Open source, GitHub, Frontend

Intro angle:
Frontend engineering educator with strong product and open-source credibility.
```

## How The Backend Works

For each LinkedIn URL:

1. Normalize LinkedIn URL
2. Classify the LinkedIn object type and stable identifier
3. If mode allows, fetch LinkedIn page with Playwright
4. Detect `public`, `authwall`, or `partial`
5. If mode allows, run public-web discovery from the LinkedIn anchor
6. Expand strong public profiles:
   - Devpost portfolio -> project pages
   - GitHub profile -> pinned repos
7. Rank public evidence
8. Return structured fields

Important:

- does not log into LinkedIn
- does not bypass authwall
- does not use cookies/session scraping

## Latency

The WhatsApp bot makes one HTTP request.

The backend internally does multiple steps:
- LinkedIn fetch
- search/discovery
- public page expansion
- summarization

So the bot sees one call, but the backend does more work behind the scenes.

Practical rule:

- use one link per request for live chat
- cache results by canonical LinkedIn URL
- batch mode is slower

For more freedom on thin profiles:

```json
{
  "url": "https://www.linkedin.com/in/example-person/",
  "researchMode": "exploratory",
  "maxProjects": 5,
  "maxLinks": 6,
  "includeWeakSignals": true
}
```

For maximum authenticity:

```json
{
  "url": "https://www.linkedin.com/in/example-person/",
  "mode": "linkedin_only",
  "strictIdentity": true
}
```

## Non-LinkedIn Link Intake

When a user sends GitHub, Devpost, Hugging Face, X/Twitter, a resume, a blog, or a personal site, call:

```text
POST /intake/enrich
```

Example:

```bash
curl -s -X POST http://localhost:3001/intake/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://github.com/openai/openai-node"
  }'
```

Important:

- artifact cards are URL-derived evidence only
- `canInferPersonIdentity` stays `false`
- use the card as a matching or profile-quality input only after corroboration
- if no card is returned, fall back to asking for a LinkedIn, resume, or another trusted profile link

## Telegram Repo Collaboration

For a Telegram group where people share what they are building, use:

```text
POST /telegram/repo-share/prepare
```

Example:

```bash
curl -s -X POST http://localhost:3001/telegram/repo-share/prepare \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://github.com/openai/openai-node",
    "projectPitch": "SDK experiments for AI app builders at NUS.",
    "lookingFor": "People building TypeScript agents or Telegram bots.",
    "tags": ["ai", "typescript", "telegram"],
    "intents": ["feedback", "contributors"],
    "eventContext": "NUS Ask group"
  }'
```

The response includes:

- `shareText` for the Telegram message
- inline actions: `I can help`, `Want intro`, `Save repo`, `Find similar`
- consensus prompts for group reactions
- match seeds for private collaborator recommendations
- strict identity safety: repo owners and handles are not treated as people

To recommend similar builders, call:

```text
POST /telegram/repo-share/match
```

Pass the current repo card plus opted-in candidate cards. Return the top matches privately; the group should only see aggregate interest signals unless both sides opt in.

## Current Local Run

```bash
cd /Users/arnav/Desktop/ycomb
npm install
npx playwright install chromium
PORT=3001 npm run dev
```

## Required Environment Variables

```bash
EXA_API_KEY
OPENAI_API_KEY
```

## Render Deploy

This repo already includes:

```text
/Users/arnav/Desktop/ycomb/render.yaml
```

Deploy steps:

Repo to connect:

```text
https://github.com/Arnie016/ycombbot
```

Exact steps in Render:

1. Open Render dashboard
2. Click `New`
3. Click `Blueprint`
4. Connect `Arnie016/ycombbot`
5. Confirm Render detects `render.yaml`
6. In the service env vars, set:
   - `EXA_API_KEY`
   - `OPENAI_API_KEY`
7. Leave the rest from the blueprint:
   - runtime `node`
   - region `singapore`
   - health check `/health`
8. Click `Apply`
9. Wait for the first deploy to finish
10. Open:
   - `https://<service-name>.onrender.com/health`
   - `https://<service-name>.onrender.com/profile`

Expected live URLs:

```text
https://<service-name>.onrender.com/profile
https://<service-name>.onrender.com/profile/text
https://<service-name>.onrender.com/profile/full
```

## Files That Matter

- API routes:
  `/Users/arnav/Desktop/ycomb/src/index.ts`
- presentation logic:
  `/Users/arnav/Desktop/ycomb/src/presentation/buildPresentation.ts`
- discovery:
  `/Users/arnav/Desktop/ycomb/src/providers/exa.ts`
- LinkedIn fetch:
  `/Users/arnav/Desktop/ycomb/src/scraper/fetchLinkedInPage.ts`
- slug/name parsing:
  `/Users/arnav/Desktop/ycomb/src/utils/identity.ts`
- handoff skill:
  `/Users/arnav/Desktop/ycomb/skills/whatsapp-profile-api/SKILL.md`

## Current Quality Summary

- single-link flow works
- batch flow works
- public/authwall detection works
- identity extraction is decent
- project ranking is still the main weak point on thinner profiles
- some profiles will still be sparse if public footprint is weak

## Test Payload Summary

### Adrinmanohar

- authwalled LinkedIn
- very weak public technical footprint
- output is sparse and should be presented carefully

### Kevin Matthews

- good identity extraction
- Founder at Candid-I
- Singapore
- talent solutions / recruitment / APAC theme is clear
- project extraction still weak

### Yangshun Tay

- strongest result among the tests
- AI Frontend Engineer at GreatFrontEnd
- ex-Meta
- known for Docusaurus / Blind 75 / interview resources
- still needs cleaner project ranking

### Gabriel Chua

- authwalled LinkedIn
- fallback found public site and public posts
- still too generic
- should be presented as a lighter public-footprint card
- weak because the public web had fewer concrete artifact pages than stronger profiles like Yangshun

## Bottom Line

Use `POST /profile` as the single source of truth for the WhatsApp bot.

The bot should:
- send the LinkedIn URL
- receive structured JSON
- render a clean card

The bot should not:
- scrape LinkedIn
- duplicate ranking logic
- call multiple research providers directly

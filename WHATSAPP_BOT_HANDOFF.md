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
GET /health
```

- `/profile/text` is plain text
- `/profile/full` is debug only

## Single Profile Request

```bash
curl -s -X POST http://localhost:3001/profile \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/in/yangshun/?skipRedirect=true",
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
2. Fetch LinkedIn page with Playwright
3. Detect `public`, `authwall`, or `partial`
4. Run public-web discovery from the LinkedIn slug/name anchor
5. Expand strong public profiles:
   - Devpost portfolio -> project pages
   - GitHub profile -> pinned repos
6. Rank public evidence
7. Return structured fields

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

1. Put `/Users/arnav/Desktop/ycomb` into a GitHub repo
2. Push the repo
3. Create a new Render Web Service
4. Connect the GitHub repo
5. Use the included `render.yaml`
6. Set:
   - `EXA_API_KEY`
   - `OPENAI_API_KEY`
7. Deploy

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

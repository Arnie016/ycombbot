# LinkedIn Profile Brief API

Small HTTP service for your WhatsApp bot backend.

Input:
- a public LinkedIn profile URL or company URL
- optional `productName`, `productSummary`, and `productKeywords`

Output:
- name
- work / study
- role / organization
- what they do
- awards / competitions found publicly
- top 3 projects
- top skills
- strongest signals
- best intro angle
- best public links

## Why this shape

LinkedIn's official member APIs are for authenticated members with consent, not arbitrary profile lookup from a random URL. This project is therefore built as a public-page extractor plus your own insight logic.

It does **not**:
- log into LinkedIn
- bypass anti-bot gates
- solve CAPTCHAs
- scrape private profile data

That keeps the architecture simpler and reduces failure modes, even though public LinkedIn pages can still be brittle.

## API

### `GET /health`

Returns a basic health payload.

### Stable bot endpoints

- `POST /profile`
  Compact JSON for the WhatsApp bot.
- `POST /profile/text`
  Terminal-friendly text card.
- `POST /profile/full`
  Debug payload with raw discovery and structured evidence.
- `POST /intake/classify`
  Universal URL classification for LinkedIn, GitHub, Devpost, Hugging Face, X/Twitter, blogs, resumes, and personal sites.
- `POST /intake/enrich`
  Deterministic public-artifact evidence cards for GitHub, Devpost, Hugging Face, and X/Twitter links. These cards are safe matching inputs, not person identity.

### `POST /intake/classify`

This endpoint is the first universal intake contract. It does not fetch or infer identity. It classifies routing, provider, stable URL identifiers, and provenance so later enrichers can decide what evidence is safe to collect.

Request:

```json
{
  "urls": [
    "https://www.linkedin.com/in/example-person/",
    "https://github.com/example/example-repo",
    "https://devpost.com/software/example-project",
    "https://huggingface.co/spaces/example/demo",
    "https://example.com/resume.pdf"
  ]
}
```

Response:

```json
{
  "intakes": [
    {
      "provider": "github",
      "objectKind": "repository",
      "route": "public_artifact_enricher",
      "stableId": "example/example-repo",
      "identityGate": {
        "canInferPersonIdentity": false,
        "confidence": "low",
        "reason": "GitHub repository URLs can provide project evidence, but they are not enough to identify a person without corroborating profile evidence."
      },
      "provenance": [
        {
          "field": "github_owner",
          "value": "example",
          "source": "url"
        }
      ]
    }
  ]
}
```

Strict identity rule:
- URL handles and slugs are routing keys only.
- Do not infer a person, role, school, company, or project ownership from a weak handle alone.
- Public artifacts can support evidence after corroboration, but they are not identity by themselves.

### `POST /intake/enrich`

This endpoint builds on `/intake/classify`. It returns deterministic, URL-derived artifact cards that can later feed profile quality, event matching, and intro suggestions without pretending that a handle or repo owner is a person.

Request:

```json
{
  "urls": [
    "https://github.com/example/example-repo",
    "https://devpost.com/software/example-project",
    "https://huggingface.co/spaces/example/demo"
  ]
}
```

Response excerpt:

```json
{
  "enrichments": [
    {
      "normalizedUrl": "https://github.com/example/example-repo",
      "route": "public_artifact_enricher",
      "card": {
        "provider": "github",
        "objectKind": "repository",
        "stableId": "example/example-repo",
        "title": "example/example-repo",
        "subtitle": "GitHub repository",
        "canSupportPersonProfile": true,
        "canInferPersonIdentity": false,
        "evidence": [
          {
            "field": "github_owner",
            "value": "example",
            "source": "url",
            "confidence": "high"
          }
        ],
        "matchSeeds": [
          {
            "kind": "provider",
            "value": "github",
            "confidence": "high"
          }
        ]
      }
    }
  ]
}
```

Use this before people matching when the user drops a non-LinkedIn public artifact. It is intentionally conservative: artifact evidence can improve a profile after corroboration, but it never establishes a person by itself.

### `POST /profile`

Request:

```json
{
  "url": "https://www.linkedin.com/in/example-person/",
  "mode": "public_web_enriched",
  "strictIdentity": true,
  "productName": "WarmIntro",
  "productSummary": "WhatsApp-first networking assistant that turns public profiles into intro-ready briefs.",
  "productKeywords": ["networking", "sales", "introductions", "whatsapp"]
}
```

Response shape:

```json
{
  "kind": "profile | company | school | job | post | article | legacy_profile | directory | unknown",
  "stableId": "example-person",
  "hostVariant": "www.linkedin.com",
  "canonicalSlug": "example-person",
  "name": "Example Person",
  "slug": "example-person-123",
  "workOrStudy": "Student at NUS",
  "currentRole": "Student",
  "organization": "NUS",
  "status": "authwall",
  "whatTheyDo": "Working on legal AI and hackathon projects.",
  "awards": [
    {
      "event": "OpenAI Open Model Hackathon",
      "result": "Winner Most Useful Fine-Tune",
      "sourceUrl": "https://devpost.com/software/..."
    }
  ],
  "impressiveProjects": [
    {
      "name": "PACMAN.ai",
      "whyImpressive": "Public hackathon project page with concrete build details.",
      "skills": ["AI", "RAG"],
      "sourceUrl": "https://devpost.com/software/pacman-ai"
    }
  ],
  "topSkills": ["AI", "RAG", "Open source"],
  "strongestSignals": ["PACMAN.ai", "Dental Assessment GPT"],
  "bestIntroAngle": "Lead with PACMAN.ai and ask what they are building next.",
  "links": [
    {
      "label": "Devpost",
      "url": "https://devpost.com/itsarnavsalkade"
    }
  ],
  "nextStep": "Ask for a resume or profile export for deeper history."
}
```

### `POST /profile/text`

Returns a terminal/share-card version:

```text
Example Person
Work / Study: Student at NUS
Role: Student @ NUS

What they do: Working on legal AI and hackathon projects.

Awards / Competitions:
- OpenAI Open Model Hackathon: Winner Most Useful Fine-Tune

Top projects:
- PACMAN.ai: Public hackathon project page with concrete build details.
```

## Local run

```bash
npm install
npx playwright install chromium
npm run dev
```

Then call it:

```bash
curl -X POST http://localhost:3001/profile \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/company/openai/",
    "productName": "WarmIntro",
    "productSummary": "WhatsApp-first networking assistant",
    "productKeywords": ["ai", "messaging", "productivity"]
  }'
```

Quick script:

```bash
chmod +x scripts/profile_card.sh
scripts/profile_card.sh "https://www.linkedin.com/in/example-person/"
```

## Modes

- `url_only`
  returns only LinkedIn object classification and stable identifiers
- `linkedin_only`
  returns only facts visible on LinkedIn itself
- `public_web_enriched`
  combines LinkedIn-visible facts with public-web evidence

Keep `strictIdentity: true` for the bot so vanity slugs like `ojasx` do not become fake names.

## Deploy to Render

GitHub repo:

```text
https://github.com/Arnie016/ycombbot
```

This repo already includes `render.yaml`.

Render steps:

1. In Render, click `New`.
2. Choose `Blueprint`.
3. Connect `Arnie016/ycombbot`.
4. Let Render read `render.yaml`.
5. Set `EXA_API_KEY`.
6. Set `OPENAI_API_KEY`.
7. Apply the blueprint.

Expected live endpoints:

- `https://<service-name>.onrender.com/health`
- `https://<service-name>.onrender.com/profile`
- `https://<service-name>.onrender.com/profile/text`

## Basic WhatsApp bot workflow

1. User sends a LinkedIn URL to your bot.
2. Bot calls `POST /profile`.
3. Bot formats the response into a short message:
   `Name`
   `Work / Study`
   `Awards / Competitions`
   `Top projects`
   `Top skills`
4. Bot returns the shareable reply or a button/QR/share-link flow.

## Best way to share this with friends

- Host this as one small backend service.
- Keep the WhatsApp bot as a separate thin client that only sends URLs and renders the reply.
- Add per-user rate limits and logs on the bot side, not inside the scraper first.
- Cache results by canonical LinkedIn URL for a few hours so repeated links are cheap.

That gives you one source of truth for extraction and lets multiple friends use the same WhatsApp bot without each running a browser locally.

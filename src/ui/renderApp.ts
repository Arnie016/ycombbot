export function renderApp(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LinkedIn Insight Scraper</title>
    <style>
      :root {
        --bg: #0b1117;
        --panel: #121b23;
        --panel-2: #17232d;
        --text: #e9f1f5;
        --muted: #9db0bc;
        --line: rgba(255,255,255,0.08);
        --accent: #5bc0a5;
        --accent-2: #ffc36b;
        --danger: #ff7b72;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(91,192,165,0.14), transparent 32%),
          radial-gradient(circle at top right, rgba(255,195,107,0.12), transparent 28%),
          var(--bg);
        color: var(--text);
      }
      .wrap {
        width: min(1100px, calc(100vw - 32px));
        margin: 32px auto 64px;
      }
      .hero, .card {
        background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
        border: 1px solid var(--line);
        border-radius: 22px;
        backdrop-filter: blur(10px);
      }
      .hero {
        padding: 28px;
        margin-bottom: 18px;
      }
      h1, h2, h3, p { margin: 0; }
      .eyebrow {
        color: var(--accent);
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .title {
        margin-top: 10px;
        font-size: clamp(30px, 4vw, 54px);
        line-height: 0.96;
        max-width: 760px;
      }
      .sub {
        margin-top: 14px;
        color: var(--muted);
        max-width: 700px;
        line-height: 1.5;
        font-size: 15px;
      }
      form {
        display: grid;
        gap: 12px;
        margin-top: 22px;
      }
      .grid {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 12px;
      }
      input, textarea, button {
        width: 100%;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: var(--panel);
        color: var(--text);
        padding: 14px 16px;
        font: inherit;
      }
      textarea { min-height: 94px; resize: vertical; }
      button {
        background: linear-gradient(135deg, var(--accent), #358f79);
        color: #07140f;
        font-weight: 700;
        cursor: pointer;
      }
      button:disabled { opacity: 0.6; cursor: progress; }
      .result {
        display: grid;
        gap: 14px;
        margin-top: 18px;
      }
      .summary {
        display: grid;
        gap: 14px;
        grid-template-columns: 1.4fr 1fr;
      }
      .card {
        padding: 20px;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        background: rgba(91,192,165,0.12);
        color: var(--accent);
      }
      .status.authwall {
        background: rgba(255,123,114,0.14);
        color: var(--danger);
      }
      .metric {
        color: var(--muted);
        font-size: 13px;
      }
      .big {
        margin-top: 10px;
        font-size: 28px;
        line-height: 1.1;
      }
      .text {
        margin-top: 10px;
        color: var(--muted);
        line-height: 1.6;
      }
      .pill-row, .signal-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }
      .pill, .signal {
        border: 1px solid var(--line);
        background: var(--panel-2);
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 13px;
      }
      .links {
        display: grid;
        gap: 10px;
      }
      .link-item {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        padding: 12px 14px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: var(--panel);
      }
      .link-item a {
        color: var(--text);
        text-decoration: none;
      }
      .link-kind {
        color: var(--accent-2);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      pre {
        margin: 0;
        padding: 16px;
        white-space: pre-wrap;
        word-break: break-word;
        background: #0a1015;
        border-radius: 16px;
        border: 1px solid var(--line);
        color: #d7e3ea;
        overflow: auto;
      }
      .hidden { display: none; }
      @media (max-width: 860px) {
        .grid, .summary { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="hero">
        <div class="eyebrow">Public Profile Intelligence</div>
        <h1 class="title">Turn a LinkedIn URL into a clean best-foot-forward brief.</h1>
        <p class="sub">This view favors signal over exhaust. It tries direct LinkedIn extraction first, then falls back to public-footprint discovery when LinkedIn is gated.</p>
        <form id="inspect-form">
          <div class="grid">
            <input id="url" name="url" placeholder="https://www.linkedin.com/in/example/" required />
            <input id="productName" name="productName" placeholder="Optional product name" />
          </div>
          <textarea id="productSummary" name="productSummary" placeholder="Optional context: what are you trying to learn or pitch?"></textarea>
          <button id="submit" type="submit">Inspect profile</button>
        </form>
      </section>
      <section id="result" class="result hidden">
        <div class="summary">
          <div class="card">
            <div id="status" class="status">Public</div>
            <div id="displayName" class="big"></div>
            <div id="subtitle" class="metric" style="margin-top: 8px;"></div>
            <p id="summary" class="text"></p>
            <div id="strengths" class="pill-row"></div>
          </div>
          <div class="card">
            <div class="eyebrow">What matters</div>
            <div id="signals" class="signal-row"></div>
            <div class="eyebrow" style="margin-top: 18px;">Next step</div>
            <p id="nextStep" class="text"></p>
            <div id="sourceCount" class="metric" style="margin-top: 16px;"></div>
          </div>
        </div>
        <div class="card">
          <div class="eyebrow">Best links</div>
          <div id="links" class="links" style="margin-top: 14px;"></div>
        </div>
        <div class="card">
          <div class="eyebrow">Raw JSON</div>
          <pre id="raw"></pre>
        </div>
      </section>
    </div>
    <script>
      const form = document.getElementById('inspect-form');
      const result = document.getElementById('result');
      const submit = document.getElementById('submit');

      function setText(id, value) {
        document.getElementById(id).textContent = value || '';
      }

      function renderPills(id, values, className) {
        const container = document.getElementById(id);
        container.innerHTML = '';
        for (const value of values || []) {
          const span = document.createElement('span');
          span.className = className;
          span.textContent = value;
          container.appendChild(span);
        }
      }

      function renderLinks(links) {
        const container = document.getElementById('links');
        container.innerHTML = '';
        for (const link of links || []) {
          const item = document.createElement('div');
          item.className = 'link-item';
          item.innerHTML = '<a target="_blank" rel="noreferrer"></a><span class="link-kind"></span>';
          const anchor = item.querySelector('a');
          const kind = item.querySelector('.link-kind');
          anchor.href = link.url;
          anchor.textContent = link.label;
          kind.textContent = link.kind;
          container.appendChild(item);
        }
      }

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submit.disabled = true;
        submit.textContent = 'Inspecting…';

        const body = {
          url: document.getElementById('url').value.trim(),
          productName: document.getElementById('productName').value.trim() || undefined,
          productSummary: document.getElementById('productSummary').value.trim() || undefined
        };

        try {
          const response = await fetch('/inspect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Request failed');
          }

          const presentation = data.presentation || {};
          result.classList.remove('hidden');
          setText('displayName', presentation.displayName);
          setText('subtitle', presentation.subtitle);
          setText('summary', presentation.summary);
          setText('nextStep', presentation.nextStep);
          setText('sourceCount', presentation.sourceCount ? 'Public sources used: ' + presentation.sourceCount : '');

          const statusEl = document.getElementById('status');
          statusEl.textContent = presentation.status || 'partial';
          statusEl.className = 'status ' + (presentation.status || 'partial');

          renderPills('strengths', presentation.topStrengths || [], 'pill');
          renderPills('signals', presentation.topSignals || [], 'signal');
          renderLinks(presentation.bestLinks || []);
          setText('raw', JSON.stringify(data, null, 2));
        } catch (error) {
          alert(error.message || 'Request failed');
        } finally {
          submit.disabled = false;
          submit.textContent = 'Inspect profile';
        }
      });
    </script>
  </body>
</html>`;
}

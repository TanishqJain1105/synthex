# Deploying Synthex

Split deploy: **backend + datastores on Render**, **frontend on Vercel**.
Config lives in [`render.yaml`](./render.yaml) and [`vercel.json`](./vercel.json).

Do the steps **in this order** — the two platforms reference each other's URLs.

---

## 0. SECURITY — rotate keys before you deploy (do this first)

> **Rotate all three API keys before the first production deploy.** An earlier
> `.env` was committed to git history (commits `fb9f82e` and `1e06ee5`) exposing
> the **Serper** and **Voyage** keys. Even though `.env` is no longer tracked, the
> secrets remain reachable in the history of this repo and must be treated as
> compromised. The Groq key was never committed, but rotate it too as a precaution
> since local `.env` values are handled during development.

Rotate each from its dashboard, then paste the **new** values into Render (step 1.3):

- **Groq** — https://console.groq.com/keys → revoke old, create new `GROQ_API_KEY`.
- **Serper** — https://serper.dev/api-key → regenerate `SERPER_API_KEY` (old value `489b7…` is burned).
- **Voyage** — https://dashboard.voyageai.com/ → rotate `VOYAGE_API_KEY` (old value `pa-ITMT…` is burned).

Never paste real keys into `.env.example`, `render.yaml`, or any tracked file — they
belong only in the Render dashboard (`sync: false`) and Vercel env settings.

If you want the leaked values gone from git history entirely (not just rotated),
scrub them with `git filter-repo` or BFG and force-push — but **rotating the keys is
the actual fix**; history scrubbing is cosmetic once the old keys are dead.

---

## 1. Backend → Render (do this first)

1. Push this repo to GitHub (already at `github.com/TanishqJain1105/synthex`).
2. Render Dashboard → **New → Blueprint** → select the `synthex` repo → **Apply**.
   This creates: `synthex-api` (web), `synthex-db` (Postgres), `synthex-redis` (Key Value).
3. When prompted, paste the secret env vars (marked `sync: false`):
   - `GROQ_API_KEY`
   - `SERPER_API_KEY`
   - `VOYAGE_API_KEY`
   - `WEB_ORIGIN` → leave blank for now, fill in after step 2 (your Vercel URL).
4. **Initialize the database schema.** Once `synthex-db` is live, open its
   **Connect → PSQL Command**, then run:
   ```bash
   psql <EXTERNAL_DATABASE_URL> -f src/db/schema.sql
   ```
   This enables the `vector` extension and creates all tables. (Render's managed
   Postgres 16 supports `CREATE EXTENSION vector`.)
5. Copy the API URL, e.g. `https://synthex-api.onrender.com`.

> **Plan note:** `render.yaml` defaults every service to `free`. Free web services
> sleep after ~15 min idle (killing in-flight research jobs and SSE streams) and
> free Postgres expires after 30 days. For anything real, bump `synthex-api` to
> `starter` and the database to a paid plan.

---

## 2. Frontend → Vercel

1. Vercel → **Add New → Project** → import the `synthex` repo.
2. **Root Directory: leave as repo root** (`./`). `vercel.json` handles the
   workspace build (`web/dist` output) — do **not** set root to `web/`, or the
   `@synthex/shared` types won't resolve.
3. Set environment variables (Build & Production):
   - `VITE_API_URL` = your Render API URL from step 1.5 (e.g. `https://synthex-api.onrender.com`)
   - `VITE_SSE_STALL_TIMEOUT_MS` = `30000` (optional)
4. Deploy. Copy the resulting URL, e.g. `https://synthex.vercel.app`.

> Vite inlines `VITE_*` vars **at build time** — if you change `VITE_API_URL`
> later you must redeploy the frontend.

---

## 3. Close the loop (CORS)

Back in Render → `synthex-api` → **Environment**, set:

- `WEB_ORIGIN` = your Vercel URL from step 2.4 (e.g. `https://synthex.vercel.app`)

Save → Render redeploys → CORS is now locked to your frontend origin.

---

## Verify

- `GET https://synthex-api.onrender.com/health` → `{"status":"ok"}`
- Open the Vercel URL, submit a query, watch the live agent feed stream.

## Playwright note

The `scrape_url` tool falls back to headless Chromium for JS-heavy pages. `render.yaml`
now deploys `synthex-api` on the **Docker runtime** (`runtime: docker`, built from
[`Dockerfile`](./Dockerfile)), which is based on the official Playwright image and
ships Chromium plus all its system libs — so the JS-heavy fallback works in production.

If you ever revert the API to Render's native Node runtime, Chromium can't launch there
and `scrape_url` **degrades gracefully to Cheerio** (see `src/tools/scrape-url.tool.ts`):
static pages scrape fine, heavily client-rendered pages return less text.

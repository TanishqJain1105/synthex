# Synthex

> Multi-agent autonomous deep research system. Five specialized AI agents
> (Orchestrator, Planner, parallel Researchers, Critic, Synthesizer) coordinate
> via a Redis message bus to plan, search, verify, and synthesize cited answers
> to complex research questions. **From noise to knowledge.**

LLM inference runs on the **Groq API** (OpenAI-compatible chat completions, via
the official `groq-sdk`). Embeddings run on **Voyage AI** (Groq has no embeddings
endpoint). See [`CLAUDE.md`](./CLAUDE.md) for the full architecture.

## Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL + pgvector and Redis)
- A **Groq API key** — https://console.groq.com/keys
- A **Voyage AI key** (embeddings) and a **Serper key** (web search)

## Setup

```bash
# 1. Configure environment
cp .env.example .env
#    then fill in GROQ_API_KEY, VOYAGE_API_KEY, SERPER_API_KEY

# 2. Start PostgreSQL (pgvector) + Redis
docker compose up -d

# 3. Create tables + enable pgvector
docker exec -i synthex-postgres-1 psql -U synthex -d synthex < src/db/schema.sql

# 4. Install dependencies
npm install

# 5. Start the backend (http://localhost:3000)
npm run dev:api

# 6. Start the frontend (http://localhost:5173) in a second terminal
npm run dev:web
```

## Environment variables

| Variable        | Purpose                                                        |
| --------------- | ------------------------------------------------------------- |
| `GROQ_API_KEY`  | Groq LLM inference (all five agents)                          |
| `GROQ_MODEL`    | Groq chat model (default `llama-3.3-70b-versatile`)          |
| `VOYAGE_API_KEY`| Voyage embeddings (`voyage-large-2`, 1536-dim → pgvector)     |
| `SERPER_API_KEY`| Serper web search                                             |
| `DATABASE_URL`  | PostgreSQL connection string                                  |
| `REDIS_URL`     | Redis connection string                                       |
| `WEB_ORIGIN`    | Frontend origin allowed by CORS (default `http://localhost:5173`) |
| `VITE_API_URL`  | Backend URL the frontend calls (default `http://localhost:3000`)  |

See `.env.example` for the full list and defaults.

## Switching LLM model / provider

Groq is OpenAI-compatible, so retargeting is a config change: set `GROQ_MODEL` to
any Groq production model, or point the client base URL at another
OpenAI-compatible provider in `src/agents/base.agent.ts`.

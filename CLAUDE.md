# Synthex — CLAUDE.md

> Multi-agent autonomous deep research system. Five specialized AI agents coordinate via a Redis message bus to plan, search, verify, and synthesize answers to complex research questions.

---

## What this project is

Synthex is a full-stack AI application where a user submits a research question and a swarm of specialized agents autonomously handles the entire research pipeline — from query decomposition to final cited report. The system uses multi-hop reasoning, parallel execution, and a critic-verification loop to produce high-quality, source-backed answers.

**Tagline:** From noise to knowledge.

---

## Project structure

```
synthex/
├── src/                         # Node.js + Express backend (TypeScript)
│   ├── agents/                  # One file per agent — the core of the system
│   │   ├── base.agent.ts        # Abstract base class all agents extend
│   │   ├── orchestrator.agent.ts
│   │   ├── planner.agent.ts
│   │   ├── researcher.agent.ts
│   │   ├── critic.agent.ts
│   │   └── synthesizer.agent.ts
│   ├── tools/                   # Claude tool-use definitions
│   │   ├── web-search.tool.ts   # Serper API wrapper
│   │   ├── arxiv-search.tool.ts # ArXiv API wrapper
│   │   ├── scrape-url.tool.ts   # Cheerio/Playwright scraper
│   │   ├── embed-chunk.tool.ts  # Chunk + embed into pgvector
│   │   ├── rag-retrieve.tool.ts # Semantic search over vector store
│   │   └── score-source.tool.ts # Source credibility scorer
│   ├── queue/                   # Redis + BullMQ async task system
│   │   ├── research.queue.ts    # Queue definition and helpers
│   │   ├── worker.ts            # Spawns parallel researcher workers
│   │   └── job-types.ts        # Typed job payloads
│   ├── memory/                  # Shared inter-agent memory layer
│   │   ├── vector-store.ts      # pgvector read/write wrapper
│   │   ├── scratchpad.ts        # In-progress findings store (Redis)
│   │   └── message-bus.ts       # Agent-to-agent event emitter
│   ├── routes/                  # Express API routes
│   │   ├── research.route.ts    # POST /api/research — starts a job
│   │   ├── stream.route.ts      # GET /api/stream/:jobId — SSE events
│   │   └── history.route.ts     # GET /api/history — past research
│   ├── db/
│   │   ├── schema.sql           # PostgreSQL schema with pgvector
│   │   └── client.ts            # pg client singleton
│   ├── prompts/                 # System prompts — one per agent
│   │   ├── orchestrator.prompt.ts
│   │   ├── planner.prompt.ts
│   │   ├── researcher.prompt.ts
│   │   ├── critic.prompt.ts
│   │   └── synthesizer.prompt.ts
│   └── index.ts                 # Express app entry point
│
├── web/                         # React + Vite + Tailwind frontend
│   └── src/
│       ├── components/
│       │   ├── QueryInput.tsx        # Main search input
│       │   ├── AgentFeed.tsx         # Live activity feed (all agents)
│       │   ├── AgentCard.tsx         # Per-agent status + progress
│       │   ├── ReportViewer.tsx      # Final report with citations
│       │   ├── CitationBadge.tsx     # Inline [1] style source links
│       │   ├── ConfidenceBar.tsx     # Critic score visualisation
│       │   └── HistorySidebar.tsx    # Past queries + saved reports
│       ├── hooks/
│       │   ├── useResearch.ts        # POST query + manage SSE lifecycle
│       │   └── useAgentStream.ts     # EventSource listener + state
│       ├── stores/
│       │   └── research.store.ts     # Zustand global state
│       └── pages/
│           ├── Home.tsx              # Landing + query entry
│           └── Report.tsx            # Report detail view
│
├── shared/                      # Shared TypeScript types (used by both src/ and web/)
│   └── types/
│       ├── agent.types.ts        # AgentStatus, AgentRole, AgentEvent
│       ├── research.types.ts     # Query, Finding, Report, Citation
│       └── queue.types.ts        # JobPayload, JobResult, JobStatus
│
├── CLAUDE.md                    # This file
├── docker-compose.yml           # PostgreSQL + pgvector + Redis locally
├── .env.example                 # All required env vars documented
├── tsconfig.json
└── package.json                 # Root — workspaces for src/ web/ shared/
```

---

## The five agents

### Orchestrator

- **Role:** Director. Never does research itself.
- **Receives:** Raw user query
- **Does:** Classifies the query type (factual / exploratory / comparative / causal), decides how many researcher agents to spawn, monitors all agent outputs, decides when confidence is sufficient, triggers re-query if the Critic rejects findings.
- **Key tools:** `spawn_agent`, `read_scratchpad`, `write_event`
- **System prompt file:** `src/prompts/orchestrator.prompt.ts`

### Planner

- **Role:** Strategist. Turns one big question into parallel search tasks.
- **Receives:** Classified query from Orchestrator
- **Does:** Decomposes into 3–6 distinct subtasks, assigns each a search strategy (web / academic / news / domain-specific), writes structured task messages to the Redis queue, identifies knowledge gaps after the first research round.
- **Key tools:** `enqueue_task`, `write_scratchpad`
- **System prompt file:** `src/prompts/planner.prompt.ts`

### Researcher (runs as N parallel instances)

- **Role:** Investigator. Each instance handles one subtask from the queue.
- **Receives:** One task payload from BullMQ
- **Does:** Searches web via Serper, searches academic papers via ArXiv, scrapes full page content via Cheerio/Playwright, chunks content into ~500 token segments, embeds each chunk into pgvector, writes a structured Finding object to the scratchpad.
- **Key tools:** `web_search`, `arxiv_search`, `scrape_url`, `embed_chunk`
- **System prompt file:** `src/prompts/researcher.prompt.ts`

### Critic

- **Role:** Devil's advocate. Runs after all researcher instances complete.
- **Receives:** All Finding objects from the shared scratchpad
- **Does:** Cross-checks facts across sources, flags direct contradictions, scores each source on recency + authority + corroboration count, calculates an overall confidence score (0.0–1.0), sends an "insufficient" signal to Orchestrator if confidence < 0.7 (max 3 re-query rounds).
- **Key tools:** `read_all_findings`, `score_source`, `flag_contradiction`
- **System prompt file:** `src/prompts/critic.prompt.ts`

### Synthesizer

- **Role:** Writer. Only runs after Critic approves findings.
- **Receives:** Critic-approved findings via RAG retrieval from pgvector
- **Does:** Embeds the original query and retrieves most relevant chunks, writes a structured report (executive summary → sections → knowledge gaps), adds inline [1][2] citations that link to source URLs, attaches overall confidence score and "gaps remaining" list, streams the report token-by-token to the frontend via SSE.
- **Key tools:** `rag_retrieve`, `generate_citations`, `stream_output`
- **System prompt file:** `src/prompts/synthesizer.prompt.ts`

---

## Agent communication flow

```
User query
  → Orchestrator (classify + route)
    → Planner (decompose → N tasks in Redis queue)
      → Researcher A (subtask 1) ─┐
      → Researcher B (subtask 2) ─┼─→ pgvector + scratchpad
      → Researcher C (subtask 3) ─┘
        → Critic (verify all findings)
          → if confidence < 0.7: back to Orchestrator (max 3 loops)
          → if confidence ≥ 0.7:
            → Synthesizer (RAG + write report → SSE stream → frontend)
```

---

## Shared memory layer

All agents read and write to the same memory layer. This is what makes the system multi-agent rather than a chain of isolated LLM calls.

| Store            | Technology                           | Purpose                                          |
| ---------------- | ------------------------------------ | ------------------------------------------------ |
| `vector-store`   | PostgreSQL + pgvector                | Embedded research chunks, semantic retrieval     |
| `scratchpad`     | Redis hash                           | Live findings during a research session          |
| `message-bus`    | Node.js EventEmitter + Redis pub/sub | Agent-to-agent event passing                     |
| `research.queue` | BullMQ (Redis)                       | Task distribution to parallel researcher workers |

---

## SSE event schema

Every agent emits structured events that stream to the frontend in real time. The frontend `useAgentStream` hook listens on `GET /api/stream/:jobId`.

```typescript
type AgentEvent = {
  jobId: string;
  agentRole:
    | "orchestrator"
    | "planner"
    | "researcher"
    | "critic"
    | "synthesizer";
  type:
    | "thinking"
    | "tool_call"
    | "tool_result"
    | "finding"
    | "score"
    | "report_chunk"
    | "done"
    | "error";
  payload: Record<string, unknown>;
  timestamp: number;
};
```

---

## Tech stack

| Layer            | Technology                                   |
| ---------------- | -------------------------------------------- |
| Backend runtime  | Node.js 20 + TypeScript                      |
| Web framework    | Express 5                                    |
| AI               | Groq API (llama-3.3-70b-versatile, OpenAI-compatible) |
| Vector DB        | PostgreSQL 16 + pgvector extension           |
| Task queue       | Redis 7 + BullMQ                             |
| Web scraping     | Cheerio (fast) + Playwright (JS-heavy pages) |
| Web search       | Serper API                                   |
| Academic search  | ArXiv REST API (free)                        |
| Frontend         | React 18 + Vite + Tailwind CSS               |
| State management | Zustand                                      |
| Streaming        | Server-Sent Events (SSE)                     |
| Local dev        | Docker Compose (Postgres + Redis)            |
| Deploy (API)     | Render                                       |
| Deploy (Web)     | Vercel                                       |

---

## Environment variables

Copy `.env.example` to `.env` and fill in:

```bash
# Groq (LLM inference — OpenAI-compatible chat completions)
GROQ_API_KEY=gsk_...          # console.groq.com/keys
GROQ_MODEL=llama-3.3-70b-versatile   # any Groq production chat model

# Database
DATABASE_URL=postgresql://synthex:synthex@localhost:5432/synthex

# Redis
REDIS_URL=redis://localhost:6379

# Search APIs
SERPER_API_KEY=...           # serper.dev — web search (serper.dev, free tier 2500 req)
VOYAGE_API_KEY=...           # voyageai.com — embeddings (free tier 50M tokens)

# Agent tuning
MAX_RESEARCHER_AGENTS=3      # how many parallel researchers to spawn
MAX_REQUERY_ROUNDS=3         # critic re-query limit before accepting
CRITIC_CONFIDENCE_THRESHOLD=0.7

# Frontend
VITE_API_URL=http://localhost:3000

# SSE watchdog — how long (ms) the client waits with no events before
# declaring the job stalled and showing an error banner (default 30s)
VITE_SSE_STALL_TIMEOUT_MS=30000
```

---

## Local development

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Set up database (creates tables + enables pgvector)
psql $DATABASE_URL -f src/db/schema.sql

# 3. Install dependencies
npm install

# 4. Start backend
npm run dev:api        # runs on :3000

# 5. Start frontend (new terminal)
npm run dev:web        # runs on :5173
```

---

## Key design decisions

**Why no LangChain or LlamaIndex?**
Building the agent loop from scratch using the raw Groq API (OpenAI-compatible chat completions with tool use, via the official `groq-sdk`). This gives full control over agent behaviour and is significantly more impressive on a resume than wrapping a library. It also means you understand exactly what's happening at every step. Groq is a drop-in swap for any OpenAI-compatible provider — change `GROQ_MODEL` (and the base client) to retarget.

**Why BullMQ for the task queue instead of just Promise.all?**
Researcher agents need to be independently retryable, observable, and rate-limited per API. BullMQ gives you job retries, concurrency control, and a dashboard out of the box. It also means the system is genuinely distributed — workers could run on separate machines.

**Why pgvector instead of Pinecone or Chroma?**
pgvector keeps the vector store inside the same PostgreSQL database as the rest of the app. No extra service, no extra cost, same backup strategy. For a project of this scale it's the right call.

**Why SSE instead of WebSockets?**
SSE is unidirectional (server → client) which is exactly what agent streaming needs. It's simpler than WebSockets, works over HTTP/2, and reconnects automatically. WebSockets would add complexity for no benefit here.

**Why separate system prompts per agent?**
Each agent has a completely different persona, goal, and constraint set. The Orchestrator must never do research itself. The Critic must be adversarial. The Synthesizer must only use verified findings. Mixing these into one prompt would produce confused, unfocused behaviour.

---

## Database schema (overview)

```sql
-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Research sessions
CREATE TABLE research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending | running | done | failed
  confidence_score FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Embedded research chunks (the vector store)
CREATE TABLE research_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES research_jobs(id),
  content TEXT NOT NULL,
  embedding vector(1536),         -- Claude embedding dimension
  source_url TEXT,
  source_title TEXT,
  credibility_score FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON research_chunks USING ivfflat (embedding vector_cosine_ops);

-- Final synthesized reports
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES research_jobs(id) UNIQUE,
  content TEXT NOT NULL,          -- markdown with inline [n] citations
  citations JSONB,                -- [{n, url, title, credibility}]
  knowledge_gaps TEXT[],
  confidence_score FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Adding a new agent

1. Create `src/agents/your-agent.agent.ts` extending `BaseAgent`
2. Define its tools in `src/tools/`
3. Write its system prompt in `src/prompts/your-agent.prompt.ts`
4. Add its `AgentRole` to `shared/types/agent.types.ts`
5. Wire it into the Orchestrator's routing logic

---

## Known limitations & mitigations

**SSE reconnect after backend kill**
If the backend process dies mid-query, `EventSource` auto-reconnects but the in-memory job state is gone server-side. The UI will sit on "working" indefinitely. Mitigation: the `useAgentStream` hook runs a stall-timeout watchdog — if no SSE event arrives within `VITE_SSE_STALL_TIMEOUT_MS` (default 30s), it closes the stream, marks the job as `stalled`, and shows an error banner prompting the user to resubmit. The job is NOT lost — the scratchpad and any embedded chunks persist in Redis/pgvector and can be resumed in a future implementation.

**Nonsense / unclassifiable queries**
The Orchestrator catches queries it cannot classify and returns an `error` event immediately. The frontend shows a red error banner and resets the status pill out of "working". No eternal spinner.

**Serper API failure (no internet / rate limit)**
The Researcher agent catches Serper errors, logs them, and continues with whatever results it has. The Critic will score the finding set low (likely triggering a re-query round), but if all rounds fail, the Synthesizer writes a low-confidence report rather than crashing. The error is surfaced in the agent feed as a tool_result error event.

**Embedding model**
Synthex uses Voyage AI (`voyage-large-2`, 1536-dim) for embeddings — Groq does not offer an embeddings endpoint, so embeddings stay on Voyage. The pgvector schema column is `vector(1536)` to match. Do not change the embedding model without also running a migration to update all existing `research_chunks` rows.

---

## Resume bullet

> Built Synthex — a multi-agent autonomous research system with 5 specialized AI agents (Orchestrator, Planner, 3× parallel Researchers, Critic, Synthesizer) coordinating via Redis message bus. Implemented RAG pipeline with pgvector, multi-hop re-query loops, contradiction detection, and real-time SSE streaming. Full-stack TypeScript, deployed on Vercel + Render.

---

_Built by Tanishq — B.E. Information Science & Engineering, NIE Mysuru_

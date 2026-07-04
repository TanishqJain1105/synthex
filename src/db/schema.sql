CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  confidence_score FLOAT,
  requery_count INT DEFAULT 0,     -- number of research rounds run (capped at MAX_REQUERY_ROUNDS)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES research_jobs(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  source_url TEXT,
  source_title TEXT,
  credibility_score FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_chunks_embedding_idx
  ON research_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES research_jobs(id) ON DELETE CASCADE UNIQUE,
  content TEXT NOT NULL,
  citations JSONB,
  knowledge_gaps TEXT[],
  confidence_score FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);

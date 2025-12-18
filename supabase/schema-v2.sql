-- Prover Schema v2 - Auth + Workspaces
-- Run this in your Supabase SQL Editor

-- Enable pgvector extension
create extension if not exists vector;

-- =============================================
-- WORKSPACES TABLE
-- =============================================
create table if not exists prover_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  website_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Index for user lookups
create index if not exists idx_workspaces_user on prover_workspaces (user_id);

-- =============================================
-- CHUNKS TABLE (updated to reference workspace)
-- =============================================
-- If migrating from tenant_id, you'll need to migrate data first
-- For fresh install, use this schema:

create table if not exists prover_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references prover_workspaces(id) on delete cascade,
  doc_type text not null,  -- 'case_study', 'icp', 'account', 'contact', 'note'
  doc_id text not null,
  chunk_id text not null,
  chunk_type text not null,  -- 'match_signal', 'problem_trigger', 'insight_outcome', etc.
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}',
  created_at timestamp with time zone default now()
);

-- Indexes
create index if not exists idx_chunks_workspace on prover_chunks (workspace_id);
create index if not exists idx_chunks_workspace_doctype on prover_chunks (workspace_id, doc_type);
create index if not exists idx_chunks_workspace_chunktype on prover_chunks (workspace_id, chunk_type);

-- Vector similarity index
create index if not exists idx_chunks_embedding on prover_chunks
using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- =============================================
-- SIMILARITY SEARCH (updated for workspace_id)
-- =============================================
create or replace function workspace_similarity_search(
  query_embedding vector(1536),
  ws_id uuid,
  chunk_types text[] default null,
  match_count int default 10,
  similarity_threshold float default 0.5
) returns table (
  id uuid,
  doc_type text,
  doc_id text,
  chunk_id text,
  chunk_type text,
  content text,
  metadata jsonb,
  similarity float
) language plpgsql as $$
begin
  return query
  select
    pc.id,
    pc.doc_type,
    pc.doc_id,
    pc.chunk_id,
    pc.chunk_type,
    pc.content,
    pc.metadata,
    1 - (pc.embedding <=> query_embedding) as similarity
  from prover_chunks pc
  where pc.workspace_id = ws_id
    and (chunk_types is null or pc.chunk_type = any(chunk_types))
    and 1 - (pc.embedding <=> query_embedding) >= similarity_threshold
  order by pc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
alter table prover_workspaces enable row level security;
alter table prover_chunks enable row level security;

-- Workspaces: users can only access their own
create policy "Users can view own workspaces"
  on prover_workspaces for select
  using (auth.uid() = user_id);

create policy "Users can create own workspaces"
  on prover_workspaces for insert
  with check (auth.uid() = user_id);

create policy "Users can update own workspaces"
  on prover_workspaces for update
  using (auth.uid() = user_id);

create policy "Users can delete own workspaces"
  on prover_workspaces for delete
  using (auth.uid() = user_id);

-- Chunks: users can access chunks in their workspaces
create policy "Users can view chunks in own workspaces"
  on prover_chunks for select
  using (
    workspace_id in (
      select id from prover_workspaces where user_id = auth.uid()
    )
  );

create policy "Users can insert chunks in own workspaces"
  on prover_chunks for insert
  with check (
    workspace_id in (
      select id from prover_workspaces where user_id = auth.uid()
    )
  );

create policy "Users can delete chunks in own workspaces"
  on prover_chunks for delete
  using (
    workspace_id in (
      select id from prover_workspaces where user_id = auth.uid()
    )
  );

-- =============================================
-- PROSPECTS TABLE (CRM Data)
-- =============================================
create table if not exists prover_prospects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references prover_workspaces(id) on delete cascade,

  -- Company info
  company_name text not null,
  website_url text,
  industry text,
  company_size text,
  location text,
  description text,

  -- Contact info
  contact_name text,
  contact_title text,
  contact_email text,
  contact_linkedin text,

  -- Scoring & status
  score integer default 0,  -- 0-100
  score_reason text,
  status text default 'new',  -- 'new', 'contacted', 'qualified', 'proposal', 'won', 'lost'

  -- Enrichment data
  pain_points text[],
  proof_statement text,
  matched_case_studies text[],

  -- Metadata
  source text,  -- 'manual', 'web_search', 'import'
  notes text,
  tags text[],

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Indexes
create index if not exists idx_prospects_workspace on prover_prospects (workspace_id);
create index if not exists idx_prospects_status on prover_prospects (workspace_id, status);
create index if not exists idx_prospects_score on prover_prospects (workspace_id, score desc);

-- RLS for prospects
alter table prover_prospects enable row level security;

create policy "Users can view prospects in own workspaces"
  on prover_prospects for select
  using (
    workspace_id in (
      select id from prover_workspaces where user_id = auth.uid()
    )
  );

create policy "Users can insert prospects in own workspaces"
  on prover_prospects for insert
  with check (
    workspace_id in (
      select id from prover_workspaces where user_id = auth.uid()
    )
  );

create policy "Users can update prospects in own workspaces"
  on prover_prospects for update
  using (
    workspace_id in (
      select id from prover_workspaces where user_id = auth.uid()
    )
  );

create policy "Users can delete prospects in own workspaces"
  on prover_prospects for delete
  using (
    workspace_id in (
      select id from prover_workspaces where user_id = auth.uid()
    )
  );

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Get workspace chunk stats
create or replace function workspace_chunk_stats(ws_id uuid)
returns table (
  doc_type text,
  chunk_type text,
  count bigint
) language sql security definer as $$
  select doc_type, chunk_type, count(*)
  from prover_chunks
  where workspace_id = ws_id
  group by doc_type, chunk_type
  order by doc_type, chunk_type;
$$;

-- Get workspace prospect stats
create or replace function workspace_prospect_stats(ws_id uuid)
returns table (
  status text,
  count bigint,
  avg_score numeric
) language sql security definer as $$
  select status, count(*), avg(score)::numeric(5,1)
  from prover_prospects
  where workspace_id = ws_id
  group by status
  order by count desc;
$$;

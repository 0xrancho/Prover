-- Prover pgvector Schema
-- Run this in your Supabase SQL Editor to set up the database

-- Enable pgvector extension
create extension if not exists vector;

-- Main chunks table for semantic search
create table if not exists prover_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  doc_type text not null,  -- 'case_study', 'icp', 'account', 'contact', 'note'
  doc_id text not null,
  chunk_id text not null,
  chunk_type text not null,  -- 'match_signal', 'problem_trigger', 'insight_outcome', 'differentiator', 'icp_definition', 'icp_buyer', 'icp_negative', 'company_profile'
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}',
  created_at timestamp with time zone default now()
);

-- Indexes for efficient querying
create index if not exists idx_prover_chunks_tenant on prover_chunks (tenant_id);
create index if not exists idx_prover_chunks_tenant_doctype on prover_chunks (tenant_id, doc_type);
create index if not exists idx_prover_chunks_tenant_chunktype on prover_chunks (tenant_id, chunk_type);

-- Vector similarity index (IVFFlat for approximate nearest neighbor)
-- Note: Run this after you have some data, or use a smaller lists value for small datasets
create index if not exists idx_prover_chunks_embedding on prover_chunks
using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Similarity search function
create or replace function similarity_search(
  query_embedding vector(1536),
  tenant text,
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
  where pc.tenant_id = tenant
    and (chunk_types is null or pc.chunk_type = any(chunk_types))
    and 1 - (pc.embedding <=> query_embedding) >= similarity_threshold
  order by pc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Helper function to get chunk statistics for a tenant
create or replace function tenant_chunk_stats(tenant text)
returns table (
  doc_type text,
  chunk_type text,
  count bigint
) language sql as $$
  select doc_type, chunk_type, count(*)
  from prover_chunks
  where tenant_id = tenant
  group by doc_type, chunk_type
  order by doc_type, chunk_type;
$$;

-- Row-level security (optional, for multi-tenant isolation)
-- Uncomment if you want RLS enabled

-- alter table prover_chunks enable row level security;

-- create policy "Tenants can only see their own chunks"
--   on prover_chunks for select
--   using (tenant_id = current_setting('app.tenant_id', true));

-- create policy "Tenants can only insert their own chunks"
--   on prover_chunks for insert
--   with check (tenant_id = current_setting('app.tenant_id', true));

-- create policy "Tenants can only delete their own chunks"
--   on prover_chunks for delete
--   using (tenant_id = current_setting('app.tenant_id', true));

-- Add Prospects Table to Existing Schema
-- Run this in Supabase SQL Editor

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

-- Helper function for prospect stats
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

-- Schema Discovery Functions
-- Allows the agent to read table structure dynamically

-- Function to get column information for a table
CREATE OR REPLACE FUNCTION get_table_columns(table_name text)
RETURNS TABLE (
  column_name text,
  data_type text,
  is_nullable text,
  column_default text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    column_name::text,
    data_type::text,
    is_nullable::text,
    column_default::text
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND information_schema.columns.table_name = get_table_columns.table_name
  ORDER BY ordinal_position;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_table_columns(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_columns(text) TO service_role;

-- Rename prospects table to opportunities (if it exists as prospects)
-- Run this only if you haven't already renamed the table
-- ALTER TABLE IF EXISTS prover_prospects RENAME TO prover_opportunities;

-- Update the stats function for the new table name
CREATE OR REPLACE FUNCTION workspace_opportunity_stats(ws_id uuid)
RETURNS TABLE (
  status text,
  count bigint,
  avg_score numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    status,
    COUNT(*)::bigint as count,
    ROUND(AVG(score)::numeric, 1) as avg_score
  FROM prover_opportunities
  WHERE workspace_id = ws_id
  GROUP BY status
  ORDER BY count DESC;
$$;

GRANT EXECUTE ON FUNCTION workspace_opportunity_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION workspace_opportunity_stats(uuid) TO service_role;

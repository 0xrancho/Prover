import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.warn('Supabase URL not configured. Set NEXT_PUBLIC_SUPABASE_URL.');
}

// Client-side auth client (uses anon key, respects RLS)
export const supabaseClient = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    }
  }
);

// Server-side admin client (bypasses RLS for API routes)
// Only create if we have the service key (server-side only)
let supabaseAdmin = null;
if (supabaseServiceKey) {
  supabaseAdmin = createClient(
    supabaseUrl || '',
    supabaseServiceKey,
    {
      auth: { persistSession: false }
    }
  );
}

// Helper to get admin client (throws if not available)
function getAdminClient() {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not available. This function must be called server-side.');
  }
  return supabaseAdmin;
}

// Export admin client for server-side operations
export { supabaseAdmin };

// Legacy export for compatibility
export const supabase = supabaseAdmin;

// =============================================
// WORKSPACE FUNCTIONS
// =============================================

export async function createWorkspace(userId, name, websiteUrl = null) {
  const { data, error } = await getAdminClient()
    .from('prover_workspaces')
    .insert({ user_id: userId, name, website_url: websiteUrl })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getWorkspacesForUser(userId) {
  const { data, error } = await getAdminClient()
    .from('prover_workspaces')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getWorkspace(workspaceId) {
  const { data, error } = await getAdminClient()
    .from('prover_workspaces')
    .select('*')
    .eq('id', workspaceId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateWorkspace(workspaceId, updates) {
  const { data, error } = await getAdminClient()
    .from('prover_workspaces')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', workspaceId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteWorkspace(workspaceId) {
  const { error } = await getAdminClient()
    .from('prover_workspaces')
    .delete()
    .eq('id', workspaceId);

  if (error) throw error;
}

// =============================================
// CHUNK FUNCTIONS (updated for workspace_id)
// =============================================

export async function insertChunks(chunks) {
  const { data, error } = await getAdminClient()
    .from('prover_chunks')
    .insert(chunks)
    .select();

  if (error) throw error;
  return data;
}

export async function deleteChunksForWorkspace(workspaceId, docType = null) {
  let query = getAdminClient()
    .from('prover_chunks')
    .delete()
    .eq('workspace_id', workspaceId);

  if (docType) {
    query = query.eq('doc_type', docType);
  }

  const { error } = await query;
  if (error) throw error;
}

export async function similaritySearch(queryEmbedding, workspaceId, options = {}) {
  const {
    chunkTypes = null,
    limit = 10,
    threshold = 0.5
  } = options;

  const { data, error } = await getAdminClient().rpc('workspace_similarity_search', {
    query_embedding: queryEmbedding,
    ws_id: workspaceId,
    chunk_types: chunkTypes,
    match_count: limit,
    similarity_threshold: threshold
  });

  if (error) throw error;
  return data;
}

export async function getChunksForWorkspace(workspaceId, docType = null) {
  let query = getAdminClient()
    .from('prover_chunks')
    .select('id, doc_type, doc_id, chunk_id, chunk_type, content, metadata, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (docType) {
    query = query.eq('doc_type', docType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function countChunksForWorkspace(workspaceId) {
  const { count, error } = await getAdminClient()
    .from('prover_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);

  if (error) throw error;
  return count;
}

// =============================================
// LEGACY FUNCTIONS (for backward compatibility during migration)
// =============================================

export async function deleteChunksForDoc(tenantId, docType, docId) {
  const { error } = await getAdminClient()
    .from('prover_chunks')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('doc_type', docType)
    .eq('doc_id', docId);

  if (error) throw error;
}

export async function deleteChunksForTenant(tenantId, docType = null) {
  let query = getAdminClient()
    .from('prover_chunks')
    .delete()
    .eq('tenant_id', tenantId);

  if (docType) {
    query = query.eq('doc_type', docType);
  }

  const { error } = await query;
  if (error) throw error;
}

export async function getChunksForTenant(tenantId, docType = null) {
  let query = getAdminClient()
    .from('prover_chunks')
    .select('id, doc_type, doc_id, chunk_id, chunk_type, content, metadata, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (docType) {
    query = query.eq('doc_type', docType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function countChunks(tenantId) {
  const { count, error } = await getAdminClient()
    .from('prover_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (error) throw error;
  return count;
}

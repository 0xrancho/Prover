/**
 * PROSPECTS - Supabase CRM Operations
 *
 * All prospect/lead operations go through Supabase
 * with workspace isolation via RLS
 */

import { createClient } from '@supabase/supabase-js';

// Create admin client directly to avoid import timing issues
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let adminClient = null;
function getAdmin() {
  if (!adminClient && supabaseUrl && supabaseServiceKey) {
    adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });
  }
  if (!adminClient) {
    throw new Error('Supabase admin client not available. Check SUPABASE_SERVICE_ROLE_KEY.');
  }
  return adminClient;
}

/**
 * Create a new prospect
 */
export async function createProspect(workspaceId, data) {
  const { data: prospect, error } = await getAdmin()
    .from('prover_prospects')
    .insert({
      workspace_id: workspaceId,
      company_name: data.company_name,
      website_url: data.website_url || null,
      industry: data.industry || null,
      company_size: data.company_size || null,
      location: data.location || null,
      description: data.description || null,
      contact_name: data.contact_name || null,
      contact_title: data.contact_title || null,
      contact_email: data.contact_email || null,
      contact_linkedin: data.contact_linkedin || null,
      score: data.score || 0,
      score_reason: data.score_reason || null,
      status: data.status || 'new',
      pain_points: data.pain_points || null,
      proof_statement: data.proof_statement || null,
      matched_case_studies: data.matched_case_studies || null,
      source: data.source || 'manual',
      notes: data.notes || null,
      tags: data.tags || null
    })
    .select()
    .single();

  if (error) {
    console.error('[PROSPECTS] Create error:', error);
    throw new Error(`Failed to create prospect: ${error.message}`);
  }

  return prospect;
}

/**
 * Find prospect by company name in workspace
 */
export async function findProspectByName(workspaceId, companyName) {
  const { data: prospect, error } = await getAdmin()
    .from('prover_prospects')
    .select('*')
    .eq('workspace_id', workspaceId)
    .ilike('company_name', companyName)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('[PROSPECTS] Find error:', error);
    throw new Error(`Failed to find prospect: ${error.message}`);
  }

  return prospect || null;
}

/**
 * Update an existing prospect
 */
export async function updateProspect(prospectId, data) {
  const updateData = {
    updated_at: new Date().toISOString()
  };

  // Only include fields that are provided
  if (data.company_name !== undefined) updateData.company_name = data.company_name;
  if (data.website_url !== undefined) updateData.website_url = data.website_url;
  if (data.industry !== undefined) updateData.industry = data.industry;
  if (data.company_size !== undefined) updateData.company_size = data.company_size;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.contact_name !== undefined) updateData.contact_name = data.contact_name;
  if (data.contact_title !== undefined) updateData.contact_title = data.contact_title;
  if (data.contact_email !== undefined) updateData.contact_email = data.contact_email;
  if (data.contact_linkedin !== undefined) updateData.contact_linkedin = data.contact_linkedin;
  if (data.score !== undefined) updateData.score = data.score;
  if (data.score_reason !== undefined) updateData.score_reason = data.score_reason;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.pain_points !== undefined) updateData.pain_points = data.pain_points;
  if (data.proof_statement !== undefined) updateData.proof_statement = data.proof_statement;
  if (data.matched_case_studies !== undefined) updateData.matched_case_studies = data.matched_case_studies;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.tags !== undefined) updateData.tags = data.tags;

  const { data: prospect, error } = await getAdmin()
    .from('prover_prospects')
    .update(updateData)
    .eq('id', prospectId)
    .select()
    .single();

  if (error) {
    console.error('[PROSPECTS] Update error:', error);
    throw new Error(`Failed to update prospect: ${error.message}`);
  }

  return prospect;
}

/**
 * Get all prospects for a workspace
 */
export async function getProspects(workspaceId, options = {}) {
  const { status, sortBy = 'created_at', sortOrder = 'desc', limit = 100 } = options;

  let query = getAdmin()
    .from('prover_prospects')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order(sortBy, { ascending: sortOrder === 'asc' })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data: prospects, error } = await query;

  if (error) {
    console.error('[PROSPECTS] Get error:', error);
    throw new Error(`Failed to get prospects: ${error.message}`);
  }

  return prospects || [];
}

/**
 * Delete a prospect
 */
export async function deleteProspect(prospectId) {
  const { error } = await getAdmin()
    .from('prover_prospects')
    .delete()
    .eq('id', prospectId);

  if (error) {
    console.error('[PROSPECTS] Delete error:', error);
    throw new Error(`Failed to delete prospect: ${error.message}`);
  }

  return true;
}

/**
 * Get prospect stats for a workspace
 */
export async function getProspectStats(workspaceId) {
  const { data, error } = await getAdmin()
    .rpc('workspace_prospect_stats', { ws_id: workspaceId });

  if (error) {
    console.error('[PROSPECTS] Stats error:', error);
    return [];
  }

  return data || [];
}

/**
 * Create or update prospect (upsert by company name)
 */
export async function upsertProspect(workspaceId, data) {
  // Check if exists
  const existing = await findProspectByName(workspaceId, data.company_name);

  if (existing) {
    return {
      prospect: await updateProspect(existing.id, data),
      action: 'updated'
    };
  } else {
    return {
      prospect: await createProspect(workspaceId, data),
      action: 'created'
    };
  }
}

/**
 * OPPORTUNITIES - Dynamic Supabase Operations
 *
 * Schema-aware CRUD for the prover_opportunities table.
 * Fields are discovered dynamically - no hardcoding.
 *
 * This enables:
 * - Writing to any column that exists in the schema
 * - Agent-driven data capture without code changes
 * - Future: dynamic column creation for new signals
 */

import { createClient } from '@supabase/supabase-js';
import { getWritableFields, validateAndClean, formatSchemaForPrompt } from './schema.js';

// Table name - use env var to support migration from prover_prospects to prover_opportunities
const TABLE_NAME = process.env.OPPORTUNITIES_TABLE || 'prover_prospects';

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
    throw new Error('Supabase admin client not available');
  }
  return adminClient;
}

/**
 * Create a new opportunity
 * Accepts ANY fields that exist in the schema
 * @param {string} workspaceId - Workspace UUID
 * @param {object} data - Opportunity data (any valid fields)
 * @returns {Promise<object>} Created opportunity
 */
export async function createOpportunity(workspaceId, data) {
  // Validate and clean data against actual schema
  const { valid, errors, cleaned } = await validateAndClean(TABLE_NAME, data);

  if (!valid) {
    console.warn('[OPPORTUNITIES] Validation warnings:', errors);
    // Continue anyway - just skip unknown fields
  }

  // Add workspace_id
  const insertData = {
    workspace_id: workspaceId,
    ...cleaned
  };

  const { data: opportunity, error } = await getAdmin()
    .from(TABLE_NAME)
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[OPPORTUNITIES] Create error:', error);
    throw new Error(`Failed to create opportunity: ${error.message}`);
  }

  return opportunity;
}

/**
 * Find opportunity by company name in workspace
 * @param {string} workspaceId - Workspace UUID
 * @param {string} companyName - Company name to find
 * @returns {Promise<object|null>} Found opportunity or null
 */
export async function findOpportunityByName(workspaceId, companyName) {
  const { data: opportunity, error } = await getAdmin()
    .from(TABLE_NAME)
    .select('*')
    .eq('workspace_id', workspaceId)
    .ilike('company_name', companyName)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('[OPPORTUNITIES] Find error:', error);
    throw new Error(`Failed to find opportunity: ${error.message}`);
  }

  return opportunity || null;
}

/**
 * Update an existing opportunity
 * Accepts ANY fields that exist in the schema
 * @param {string} opportunityId - Opportunity ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Updated opportunity
 */
export async function updateOpportunity(opportunityId, data) {
  // Validate and clean data against actual schema
  const { valid, errors, cleaned } = await validateAndClean(TABLE_NAME, data);

  if (!valid) {
    console.warn('[OPPORTUNITIES] Validation warnings:', errors);
  }

  // Add updated_at
  const updateData = {
    ...cleaned,
    updated_at: new Date().toISOString()
  };

  const { data: opportunity, error } = await getAdmin()
    .from(TABLE_NAME)
    .update(updateData)
    .eq('id', opportunityId)
    .select()
    .single();

  if (error) {
    console.error('[OPPORTUNITIES] Update error:', error);
    throw new Error(`Failed to update opportunity: ${error.message}`);
  }

  return opportunity;
}

/**
 * Get all opportunities for a workspace
 * @param {string} workspaceId - Workspace UUID
 * @param {object} options - Query options
 * @returns {Promise<object[]>} List of opportunities
 */
export async function getOpportunities(workspaceId, options = {}) {
  const { status, sortBy = 'created_at', sortOrder = 'desc', limit = 100 } = options;

  let query = getAdmin()
    .from(TABLE_NAME)
    .select('*')
    .eq('workspace_id', workspaceId)
    .order(sortBy, { ascending: sortOrder === 'asc' })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data: opportunities, error } = await query;

  if (error) {
    console.error('[OPPORTUNITIES] Get error:', error);
    throw new Error(`Failed to get opportunities: ${error.message}`);
  }

  return opportunities || [];
}

/**
 * Delete an opportunity
 * @param {string} opportunityId - Opportunity ID
 * @returns {Promise<boolean>} Success
 */
export async function deleteOpportunity(opportunityId) {
  const { error } = await getAdmin()
    .from(TABLE_NAME)
    .delete()
    .eq('id', opportunityId);

  if (error) {
    console.error('[OPPORTUNITIES] Delete error:', error);
    throw new Error(`Failed to delete opportunity: ${error.message}`);
  }

  return true;
}

/**
 * Create or update opportunity (upsert by company name)
 * @param {string} workspaceId - Workspace UUID
 * @param {object} data - Opportunity data
 * @returns {Promise<{opportunity: object, action: string}>}
 */
export async function upsertOpportunity(workspaceId, data) {
  // Check if exists
  const existing = await findOpportunityByName(workspaceId, data.company_name);

  if (existing) {
    return {
      opportunity: await updateOpportunity(existing.id, data),
      action: 'updated'
    };
  } else {
    return {
      opportunity: await createOpportunity(workspaceId, data),
      action: 'created'
    };
  }
}

/**
 * Get opportunity stats for a workspace
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<object[]>} Stats
 */
export async function getOpportunityStats(workspaceId) {
  // Try to use stored procedure if exists
  const { data, error } = await getAdmin()
    .rpc('workspace_opportunity_stats', { ws_id: workspaceId });

  if (error) {
    // Fallback to basic count
    console.warn('[OPPORTUNITIES] Stats RPC not available, using fallback');
    const { count } = await getAdmin()
      .from(TABLE_NAME)
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);

    return { total: count || 0 };
  }

  return data || [];
}

/**
 * Get available fields for this table (for agent awareness)
 * @returns {Promise<string[]>} List of writable field names
 */
export async function getAvailableFields() {
  return await getWritableFields(TABLE_NAME);
}

/**
 * Get schema description for prompts
 * @returns {Promise<string>} Human-readable schema
 */
export async function getSchemaDescription() {
  return await formatSchemaForPrompt(TABLE_NAME);
}

export default {
  createOpportunity,
  findOpportunityByName,
  updateOpportunity,
  getOpportunities,
  deleteOpportunity,
  upsertOpportunity,
  getOpportunityStats,
  getAvailableFields,
  getSchemaDescription,
  TABLE_NAME
};

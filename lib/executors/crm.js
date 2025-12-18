/**
 * CRM EXECUTOR
 *
 * Wraps Supabase prospect operations for the orchestrator.
 * Provides unified interface for create/read/update operations.
 */

import {
  createProspect,
  getProspects,
  updateProspect,
  findProspectByName,
  upsertProspect,
  deleteProspect,
  getProspectStats
} from '../prospects.js';

/**
 * Execute a CRM read operation
 * @param {object} params - Read parameters
 * @param {string} params.status - Filter by status
 * @param {string} params.company_name - Find specific company
 * @param {number} params.limit - Max results (default 50)
 * @param {string} params.sortBy - Sort field (default 'created_at')
 * @param {string} params.sortOrder - Sort order (default 'desc')
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<object>} Prospect data
 */
export async function executeCrmRead(params, workspaceId) {
  const {
    status,
    company_name,
    limit = 50,
    sortBy = 'created_at',
    sortOrder = 'desc'
  } = params;

  try {
    // If looking for a specific company
    if (company_name) {
      const prospect = await findProspectByName(workspaceId, company_name);
      return {
        prospects: prospect ? [formatProspect(prospect)] : [],
        total: prospect ? 1 : 0,
        query: { company_name }
      };
    }

    // Otherwise get list
    const prospects = await getProspects(workspaceId, {
      status,
      limit,
      sortBy,
      sortOrder
    });

    return {
      prospects: prospects.map(formatProspect),
      total: prospects.length,
      query: { status, limit }
    };

  } catch (error) {
    console.error('[CRM EXECUTOR] Read error:', error);
    throw new Error(`CRM read failed: ${error.message}`);
  }
}

/**
 * Execute a CRM write operation (create or update)
 * @param {object} params - Prospect data
 * @param {string} params.company_name - Company name (required)
 * @param {string} params.website_url - Website URL
 * @param {string} params.industry - Industry
 * @param {string} params.company_size - Company size
 * @param {string} params.location - Location
 * @param {string} params.description - Description
 * @param {string} params.contact_name - Contact name
 * @param {string} params.contact_title - Contact title
 * @param {string} params.contact_email - Contact email
 * @param {number} params.score - ICP fit score (0-100)
 * @param {string} params.score_reason - Reason for score
 * @param {string} params.status - Prospect status
 * @param {string[]} params.pain_points - Pain points array
 * @param {string} params.proof_statement - Proof statement
 * @param {string[]} params.matched_case_studies - Matched case study IDs
 * @param {string} params.source - Data source
 * @param {string} params.notes - Notes
 * @param {string[]} params.tags - Tags array
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<object>} Created/updated prospect
 */
export async function executeCrmWrite(params, workspaceId) {
  const { company_name, ...data } = params;

  if (!company_name) {
    throw new Error('CRM write requires company_name');
  }

  try {
    // Clean up params (remove internal orchestrator fields)
    const cleanData = { ...data };
    delete cleanData._previous; // Remove dependency data from orchestrator

    const prospectData = {
      company_name,
      website_url: cleanData.website_url || null,
      industry: cleanData.industry || null,
      company_size: cleanData.company_size || null,
      location: cleanData.location || null,
      description: cleanData.description || null,
      contact_name: cleanData.contact_name || null,
      contact_title: cleanData.contact_title || null,
      contact_email: cleanData.contact_email || null,
      contact_linkedin: cleanData.contact_linkedin || null,
      score: cleanData.score !== undefined ? cleanData.score : null,
      score_reason: cleanData.score_reason || null,
      status: cleanData.status || 'new',
      pain_points: cleanData.pain_points || null,
      proof_statement: cleanData.proof_statement || null,
      matched_case_studies: cleanData.matched_case_studies || null,
      source: cleanData.source || 'orchestrator',
      notes: cleanData.notes || null,
      tags: cleanData.tags || null
    };

    // Use upsert to create or update
    const { prospect, action } = await upsertProspect(workspaceId, prospectData);

    return {
      action,
      prospect_id: prospect.id,
      company_name: prospect.company_name,
      data: formatProspect(prospect),
      // Scratchpad updates for orchestrator
      scratchpad_updates: {
        active_prospect: {
          company_name: prospect.company_name,
          status: action === 'created' ? 'new' : 'updated',
          data: {
            prospect_id: prospect.id,
            score: prospect.score,
            status: prospect.status
          }
        }
      }
    };

  } catch (error) {
    console.error('[CRM EXECUTOR] Write error:', error);
    throw new Error(`CRM write failed: ${error.message}`);
  }
}

/**
 * Execute a CRM delete operation
 * @param {object} params - Delete parameters
 * @param {string} params.prospect_id - Prospect ID to delete
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<object>} Deletion result
 */
export async function executeCrmDelete(params, workspaceId) {
  const { prospect_id } = params;

  if (!prospect_id) {
    throw new Error('CRM delete requires prospect_id');
  }

  try {
    await deleteProspect(prospect_id);
    return {
      deleted: true,
      prospect_id
    };

  } catch (error) {
    console.error('[CRM EXECUTOR] Delete error:', error);
    throw new Error(`CRM delete failed: ${error.message}`);
  }
}

/**
 * Get CRM statistics for a workspace
 * @param {object} params - Stats parameters (currently unused)
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<object>} Stats
 */
export async function executeCrmStats(params, workspaceId) {
  try {
    const stats = await getProspectStats(workspaceId);
    return {
      stats,
      workspace_id: workspaceId
    };

  } catch (error) {
    console.error('[CRM EXECUTOR] Stats error:', error);
    throw new Error(`CRM stats failed: ${error.message}`);
  }
}

/**
 * Format prospect for consistent output
 * @param {object} prospect - Raw prospect from database
 * @returns {object} Formatted prospect
 */
function formatProspect(prospect) {
  return {
    id: prospect.id,
    company_name: prospect.company_name,
    website_url: prospect.website_url,
    industry: prospect.industry,
    company_size: prospect.company_size,
    location: prospect.location,
    description: prospect.description,
    contact_name: prospect.contact_name,
    contact_title: prospect.contact_title,
    contact_email: prospect.contact_email,
    score: prospect.score,
    score_reason: prospect.score_reason,
    status: prospect.status,
    pain_points: prospect.pain_points,
    proof_statement: prospect.proof_statement,
    source: prospect.source,
    created_at: prospect.created_at,
    updated_at: prospect.updated_at
  };
}

export default {
  executeCrmRead,
  executeCrmWrite,
  executeCrmDelete,
  executeCrmStats
};

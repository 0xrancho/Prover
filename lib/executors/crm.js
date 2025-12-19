/**
 * CRM EXECUTOR
 *
 * Schema-aware wrapper for opportunity operations.
 * Fields are dynamic - reads actual schema from database.
 *
 * The executor doesn't hardcode fields. It:
 * 1. Accepts any data the planner provides
 * 2. Validates against actual schema
 * 3. Writes whatever fields exist
 */

import {
  createOpportunity,
  getOpportunities,
  updateOpportunity,
  findOpportunityByName,
  upsertOpportunity,
  deleteOpportunity,
  getOpportunityStats,
  getAvailableFields,
  getSchemaDescription
} from '../opportunities.js';

/**
 * Execute a CRM read operation
 * @param {object} params - Read parameters
 * @param {string} params.status - Filter by status
 * @param {string} params.company_name - Find specific company
 * @param {number} params.limit - Max results (default 50)
 * @param {string} params.sortBy - Sort field (default 'created_at')
 * @param {string} params.sortOrder - Sort order (default 'desc')
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<object>} Opportunity data
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
      const opportunity = await findOpportunityByName(workspaceId, company_name);
      return {
        opportunities: opportunity ? [opportunity] : [],
        total: opportunity ? 1 : 0,
        query: { company_name }
      };
    }

    // Otherwise get list
    const opportunities = await getOpportunities(workspaceId, {
      status,
      limit,
      sortBy,
      sortOrder
    });

    return {
      opportunities,
      total: opportunities.length,
      query: { status, limit }
    };

  } catch (error) {
    console.error('[CRM EXECUTOR] Read error:', error);
    throw new Error(`CRM read failed: ${error.message}`);
  }
}

/**
 * Execute a CRM write operation (create or update)
 * Accepts ANY fields that exist in the schema - no hardcoding
 *
 * @param {object} params - Opportunity data (any valid fields)
 * @param {string} params.company_name - Company name (required identifier)
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<object>} Created/updated opportunity
 */
export async function executeCrmWrite(params, workspaceId) {
  const { company_name, ...data } = params;

  if (!company_name) {
    throw new Error('CRM write requires company_name');
  }

  try {
    // Clean up internal orchestrator fields
    const cleanData = { ...data };
    delete cleanData._previous; // Remove dependency data from orchestrator

    // Build opportunity data - pass through ALL fields
    // The opportunities.js layer validates against actual schema
    const opportunityData = {
      company_name,
      ...cleanData
    };

    // Remove null/undefined to avoid overwriting with nulls on update
    Object.keys(opportunityData).forEach(key => {
      if (opportunityData[key] === null || opportunityData[key] === undefined) {
        delete opportunityData[key];
      }
    });

    // Use upsert to create or update
    const { opportunity, action } = await upsertOpportunity(workspaceId, opportunityData);

    return {
      action,
      opportunity_id: opportunity.id,
      company_name: opportunity.company_name,
      data: opportunity,
      // Scratchpad updates for orchestrator
      scratchpad_updates: {
        active_opportunity: {
          company_name: opportunity.company_name,
          status: action === 'created' ? 'new' : 'updated',
          data: {
            opportunity_id: opportunity.id,
            score: opportunity.score,
            status: opportunity.status
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
 * @param {string} params.opportunity_id - Opportunity ID to delete
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<object>} Deletion result
 */
export async function executeCrmDelete(params, workspaceId) {
  const { opportunity_id } = params;

  if (!opportunity_id) {
    throw new Error('CRM delete requires opportunity_id');
  }

  try {
    await deleteOpportunity(opportunity_id);
    return {
      deleted: true,
      opportunity_id
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
    const stats = await getOpportunityStats(workspaceId);
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
 * Get available fields from the schema
 * Used by tool registry to build dynamic prompts
 * @returns {Promise<string[]>} List of writable field names
 */
export async function getAvailableCrmFields() {
  return await getAvailableFields();
}

/**
 * Get schema description for prompts
 * @returns {Promise<string>} Human-readable schema
 */
export async function getCrmSchemaDescription() {
  return await getSchemaDescription();
}

export default {
  executeCrmRead,
  executeCrmWrite,
  executeCrmDelete,
  executeCrmStats,
  getAvailableCrmFields,
  getCrmSchemaDescription
};

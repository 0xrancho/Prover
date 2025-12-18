/**
 * SCRATCHPAD - Working Memory Management
 *
 * Session-scoped working memory for the orchestrator.
 * Tracks context across turns within a conversation.
 *
 * Phase 1: In-memory (per API request, passed from frontend)
 * Phase 2: Can upgrade to prover_sessions table for persistence
 */

import { ScratchpadSchema, validateScratchpad } from './validators.js';

/**
 * Create a new scratchpad for a workspace
 * @param {string} workspaceId - Workspace UUID
 * @returns {object} Fresh scratchpad
 */
export function createScratchpad(workspaceId) {
  return {
    workspace_id: workspaceId,
    turn_count: 0,
    established_icp: null,
    active_prospects: [],
    last_query: null,
    pending_actions: []
  };
}

/**
 * Increment turn count and update last query
 * @param {object} scratchpad - Current scratchpad state
 * @param {string} message - User's message
 * @param {string} mode - Detected mode
 * @returns {object} Updated scratchpad
 */
export function startTurn(scratchpad, message, mode) {
  return {
    ...scratchpad,
    turn_count: scratchpad.turn_count + 1,
    last_query: {
      message,
      mode,
      results_summary: '' // Will be filled after execution
    }
  };
}

/**
 * Update last query with results summary
 * @param {object} scratchpad - Current scratchpad state
 * @param {string} summary - Summary of results
 * @returns {object} Updated scratchpad
 */
export function completeTurn(scratchpad, summary) {
  if (!scratchpad.last_query) return scratchpad;

  return {
    ...scratchpad,
    last_query: {
      ...scratchpad.last_query,
      results_summary: summary
    }
  };
}

/**
 * Set established ICP context from RAG results
 * @param {object} scratchpad - Current scratchpad state
 * @param {object} icpData - ICP context data
 * @returns {object} Updated scratchpad
 */
export function setEstablishedICP(scratchpad, icpData) {
  return {
    ...scratchpad,
    established_icp: {
      summary: icpData.summary,
      key_criteria: icpData.key_criteria || [],
      chunk_ids: icpData.chunk_ids || []
    }
  };
}

/**
 * Add or update an active prospect in working memory
 * @param {object} scratchpad - Current scratchpad state
 * @param {string} companyName - Company name
 * @param {string} status - Prospect status
 * @param {object} data - Prospect data
 * @returns {object} Updated scratchpad
 */
export function upsertActiveProspect(scratchpad, companyName, status, data = {}) {
  const existing = scratchpad.active_prospects.findIndex(
    p => p.company_name.toLowerCase() === companyName.toLowerCase()
  );

  const prospect = {
    company_name: companyName,
    status,
    data
  };

  const active_prospects = [...scratchpad.active_prospects];

  if (existing >= 0) {
    active_prospects[existing] = {
      ...active_prospects[existing],
      status,
      data: { ...active_prospects[existing].data, ...data }
    };
  } else {
    active_prospects.push(prospect);
  }

  // Keep only most recent 10 active prospects
  const trimmed = active_prospects.slice(-10);

  return {
    ...scratchpad,
    active_prospects: trimmed
  };
}

/**
 * Get an active prospect by name
 * @param {object} scratchpad - Current scratchpad state
 * @param {string} companyName - Company name to find
 * @returns {object|null} Prospect or null
 */
export function getActiveProspect(scratchpad, companyName) {
  return scratchpad.active_prospects.find(
    p => p.company_name.toLowerCase() === companyName.toLowerCase()
  ) || null;
}

/**
 * Add a pending action awaiting user confirmation
 * @param {object} scratchpad - Current scratchpad state
 * @param {string} action - Action type
 * @param {object} data - Action data
 * @returns {object} Updated scratchpad
 */
export function addPendingAction(scratchpad, action, data) {
  return {
    ...scratchpad,
    pending_actions: [
      ...scratchpad.pending_actions,
      {
        action,
        data,
        awaiting_confirmation: true
      }
    ]
  };
}

/**
 * Clear pending actions (after confirmation or cancellation)
 * @param {object} scratchpad - Current scratchpad state
 * @returns {object} Updated scratchpad
 */
export function clearPendingActions(scratchpad) {
  return {
    ...scratchpad,
    pending_actions: []
  };
}

/**
 * Get the most recent pending action
 * @param {object} scratchpad - Current scratchpad state
 * @returns {object|null} Pending action or null
 */
export function getPendingAction(scratchpad) {
  const pending = scratchpad.pending_actions.filter(a => a.awaiting_confirmation);
  return pending.length > 0 ? pending[pending.length - 1] : null;
}

/**
 * Apply updates from planner/executor to scratchpad
 * @param {object} scratchpad - Current scratchpad state
 * @param {object} updates - Updates to apply
 * @returns {object} Updated scratchpad
 */
export function applyUpdates(scratchpad, updates = {}) {
  if (!updates || Object.keys(updates).length === 0) {
    return scratchpad;
  }

  let updated = { ...scratchpad };

  // Handle ICP update
  if (updates.established_icp) {
    updated.established_icp = updates.established_icp;
  }

  // Handle single active_prospect (from planner)
  if (updates.active_prospect) {
    const { company_name, status, data } = updates.active_prospect;
    updated = upsertActiveProspect(updated, company_name, status, data);
  }

  // Handle multiple active_prospects array (from executors)
  if (updates.active_prospects && Array.isArray(updates.active_prospects)) {
    for (const prospect of updates.active_prospects) {
      const { company_name, status, data } = prospect;
      updated = upsertActiveProspect(updated, company_name, status, data);
    }
  }

  // Handle single pending_action
  if (updates.pending_action) {
    updated = addPendingAction(updated, updates.pending_action.action, updates.pending_action.data);
  }

  // Handle clear_pending flag
  if (updates.clear_pending) {
    updated.pending_actions = [];
  }

  // Handle last_query update (from executors providing context)
  if (updates.last_query) {
    updated.last_query = {
      ...updated.last_query,
      ...updates.last_query
    };
  }

  return updated;
}

/**
 * Validate and sanitize scratchpad from client
 * @param {object} rawScratchpad - Raw scratchpad from request
 * @param {string} workspaceId - Expected workspace ID
 * @returns {object} Validated scratchpad or fresh one if invalid
 */
export function validateAndSanitize(rawScratchpad, workspaceId) {
  if (!rawScratchpad) {
    return createScratchpad(workspaceId);
  }

  // Ensure workspace_id matches
  if (rawScratchpad.workspace_id !== workspaceId) {
    console.warn('[SCRATCHPAD] Workspace ID mismatch, creating fresh scratchpad');
    return createScratchpad(workspaceId);
  }

  const validation = validateScratchpad(rawScratchpad);

  if (!validation.success) {
    console.warn('[SCRATCHPAD] Validation failed:', validation.error);
    return createScratchpad(workspaceId);
  }

  return validation.data;
}

/**
 * Serialize scratchpad for response (remove internal fields if needed)
 * @param {object} scratchpad - Scratchpad to serialize
 * @returns {object} Serializable scratchpad
 */
export function serialize(scratchpad) {
  return {
    workspace_id: scratchpad.workspace_id,
    turn_count: scratchpad.turn_count,
    established_icp: scratchpad.established_icp,
    active_prospects: scratchpad.active_prospects,
    last_query: scratchpad.last_query,
    pending_actions: scratchpad.pending_actions
  };
}

/**
 * Get context summary for planner
 * @param {object} scratchpad - Current scratchpad
 * @returns {string} Human-readable context summary
 */
export function getContextSummary(scratchpad) {
  const parts = [];

  if (scratchpad.turn_count > 0) {
    parts.push(`Turn ${scratchpad.turn_count + 1} of conversation.`);
  }

  if (scratchpad.established_icp) {
    parts.push(`ICP established: ${scratchpad.established_icp.summary}`);
  }

  if (scratchpad.active_prospects.length > 0) {
    const companies = scratchpad.active_prospects.map(p => p.company_name).join(', ');
    parts.push(`Active prospects: ${companies}`);
  }

  if (scratchpad.last_query) {
    parts.push(`Last query (${scratchpad.last_query.mode}): "${scratchpad.last_query.message}"`);
  }

  if (scratchpad.pending_actions.length > 0) {
    const pending = scratchpad.pending_actions.filter(a => a.awaiting_confirmation);
    if (pending.length > 0) {
      parts.push(`Awaiting confirmation: ${pending[0].action}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : 'Fresh conversation, no prior context.';
}

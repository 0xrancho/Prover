/**
 * EXECUTORS INDEX
 *
 * Central export for all executor functions.
 * Each executor wraps a specific capability for the orchestrator.
 */

// RAG - Knowledge base search (pgvector)
export { executeRagSearch, executeRagLookalike } from './rag.js';

// Web - Search and scrape (Firecrawl)
export { executeWebSearch } from './web.js';

// CRM - Supabase prospect operations
export { executeCrmRead, executeCrmWrite, executeCrmDelete, executeCrmStats } from './crm.js';

// Qualify - ICP scoring (LLM)
export { executeQualify, executeQualifyBatch } from './qualify.js';

// External - Placeholder for enrichment providers
export const executeExternalEnrich = async (params, workspaceId) => {
  // Pluggable external enrichment - adapters to be added
  return {
    message: 'External enrichment not yet implemented',
    params,
    available_providers: [
      // Add provider names as they are integrated
      // 'apollo', 'clearbit', 'zoominfo', etc.
    ]
  };
};

/**
 * Get executor by tool name
 * @param {string} tool - Tool name from plan
 * @returns {Function} Executor function
 */
export function getExecutor(tool) {
  const executors = {
    'rag_search': executeRagSearch,
    'rag_lookalike': executeRagLookalike,
    'web_search': executeWebSearch,
    'crm_read': executeCrmRead,
    'crm_write': executeCrmWrite,
    'crm_delete': executeCrmDelete,
    'crm_stats': executeCrmStats,
    'qualify': executeQualify,
    'qualify_batch': executeQualifyBatch,
    'external_enrich': executeExternalEnrich
  };

  return executors[tool] || null;
}

/**
 * List available tools
 * @returns {string[]} Tool names
 */
export function listAvailableTools() {
  return [
    'rag_search',
    'rag_lookalike',
    'web_search',
    'crm_read',
    'crm_write',
    'qualify',
    'external_enrich'
  ];
}

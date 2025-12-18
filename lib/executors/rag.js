/**
 * RAG EXECUTOR
 *
 * Wraps the existing retrieval.js functionality for the orchestrator.
 * Searches the pgvector knowledge base and returns formatted results.
 */

import { askRetrieval, formatChunksAsContext, extractSources } from '../retrieval.js';

/**
 * Execute a RAG search against the knowledge base
 * @param {object} params - Search parameters
 * @param {string} params.query - Search query
 * @param {string[]} params.chunk_types - Optional chunk types to filter
 * @param {number} params.limit - Max results (default 10)
 * @param {number} params.threshold - Similarity threshold (default 0.25)
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<object>} Search results
 */
export async function executeRagSearch(params, workspaceId) {
  const {
    query,
    chunk_types = null,
    chunkTypes = null, // alias
    limit = 10,
    threshold = 0.25
  } = params;

  if (!query) {
    throw new Error('RAG search requires a query parameter');
  }

  // Use either chunk_types or chunkTypes (snake_case from planner, camelCase from legacy)
  const targetChunkTypes = chunk_types || chunkTypes;

  try {
    // Execute the search using existing retrieval function
    const retrieval = await askRetrieval(query, workspaceId, {
      chunkTypes: targetChunkTypes,
      limit,
      threshold
    });

    // Format results for orchestrator
    const context = formatChunksAsContext(retrieval.chunks);
    const sources = extractSources(retrieval.chunks);

    // Check if this was an ICP query - update scratchpad with ICP context
    const isIcpQuery = query.toLowerCase().includes('icp') ||
                       query.toLowerCase().includes('ideal customer') ||
                       targetChunkTypes?.some(t => t.includes('icp'));

    const scratchpad_updates = {};
    if (isIcpQuery && retrieval.chunks.length > 0) {
      // Extract ICP summary from chunks
      const icpChunks = retrieval.chunks.filter(c =>
        c.chunk_type?.includes('icp') || c.doc_type === 'icp'
      );
      if (icpChunks.length > 0) {
        scratchpad_updates.established_icp = {
          summary: icpChunks[0].content?.substring(0, 500) || 'ICP criteria found',
          key_criteria: icpChunks.map(c => c.chunk_type).filter(Boolean),
          chunk_ids: icpChunks.map(c => c.doc_id)
        };
      }
    }

    return {
      chunks: retrieval.chunks.map(c => ({
        doc_id: c.doc_id,
        doc_type: c.doc_type,
        chunk_type: c.chunk_type,
        content: c.content,
        similarity: c.similarity,
        metadata: c.metadata
      })),
      context,
      sources,
      query,
      chunk_types_searched: retrieval.chunkTypesSearched,
      total_results: retrieval.chunks.length,
      // Scratchpad updates for orchestrator
      scratchpad_updates: Object.keys(scratchpad_updates).length > 0 ? scratchpad_updates : undefined
    };

  } catch (error) {
    console.error('[RAG EXECUTOR] Search error:', error);
    throw new Error(`RAG search failed: ${error.message}`);
  }
}

/**
 * Execute a lookalike search (BUILD mode)
 * Finds similar prospects based on match signals
 * @param {object} params - Search parameters
 * @param {string} params.query - Search query
 * @param {number} params.limit - Max results (default 15)
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<object>} Grouped prospect matches
 */
export async function executeRagLookalike(params, workspaceId) {
  const { query, limit = 15, threshold = 0.2 } = params;

  if (!query) {
    throw new Error('Lookalike search requires a query parameter');
  }

  try {
    // Import the lookalike function
    const { buildLookalikeRetrieval } = await import('../retrieval.js');

    const retrieval = await buildLookalikeRetrieval(query, workspaceId, {
      limit,
      threshold
    });

    return {
      prospects: retrieval.prospects.map(p => ({
        doc_id: p.doc_id,
        doc_type: p.doc_type,
        similarity: Math.round(p.maxSimilarity * 100),
        chunks: p.chunks.map(c => ({
          chunk_type: c.chunk_type,
          content: c.content?.substring(0, 300),
          similarity: c.similarity
        })),
        metadata: p.metadata
      })),
      query,
      total_matches: retrieval.totalMatches
    };

  } catch (error) {
    console.error('[RAG EXECUTOR] Lookalike error:', error);
    throw new Error(`Lookalike search failed: ${error.message}`);
  }
}

export default {
  executeRagSearch,
  executeRagLookalike
};

import { embedText } from './embeddings.js';
import { similaritySearch } from './supabase.js';

/**
 * Detect the intent type for ASK mode queries
 * Returns array of chunk_types to search
 */
export function detectAskIntent(query) {
  const q = query.toLowerCase();

  // Proof point queries - looking for outcomes, differentiators
  if (
    q.includes('proof') ||
    q.includes('evidence') ||
    q.includes('show me') ||
    q.includes('example') ||
    q.includes('case') ||
    q.includes('outcome') ||
    q.includes('result') ||
    q.includes('why you') ||
    q.includes('why joel') ||
    q.includes('differentiator')
  ) {
    return ['insight_outcome', 'differentiator', 'match_signal'];
  }

  // ICP fit queries
  if (
    q.includes('icp') ||
    q.includes('ideal customer') ||
    q.includes('fit') ||
    q.includes('good prospect') ||
    q.includes('target') ||
    q.includes('should i') ||
    q.includes('worth pursuing') ||
    q.includes('qualify')
  ) {
    return ['icp_definition', 'icp_buyer', 'icp_negative', 'match_signal'];
  }

  // Lookalike queries
  if (
    q.includes('like') ||
    q.includes('similar') ||
    q.includes('lookalike') ||
    q.includes('look like') ||
    q.includes('same as') ||
    q.includes('comparable')
  ) {
    return ['match_signal', 'company_profile'];
  }

  // Problem/trigger queries
  if (
    q.includes('problem') ||
    q.includes('pain') ||
    q.includes('trigger') ||
    q.includes('why did') ||
    q.includes('what made')
  ) {
    return ['problem_trigger', 'match_signal'];
  }

  // Default: search all chunk types
  return null;
}

/**
 * Detect BUILD mode intent type
 */
export function detectBuildIntent(query) {
  const q = query.toLowerCase();

  // Lookalike - find similar to existing
  if (
    q.includes('like') ||
    q.includes('similar') ||
    q.includes('lookalike') ||
    q.includes('look like') ||
    q.includes('same as')
  ) {
    return 'lookalike';
  }

  // Net-new - external search for new prospects
  if (
    q.includes('net new') ||
    q.includes('net-new') ||
    q.includes('new prospect') ||
    q.includes('find me') ||
    q.includes('search for') ||
    q.includes('apollo') ||
    q.includes('external')
  ) {
    return 'net-new';
  }

  // Filter - query existing data
  if (
    q.includes('filter') ||
    q.includes('where') ||
    q.includes('with') ||
    q.includes('that have') ||
    q.includes('in my')
  ) {
    return 'filter';
  }

  // Default to lookalike for most "build a list" queries
  return 'lookalike';
}

/**
 * ASK mode retrieval
 * Returns relevant chunks with similarity scores
 */
export async function askRetrieval(query, tenantId, options = {}) {
  const {
    limit = 10,
    threshold = 0.3,
    chunkTypes = null
  } = options;

  // Auto-detect chunk types if not provided
  const targetChunkTypes = chunkTypes || detectAskIntent(query);

  // Embed the query
  const queryEmbedding = await embedText(query);

  // Search Supabase
  const results = await similaritySearch(queryEmbedding, tenantId, {
    chunkTypes: targetChunkTypes,
    limit,
    threshold
  });

  return {
    chunks: results,
    query,
    chunkTypesSearched: targetChunkTypes
  };
}

/**
 * BUILD mode retrieval (lookalike)
 * Finds similar prospects based on match signals
 */
export async function buildLookalikeRetrieval(query, tenantId, options = {}) {
  const { limit = 20, threshold = 0.3 } = options;

  // Embed the query
  const queryEmbedding = await embedText(query);

  // Search match_signal and company_profile chunks
  const results = await similaritySearch(queryEmbedding, tenantId, {
    chunkTypes: ['match_signal', 'company_profile'],
    limit,
    threshold
  });

  // Group results by doc_id to avoid duplicates
  const grouped = results.reduce((acc, chunk) => {
    if (!acc[chunk.doc_id]) {
      acc[chunk.doc_id] = {
        doc_id: chunk.doc_id,
        doc_type: chunk.doc_type,
        chunks: [],
        maxSimilarity: 0,
        metadata: chunk.metadata || {}
      };
    }
    acc[chunk.doc_id].chunks.push(chunk);
    acc[chunk.doc_id].maxSimilarity = Math.max(
      acc[chunk.doc_id].maxSimilarity,
      chunk.similarity
    );
    return acc;
  }, {});

  // Convert to array and sort by similarity
  const prospects = Object.values(grouped).sort(
    (a, b) => b.maxSimilarity - a.maxSimilarity
  );

  return {
    prospects,
    query,
    totalMatches: prospects.length
  };
}

/**
 * Format retrieved chunks as context for LLM
 */
export function formatChunksAsContext(chunks) {
  if (!chunks || chunks.length === 0) {
    return 'No relevant context found in the knowledge base.';
  }

  const grouped = chunks.reduce((acc, chunk) => {
    const key = chunk.doc_id || 'unknown';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(chunk);
    return acc;
  }, {});

  let context = '';
  for (const [docId, docChunks] of Object.entries(grouped)) {
    context += `\n--- ${docId} ---\n`;
    for (const chunk of docChunks) {
      context += `[${chunk.chunk_type}]: ${chunk.content}\n`;
    }
  }

  return context.trim();
}

/**
 * Extract source references from chunks for citations
 */
export function extractSources(chunks) {
  const sources = [];
  const seen = new Set();

  for (const chunk of chunks) {
    const key = chunk.doc_id;
    if (!seen.has(key)) {
      seen.add(key);
      sources.push({
        doc_id: chunk.doc_id,
        doc_type: chunk.doc_type,
        similarity: chunk.similarity,
        metadata: chunk.metadata
      });
    }
  }

  return sources;
}

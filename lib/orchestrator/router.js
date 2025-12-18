/**
 * ROUTER - Lightweight Mode Detection
 *
 * Provides a mode hint to the planner based on simple keyword matching.
 * The PLANNER (LLM) makes the final decision on execution steps.
 *
 * This is intentionally simple - complex intent detection is the planner's job.
 */

// =============================================
// MODE DETECTION
// =============================================

/**
 * Detect the primary mode for a user message
 * Returns a hint for the planner - not the final decision
 *
 * @param {string} message - User's message
 * @param {object} scratchpad - Current scratchpad state
 * @returns {'ask' | 'build' | 'enrich' | 'hybrid'}
 */
export function detectMode(message, scratchpad = null) {
  const q = message.toLowerCase();

  // Check for pending confirmations first
  if (scratchpad?.pending_actions?.length > 0) {
    const pending = scratchpad.pending_actions.find(a => a.awaiting_confirmation);
    if (pending && isConfirmation(q)) {
      return pending.action.includes('enrich') ? 'enrich' : 'build';
    }
  }

  // ENRICH - explicit enrichment requests
  if (q.includes('enrich') || q.includes('research') || q.includes('look up') ||
      q.includes('tell me about') || q.includes('company details')) {
    return 'enrich';
  }

  // BUILD - creating leads or finding prospects
  // Note: 'similar' only triggers BUILD when combined with prospecting intent
  // Questions starting with "how did" are typically ASK queries about past work
  const isAskQuestion = q.startsWith('how did') || q.startsWith('what did') || q.includes('help us');

  const hasBuildKeyword = q.includes('add') || q.includes('create') || q.includes('save') ||
      q.includes('build') || q.includes('find me') || q.includes('met with') ||
      q.includes('talked to') || q.includes('lookalike');
  const hasSimilarWithProspectIntent = q.includes('similar') &&
      (q.includes('compan') || q.includes('prospect') || q.includes('find'));

  if (!isAskQuestion && (hasBuildKeyword || hasSimilarWithProspectIntent)) {
    return 'build';
  }

  // Default to ASK
  return 'ask';
}

/**
 * Check if message is a confirmation
 */
function isConfirmation(q) {
  return q === 'yes' || q === 'y' || q === 'ok' || q === 'save' ||
         q === 'confirm' || q.includes('looks good');
}

// =============================================
// CHUNK TYPE HINTS (for ASK mode optimization)
// =============================================

/**
 * Suggest chunk types to search based on query keywords
 * This is an optimization hint - not required
 *
 * @param {string} query - User's query
 * @returns {string[]|null} Suggested chunk types or null for all
 */
export function detectAskChunkTypes(query) {
  const q = query.toLowerCase();

  if (q.includes('proof') || q.includes('case') || q.includes('outcome') || q.includes('result')) {
    return ['insight_outcome', 'differentiator', 'match_signal'];
  }

  if (q.includes('icp') || q.includes('ideal') || q.includes('fit') || q.includes('qualify')) {
    return ['icp_definition', 'icp_buyer', 'icp_negative'];
  }

  if (q.includes('pain') || q.includes('problem') || q.includes('trigger')) {
    return ['problem_trigger', 'match_signal'];
  }

  return null; // Search all
}

// =============================================
// BUILD SUBTYPE HINTS
// =============================================

/**
 * Detect BUILD mode subtype
 * @param {string} query - User's query
 * @returns {'create-lead' | 'lookalike' | 'filter' | 'net-new'}
 */
export function detectBuildSubtype(query) {
  const q = query.toLowerCase();

  if (q.includes('met') || q.includes('talked') || q.includes('create') || q.includes('add')) {
    return 'create-lead';
  }

  if (q.includes('similar') || q.includes('like') || q.includes('lookalike')) {
    return 'lookalike';
  }

  if (q.includes('filter') || q.includes('existing') || q.includes('in my')) {
    return 'filter';
  }

  if (q.includes('net new') || q.includes('net-new') || q.includes('external')) {
    return 'net-new';
  }

  return 'lookalike'; // Default
}

export default {
  detectMode,
  detectAskChunkTypes,
  detectBuildSubtype
};

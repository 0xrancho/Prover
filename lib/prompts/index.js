/**
 * PROVER PROMPT MANAGEMENT
 *
 * Centralized prompt engineering for all LLM interactions.
 *
 * Structure:
 * - SYSTEM: Identity, context switching, routing
 * - MODES: Tool-specific prompts (ASK, BUILD, ENRICH)
 * - EXTRACTION: Data parsing prompts (chunking, entity extraction)
 *
 * Usage tracking is logged for future evals.
 */

import { SYSTEM_PROMPTS } from './system.js';
import { MODE_PROMPTS } from './modes.js';
import { EXTRACTION_PROMPTS } from './extraction.js';

// Prompt usage logging for future evals
const promptUsageLog = [];

export function logPromptUsage(promptKey, mode, inputTokensEstimate, outputTokensEstimate) {
  const entry = {
    timestamp: new Date().toISOString(),
    promptKey,
    mode,
    inputTokensEstimate,
    outputTokensEstimate,
  };
  promptUsageLog.push(entry);
  console.log('[PROMPT USAGE]', entry);
  return entry;
}

export function getPromptUsageLog() {
  return promptUsageLog;
}

// Build the complete prompt for a given context
export function buildPrompt({ mode, context = {}, conversationHistory = [] }) {
  const system = SYSTEM_PROMPTS.IDENTITY;
  const router = SYSTEM_PROMPTS.ROUTER;
  const modePrompt = MODE_PROMPTS[mode.toUpperCase()] || MODE_PROMPTS.ASK;

  return {
    system,
    router,
    mode: modePrompt,
    context,
    conversationHistory,
  };
}

export { SYSTEM_PROMPTS, MODE_PROMPTS, EXTRACTION_PROMPTS };

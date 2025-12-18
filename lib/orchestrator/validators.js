/**
 * ORCHESTRATOR VALIDATORS
 *
 * Zod schemas for validating planner output and executor results.
 * Ensures strict type safety at orchestration boundaries.
 */

import { z } from 'zod';

// =============================================
// PLAN SCHEMAS
// =============================================

/**
 * Available tools the planner can use
 */
export const ToolEnum = z.enum([
  'rag_search',      // Search knowledge base (pgvector)
  'web_search',      // Search/scrape web (Firecrawl)
  'crm_read',        // Read prospects from Supabase
  'crm_write',       // Write prospects to Supabase
  'qualify',         // Score prospect against ICP (LLM call)
  'external_enrich'  // External enrichment (pluggable providers)
]);

/**
 * A single step in an execution plan
 */
export const PlanStepSchema = z.object({
  tool: ToolEnum,
  params: z.record(z.any()),
  purpose: z.string().max(100).describe('Why this step is needed'),
  depends_on: z.number().optional().describe('Index of step this depends on')
});

/**
 * Operating modes
 */
export const ModeEnum = z.enum(['ask', 'build', 'enrich', 'hybrid']);

/**
 * Complete execution plan from the planner
 */
export const PlanSchema = z.object({
  reasoning: z.string().max(500).describe('Brief explanation of approach'),
  mode: ModeEnum,
  steps: z.array(PlanStepSchema).min(1).max(5),
  scratchpad_updates: z.record(z.any()).optional()
});

// =============================================
// EXECUTOR RESULT SCHEMAS
// =============================================

/**
 * Generic executor result
 */
export const ExecutorResultSchema = z.object({
  tool: z.string(),
  success: z.boolean(),
  data: z.any(),
  error: z.string().optional(),
  tokens_used: z.number().optional()
});

/**
 * RAG search result
 */
export const RagResultSchema = z.object({
  chunks: z.array(z.object({
    doc_id: z.string(),
    doc_type: z.string(),
    chunk_type: z.string(),
    content: z.string(),
    similarity: z.number()
  })),
  context: z.string(),
  sources: z.array(z.object({
    doc_id: z.string(),
    doc_type: z.string(),
    similarity: z.number()
  }))
});

/**
 * Web search result
 */
export const WebResultSchema = z.object({
  query: z.string(),
  results: z.array(z.object({
    title: z.string().optional(),
    url: z.string().optional(),
    snippet: z.string().optional(),
    content: z.string().optional()
  })),
  scraped_content: z.string().optional()
});

/**
 * CRM read result
 */
export const CrmReadResultSchema = z.object({
  prospects: z.array(z.object({
    id: z.string(),
    company_name: z.string(),
    status: z.string().optional(),
    score: z.number().optional(),
    industry: z.string().optional()
  })),
  total: z.number()
});

/**
 * CRM write result
 */
export const CrmWriteResultSchema = z.object({
  action: z.enum(['created', 'updated']),
  prospect_id: z.string(),
  company_name: z.string()
});

/**
 * Qualify result
 */
export const QualifyResultSchema = z.object({
  company_name: z.string(),
  score: z.number().min(0).max(100),
  score_reason: z.string(),
  fit_signals: z.array(z.string()).optional(),
  concerns: z.array(z.string()).optional()
});

// =============================================
// SCRATCHPAD SCHEMAS
// =============================================

/**
 * ICP context established from previous turns
 */
export const EstablishedICPSchema = z.object({
  summary: z.string(),
  key_criteria: z.array(z.string()),
  chunk_ids: z.array(z.string())
}).nullable();

/**
 * Active prospect in working memory
 */
export const ActiveProspectSchema = z.object({
  company_name: z.string(),
  status: z.enum(['mentioned', 'researched', 'qualified', 'saved']),
  data: z.record(z.any())
});

/**
 * Last query context for follow-up handling
 */
export const LastQuerySchema = z.object({
  message: z.string(),
  mode: ModeEnum,
  results_summary: z.string()
}).nullable();

/**
 * Pending action awaiting confirmation
 */
export const PendingActionSchema = z.object({
  action: z.enum(['save_prospect', 'enrich_prospect', 'build_list']),
  data: z.any(),
  awaiting_confirmation: z.boolean()
});

/**
 * Complete scratchpad (working memory)
 */
export const ScratchpadSchema = z.object({
  workspace_id: z.string(),
  turn_count: z.number().default(0),
  established_icp: EstablishedICPSchema.optional(),
  active_prospects: z.array(ActiveProspectSchema).default([]),
  last_query: LastQuerySchema.optional(),
  pending_actions: z.array(PendingActionSchema).default([])
});

// =============================================
// VALIDATION HELPERS
// =============================================

/**
 * Validate a plan from the planner
 * @param {object} plan - Raw plan object from LLM
 * @returns {{ success: boolean, data?: object, error?: string }}
 */
export function validatePlan(plan) {
  try {
    const validated = PlanSchema.parse(plan);
    return { success: true, data: validated };
  } catch (e) {
    return {
      success: false,
      error: e.errors?.map(err => `${err.path.join('.')}: ${err.message}`).join(', ') || e.message
    };
  }
}

/**
 * Validate an executor result
 * @param {object} result - Raw result from executor
 * @returns {{ success: boolean, data?: object, error?: string }}
 */
export function validateExecutorResult(result) {
  try {
    const validated = ExecutorResultSchema.parse(result);
    return { success: true, data: validated };
  } catch (e) {
    return {
      success: false,
      error: e.errors?.map(err => `${err.path.join('.')}: ${err.message}`).join(', ') || e.message
    };
  }
}

/**
 * Validate scratchpad state
 * @param {object} scratchpad - Raw scratchpad object
 * @returns {{ success: boolean, data?: object, error?: string }}
 */
export function validateScratchpad(scratchpad) {
  try {
    const validated = ScratchpadSchema.parse(scratchpad);
    return { success: true, data: validated };
  } catch (e) {
    return {
      success: false,
      error: e.errors?.map(err => `${err.path.join('.')}: ${err.message}`).join(', ') || e.message
    };
  }
}

/**
 * Safe parse that returns null instead of throwing
 * @param {z.ZodSchema} schema - Zod schema to parse with
 * @param {any} data - Data to parse
 * @returns {object|null}
 */
export function safeParse(schema, data) {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}

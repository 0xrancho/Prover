/**
 * ORCHESTRATOR - Main Execution Loop (ReAct Pattern)
 *
 * Single-loop orchestration: Plan → Execute → Eval → (Respond or Re-plan)
 *
 * Core principles:
 * - One planner function handles initial and re-planning
 * - Evaluator identifies gaps, does NOT generate plans
 * - Linear control flow, no nested loops
 * - Hard cap on iterations
 */

import OpenAI from 'openai';
import { isConfirmation, isCancellation } from './router.js';

// =============================================
// LOGGING UTILITIES
// =============================================

const LOG_PREFIX = '[ORCHESTRATOR]';
const LOG_COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m'
};

function log(stage, message, data = null) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const prefix = `${LOG_COLORS.dim}${timestamp}${LOG_COLORS.reset} ${LOG_COLORS.cyan}${LOG_PREFIX}${LOG_COLORS.reset}`;

  console.log(`${prefix} ${LOG_COLORS.bright}[${stage}]${LOG_COLORS.reset} ${message}`);
  if (data) {
    if (typeof data === 'object') {
      console.log(`${prefix} ${LOG_COLORS.dim}└─ ${JSON.stringify(data, null, 2).split('\n').join('\n' + prefix + '    ')}${LOG_COLORS.reset}`);
    } else {
      console.log(`${prefix} ${LOG_COLORS.dim}└─ ${data}${LOG_COLORS.reset}`);
    }
  }
}

function logSuccess(stage, message) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  console.log(`${LOG_COLORS.dim}${timestamp}${LOG_COLORS.reset} ${LOG_COLORS.cyan}${LOG_PREFIX}${LOG_COLORS.reset} ${LOG_COLORS.green}✓ [${stage}]${LOG_COLORS.reset} ${message}`);
}

function logError(stage, message, error = null) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  console.log(`${LOG_COLORS.dim}${timestamp}${LOG_COLORS.reset} ${LOG_COLORS.cyan}${LOG_PREFIX}${LOG_COLORS.reset} ${LOG_COLORS.red}✗ [${stage}]${LOG_COLORS.reset} ${message}`);
  if (error) {
    console.log(`${LOG_COLORS.red}  └─ ${error}${LOG_COLORS.reset}`);
  }
}

function logTiming(stage, ms) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const color = ms < 1000 ? LOG_COLORS.green : ms < 3000 ? LOG_COLORS.yellow : LOG_COLORS.red;
  console.log(`${LOG_COLORS.dim}${timestamp}${LOG_COLORS.reset} ${LOG_COLORS.cyan}${LOG_PREFIX}${LOG_COLORS.reset} ${LOG_COLORS.magenta}⏱ [${stage}]${LOG_COLORS.reset} ${color}${ms}ms${LOG_COLORS.reset}`);
}

import { validatePlan } from './validators.js';
import {
  createScratchpad,
  startTurn,
  completeTurn,
  applyUpdates,
  validateAndSanitize,
  serialize,
  getContextSummary,
  getPendingAction,
  clearPendingActions
} from './scratchpad.js';
import { buildPlannerSystemPrompt, buildPlannerInput } from '../prompts/planner.js';

// Import executors
import { executeRagSearch } from '../executors/rag.js';
import { executeWebSearch } from '../executors/web.js';
import { executeCrmRead, executeCrmWrite } from '../executors/crm.js';
import { executeQualify } from '../executors/qualify.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =============================================
// RESULT SERIALIZATION (for eval/replan)
// =============================================

/**
 * Serialize results for evaluator/planner - FULL data, not truncated
 * @param {object[]} results - Execution results
 * @returns {string} Full serialized results
 */
function serializeResultsForEval(results) {
  return results.map(r => {
    const header = `[${r.tool}] ${r.success ? 'SUCCESS' : 'FAILED'}`;
    if (!r.success) {
      return `${header}: ${r.error}`;
    }

    const data = r.data;

    // CRM read - show full prospect list
    if (r.tool === 'crm_read' && data.prospects) {
      const prospectList = data.prospects.map(p => {
        const fields = [`name: ${p.company_name}`];
        if (p.website_url) fields.push(`url: ${p.website_url}`);
        else fields.push(`url: MISSING`);
        if (p.industry) fields.push(`industry: ${p.industry}`);
        else fields.push(`industry: MISSING`);
        if (p.status) fields.push(`status: ${p.status}`);
        if (p.score !== null && p.score !== undefined) fields.push(`score: ${p.score}`);
        return `  - ${fields.join(', ')}`;
      }).join('\n');
      return `${header}\nProspects (${data.prospects.length}):\n${prospectList}`;
    }

    // Web search - show enrichment data or search results
    if (r.tool === 'web_search') {
      if (data.error) return `${header}: ${data.error}`;

      // Enrichment mode - show structured data for CRM write
      if (data.enrichment || data.structured) {
        const enrichData = data.enrichment || data.structured;
        const fields = [];
        if (data.company_name) fields.push(`company_name: "${data.company_name}"`);
        if (data.website_url) fields.push(`website_url: "${data.website_url}"`);
        if (enrichData.industry) fields.push(`industry: "${enrichData.industry}"`);
        if (enrichData.location) fields.push(`location: "${enrichData.location}"`);
        if (enrichData.company_size) fields.push(`company_size: "${enrichData.company_size}"`);
        if (enrichData.description) fields.push(`description: "${enrichData.description.substring(0, 200)}"`);
        if (enrichData.contact_email) fields.push(`contact_email: "${enrichData.contact_email}"`);
        if (enrichData.notes) fields.push(`notes: "${enrichData.notes.substring(0, 150)}"`);

        return `${header} for "${data.query || data.company_name}":\n  ENRICHMENT DATA (use these values for crm_write):\n  ${fields.join('\n  ')}`;
      }

      // Direct scrape mode
      if (data.content) return `${header}: Scraped content (${data.raw_length} chars)\n${data.content.substring(0, 600)}`;

      // Search results mode
      if (data.results && data.results.length > 0) {
        const resultList = data.results.slice(0, 5).map(sr => {
          let line = `  - ${sr.title || 'Unknown'}: ${sr.url || 'no url'}`;
          if (sr.snippet) line += `\n    ${sr.snippet.substring(0, 150)}`;
          return line;
        }).join('\n');
        return `${header} for "${data.query}":\n${resultList}`;
      }
      return `${header}: No results for "${data.query}"`;
    }

    // CRM write
    if (r.tool === 'crm_write') {
      return `${header}: ${data.action} "${data.company_name}" (id: ${data.prospect_id})`;
    }

    // Default - full JSON but capped
    const jsonStr = JSON.stringify(data, null, 2);
    return `${header}:\n${jsonStr.substring(0, 1000)}${jsonStr.length > 1000 ? '...' : ''}`;
  }).join('\n\n');
}

// =============================================
// MAIN ORCHESTRATION FUNCTION
// =============================================

/**
 * Main orchestration entry point
 * @param {string} message - User's message
 * @param {string} workspaceId - Workspace UUID
 * @param {object[]} conversationHistory - Previous messages
 * @param {object} rawScratchpad - Scratchpad from client
 * @returns {Promise<{response: string, scratchpad: object, debug?: object}>}
 */
export async function orchestrate(message, workspaceId, conversationHistory = [], rawScratchpad = null) {
  const startTime = Date.now();
  const debug = { steps: [], timings: {}, iterations: 0 };

  console.log('\n' + '='.repeat(70));
  log('START', `New orchestration request`, { message: message.substring(0, 100), workspaceId });
  console.log('='.repeat(70));

  try {
    // 1. Validate and initialize scratchpad
    log('INIT', 'Validating scratchpad...');
    let scratchpad = validateAndSanitize(rawScratchpad, workspaceId);
    debug.timings.init = Date.now() - startTime;
    logSuccess('INIT', `Scratchpad ready (turn ${scratchpad.turn_count})`);
    logTiming('INIT', debug.timings.init);

    // 1.5 Check for pending action confirmation
    const pendingAction = getPendingAction(scratchpad);
    if (pendingAction) {
      const isConfirm = isConfirmation(message);
      const isCancel = isCancellation(message);

      if (isConfirm || isCancel) {
        log('CONFIRMATION', `Pending action: ${pendingAction.action}, User response: ${isConfirm ? 'CONFIRM' : 'CANCEL'}`);

        if (isCancel) {
          scratchpad = clearPendingActions(scratchpad);
          scratchpad = startTurn(scratchpad, message);
          return {
            response: "Got it, I've cancelled that action. What else can I help with?",
            scratchpad: serialize(scratchpad),
            tools_used: [],
            debug: { ...debug, cancelled: true }
          };
        }

        log('CONFIRMATION', `Executing confirmed action: ${pendingAction.action}`);
        const confirmResult = await executeConfirmedAction(pendingAction, workspaceId, scratchpad);
        scratchpad = clearPendingActions(scratchpad);
        scratchpad = startTurn(scratchpad, message);

        return {
          response: confirmResult.response,
          scratchpad: serialize(scratchpad),
          tools_used: confirmResult.tools_used || [],
          debug: { ...debug, confirmed_action: pendingAction }
        };
      }
    }

    // 2. Start turn
    scratchpad = startTurn(scratchpad, message);

    // 3. ReAct Loop: Plan → Execute → Eval → (Respond or Re-plan)
    const MAX_ITERATIONS = 3;
    let iteration = 0;
    let gaps = null;
    let previousResults = null;
    let allResults = [];
    let allToolsUsed = [];

    while (iteration < MAX_ITERATIONS) {
      iteration++;
      log('REACT', `Iteration ${iteration}/${MAX_ITERATIONS}`);

      // Generate plan (handles both initial and re-planning via replanContext)
      log('PLANNER', gaps ? 'Re-planning to fill gaps...' : 'Generating initial plan...');
      const planStartTime = Date.now();

      const replanContext = gaps ? {
        gaps,
        previousResults: serializeResultsForEval(previousResults)
      } : null;

      const plan = await generatePlan(message, scratchpad, conversationHistory, replanContext);
      debug.timings.planning = (debug.timings.planning || 0) + (Date.now() - planStartTime);

      if (!plan) {
        logError('PLANNER', 'Failed to generate valid plan');
        if (iteration === 1) {
          return {
            response: "I couldn't process that request. Could you rephrase it?",
            scratchpad: serialize(scratchpad),
            debug
          };
        }
        break; // Exit loop if re-planning fails, synthesize what we have
      }

      logSuccess('PLANNER', `Plan: ${plan.steps.length} step(s)`);
      log('PLANNER', `Reasoning: ${plan.reasoning}`);
      plan.steps.forEach((step, i) => {
        log('PLANNER', `  Step ${i + 1}: ${step.tool} - ${step.purpose}`);
      });
      logTiming('PLANNER', Date.now() - planStartTime);

      // Execute plan
      log('EXECUTOR', 'Executing plan...');
      const execStartTime = Date.now();
      const { results, scratchpad: updatedScratchpad } = await executePlan(plan, workspaceId, scratchpad);
      scratchpad = updatedScratchpad;
      allResults.push(...results);
      allToolsUsed.push(...plan.steps.map(s => s.tool));
      debug.timings.execution = (debug.timings.execution || 0) + (Date.now() - execStartTime);

      const successCount = results.filter(r => r.success).length;
      if (successCount === results.length) {
        logSuccess('EXECUTOR', `All ${results.length} step(s) completed`);
      } else {
        logError('EXECUTOR', `${successCount}/${results.length} steps succeeded`);
      }
      logTiming('EXECUTOR', Date.now() - execStartTime);

      // Apply scratchpad updates from planner
      if (plan.scratchpad_updates) {
        scratchpad = applyUpdates(scratchpad, plan.scratchpad_updates);
      }

      // Evaluate: Is the task complete?
      log('EVAL', 'Evaluating results...');
      const evalStartTime = Date.now();
      const evaluation = await evaluate(message, results, scratchpad, conversationHistory);
      debug.timings.eval = (debug.timings.eval || 0) + (Date.now() - evalStartTime);
      logTiming('EVAL', Date.now() - evalStartTime);

      if (evaluation.complete) {
        logSuccess('EVAL', 'Task complete');
        break;
      }

      if (evaluation.error) {
        logError('EVAL', `Evaluation error: ${evaluation.error}`);
        break; // Exit on eval error, synthesize what we have
      }

      // Set up for next iteration
      log('EVAL', `Gaps identified: ${evaluation.gaps?.length || 0}`);
      evaluation.gaps?.forEach((g, i) => log('EVAL', `  ${i + 1}. ${g}`));

      gaps = evaluation.gaps;
      previousResults = results;
    }

    if (iteration >= MAX_ITERATIONS) {
      log('REACT', `Max iterations (${MAX_ITERATIONS}) reached`);
    }

    debug.iterations = iteration;
    debug.results = allResults;

    // 4. Synthesize final response
    log('SYNTHESIZER', 'Generating response...');
    const synthStartTime = Date.now();
    const response = await synthesize(message, allResults, scratchpad, conversationHistory);
    debug.timings.synthesis = Date.now() - synthStartTime;
    logSuccess('SYNTHESIZER', `Response: ${response.length} chars`);
    logTiming('SYNTHESIZER', debug.timings.synthesis);

    // 5. Complete turn
    scratchpad = completeTurn(scratchpad, response.substring(0, 200));
    debug.timings.total = Date.now() - startTime;

    console.log('='.repeat(70));
    logSuccess('COMPLETE', `Total time: ${debug.timings.total}ms, Iterations: ${iteration}`);
    log('COMPLETE', `Tools: ${[...new Set(allToolsUsed)].join(', ')}`);
    console.log('='.repeat(70) + '\n');

    return {
      response,
      scratchpad: serialize(scratchpad),
      tools_used: [...new Set(allToolsUsed)],
      debug
    };

  } catch (error) {
    logError('ERROR', `Orchestration failed: ${error.message}`);
    console.error(error.stack);
    debug.error = error.message;
    debug.timings.total = Date.now() - startTime;

    return {
      response: `I encountered an error: ${error.message}. Please try again.`,
      scratchpad: serialize(rawScratchpad || createScratchpad(workspaceId)),
      debug
    };
  }
}

// =============================================
// PLANNER (handles initial + re-planning)
// =============================================

/**
 * Generate execution plan from user message
 * Handles both initial planning and re-planning when gaps are identified
 *
 * @param {string} message - User's message
 * @param {object} scratchpad - Current scratchpad
 * @param {object[]} conversationHistory - Previous messages
 * @param {object} replanContext - Optional: { gaps: string[], previousResults: string }
 * @returns {Promise<object|null>} Validated plan or null
 */
async function generatePlan(message, scratchpad, conversationHistory = [], replanContext = null) {
  const systemPrompt = buildPlannerSystemPrompt();
  const contextSummary = getContextSummary(scratchpad);

  const recentMessages = conversationHistory.slice(-6);
  const conversationContext = recentMessages.length > 0
    ? recentMessages.map(m => `${m.role}: ${m.content}`).join('\n')
    : '';

  const userPrompt = buildPlannerInput(message, scratchpad, contextSummary, conversationContext, replanContext);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 1500
    });

    const content = completion.choices[0].message.content.trim();

    let parsed;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : content);
    } catch (e) {
      console.error('[PLANNER] JSON parse error:', e.message);
      console.error('[PLANNER] Raw content:', content);
      return null;
    }

    const validation = validatePlan(parsed);
    if (!validation.success) {
      console.error('[PLANNER] Validation error:', validation.error);
      return null;
    }

    return validation.data;

  } catch (error) {
    console.error('[PLANNER] Error:', error);
    return null;
  }
}

// =============================================
// EVALUATOR (identifies gaps only)
// =============================================

/**
 * Evaluate execution results - identifies gaps, does NOT generate plans
 *
 * @param {string} originalMessage - User's original request
 * @param {object[]} results - Execution results from current iteration
 * @param {object} scratchpad - Current scratchpad with context
 * @param {object[]} conversationHistory - Previous messages
 * @returns {Promise<{complete: boolean, gaps?: string[], error?: string}>}
 */
async function evaluate(originalMessage, results, scratchpad, conversationHistory) {
  const resultsSummary = serializeResultsForEval(results);
  const contextSummary = getContextSummary(scratchpad);

  const recentMessages = conversationHistory.slice(-4);
  const conversationContext = recentMessages.length > 0
    ? recentMessages.map(m => `${m.role}: ${m.content}`).join('\n')
    : 'No prior messages.';

  const systemPrompt = `You are an evaluator for a B2B sales assistant. Determine if the user's request is COMPLETE.

## YOUR TASK
1. Compare the original request to what was accomplished
2. Identify any GAPS - things requested but not done
3. Be specific about what's missing
4. If enrichment data was collected, ensure it gets written to CRM

## ENRICHMENT AWARENESS
When web_search returns ENRICHMENT DATA, that data MUST be written to CRM with crm_write.
If you see enrichment results but no corresponding crm_write, that's a gap.

## OUTPUT FORMAT
Return ONLY valid JSON:

If complete:
{ "complete": true }

If incomplete (be SPECIFIC about gaps, use actual company names and data):
{
  "complete": false,
  "gaps": [
    "Write enrichment data to CRM for Wabash College: industry='Higher Education', website_url='https://wabash.edu'",
    "Write enrichment data to CRM for RetroFit Design: industry='Architecture', website_url='https://retrofitdesign.com'"
  ]
}`;

  const userPrompt = `## ORIGINAL REQUEST
"${originalMessage}"

## SCRATCHPAD CONTEXT
${contextSummary}

## RECENT CONVERSATION
${conversationContext}

## EXECUTION RESULTS
${resultsSummary}

## QUESTION
Is the original request fully complete? If not, list specific gaps using actual company names from the results.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 500
    });

    const content = completion.choices[0].message.content.trim();

    let parsed;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : content);
    } catch (e) {
      console.error('[EVAL] JSON parse error:', e.message);
      console.error('[EVAL] Raw content:', content);
      return { complete: false, error: 'eval_parse_failed', gaps: ['Evaluator returned invalid JSON'] };
    }

    if (parsed.complete) {
      return { complete: true };
    }

    return {
      complete: false,
      gaps: parsed.gaps || ['Unspecified gaps']
    };

  } catch (error) {
    console.error('[EVAL] Error:', error);
    return { complete: false, error: 'eval_failed', gaps: [`Evaluation error: ${error.message}`] };
  }
}

// =============================================
// EXECUTOR DISPATCH
// =============================================

/**
 * Execute all steps in the plan
 */
async function executePlan(plan, workspaceId, scratchpad) {
  const results = [];
  let currentScratchpad = scratchpad;

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const stepStartTime = Date.now();

    log('STEP', `[${i + 1}/${plan.steps.length}] ${step.tool}`);
    if (step.params && Object.keys(step.params).length > 0) {
      log('STEP', `  Params: ${JSON.stringify(step.params)}`);
    }

    try {
      const previousResults = step.depends_on !== undefined ? results[step.depends_on]?.data : null;
      const result = await executeStep(step, workspaceId, currentScratchpad, previousResults);
      const stepTime = Date.now() - stepStartTime;

      if (result.scratchpad_updates) {
        currentScratchpad = applyUpdates(currentScratchpad, result.scratchpad_updates);
      }

      const resultSummary = summarizeResult(step.tool, result);
      logSuccess('STEP', `[${i + 1}] ${resultSummary}`);
      logTiming('STEP', stepTime);

      results.push({
        step: i,
        tool: step.tool,
        purpose: step.purpose,
        success: true,
        data: result,
        timing: stepTime
      });

    } catch (error) {
      const stepTime = Date.now() - stepStartTime;
      logError('STEP', `[${i + 1}] ${step.tool} failed: ${error.message}`);
      logTiming('STEP', stepTime);

      results.push({
        step: i,
        tool: step.tool,
        purpose: step.purpose,
        success: false,
        error: error.message,
        timing: stepTime
      });
    }
  }

  return { results, scratchpad: currentScratchpad };
}

function summarizeResult(tool, result) {
  if (!result) return 'no result';

  switch (tool) {
    case 'rag_search':
      return `${result.total_results || result.chunks?.length || 0} chunks`;
    case 'web_search':
      if (result.error) return `error: ${result.error}`;
      if (result.content) return `scraped ${result.raw_length || '?'} chars`;
      return `${result.results?.length || 0} results`;
    case 'crm_read':
      return `${result.prospects?.length || 0} prospects`;
    case 'crm_write':
      return `${result.action}: ${result.company_name}`;
    case 'qualify':
      return `score: ${result.score}/100`;
    default:
      return 'done';
  }
}

async function executeStep(step, workspaceId, scratchpad, previousResult) {
  const { tool, params } = step;
  const mergedParams = previousResult ? { ...params, _previous: previousResult } : params;

  switch (tool) {
    case 'rag_search':
      return await executeRagSearch(mergedParams, workspaceId);
    case 'web_search':
      return await executeWebSearch(mergedParams);
    case 'crm_read':
      return await executeCrmRead(mergedParams, workspaceId);
    case 'crm_write':
      return await executeCrmWrite(mergedParams, workspaceId);
    case 'qualify':
      return await executeQualify(mergedParams, workspaceId);
    case 'external_enrich':
      return { message: 'External enrichment not yet implemented', params: mergedParams };
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

// =============================================
// SYNTHESIZER
// =============================================

async function synthesize(originalMessage, results, scratchpad, conversationHistory) {
  const resultsContext = serializeResultsForEval(results);

  const systemPrompt = `You are Prover, a B2B sales enablement assistant.

Synthesize the execution results into a helpful, conversational response.

## GUIDELINES
- Be concise but informative
- Reference specific data from results
- Suggest logical next actions when appropriate
- If some steps failed, acknowledge but focus on successes
- Don't mention internal tools or technical details

## PROACTIVE SUGGESTIONS
When you notice prospects with missing data (null URLs, null industry, etc.), proactively suggest enrichment:
- "I notice some of these leads are missing website/industry data. Want me to enrich them?"
- "Would you like me to research and fill in the missing company details?"
Only suggest if there are actual gaps AND enrichment wasn't just performed.`;

  const userPrompt = `## USER'S REQUEST
"${originalMessage}"

## RESULTS
${resultsContext}

## CONTEXT
${getContextSummary(scratchpad)}

Provide a helpful response summarizing what was accomplished.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    return completion.choices[0].message.content;

  } catch (error) {
    console.error('[SYNTHESIZER] Error:', error);
    const successfulResults = results.filter(r => r.success);
    if (successfulResults.length === 0) {
      return "I wasn't able to complete that request. Could you try again?";
    }
    return `I completed some tasks but had trouble formatting the response. ${successfulResults.length} step(s) succeeded.`;
  }
}

// =============================================
// CONFIRMATION HELPERS
// =============================================

async function executeConfirmedAction(pendingAction, workspaceId, scratchpad) {
  const { action, data } = pendingAction;
  const tools_used = [];

  try {
    switch (action) {
      case 'save_prospect': {
        const result = await executeCrmWrite(data, workspaceId);
        tools_used.push('crm_write');
        return {
          response: `Done! ${data.company_name} has been saved to your CRM.${result.action === 'updated' ? ' (Updated existing record)' : ''}`,
          tools_used
        };
      }

      case 'enrich_prospect': {
        const webResult = await executeWebSearch({ query: `${data.company_name} company overview` });
        tools_used.push('web_search');

        const qualifyResult = await executeQualify({ company_name: data.company_name }, workspaceId);
        tools_used.push('qualify');

        await executeCrmWrite({
          company_name: data.company_name,
          ...qualifyResult.prospect_data,
          source: 'enrichment'
        }, workspaceId);
        tools_used.push('crm_write');

        return {
          response: `Enriched ${data.company_name}! ICP Score: ${qualifyResult.score}/100. ${qualifyResult.score_reason}`,
          tools_used
        };
      }

      case 'build_list': {
        const saved = [];
        for (const prospect of data.prospects || []) {
          try {
            await executeCrmWrite({ company_name: prospect.company_name, ...prospect }, workspaceId);
            saved.push(prospect.company_name);
            tools_used.push('crm_write');
          } catch (e) {
            console.error(`[CONFIRMATION] Failed to save ${prospect.company_name}:`, e.message);
          }
        }
        return {
          response: `Saved ${saved.length} prospect(s) to your CRM: ${saved.join(', ')}`,
          tools_used
        };
      }

      default:
        return {
          response: `I'm not sure how to execute that action (${action}). Please try again.`,
          tools_used: []
        };
    }
  } catch (error) {
    console.error('[CONFIRMATION] Execution error:', error);
    return {
      response: `I encountered an error: ${error.message}`,
      tools_used
    };
  }
}

// =============================================
// EXPORTS
// =============================================

export default orchestrate;

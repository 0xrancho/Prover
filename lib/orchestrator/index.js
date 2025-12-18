/**
 * ORCHESTRATOR - Main Execution Loop
 *
 * The orchestrator coordinates:
 * 1. Router - Detects mode from user message
 * 2. Planner - Generates execution plan (LLM call)
 * 3. Executors - Runs each step of the plan
 * 4. Synthesizer - Assembles final response (LLM call)
 *
 * Core principle: Planner never executes. Executor never plans.
 * Your code orchestrates.
 */

import OpenAI from 'openai';
import { detectMode, detectBuildSubtype, detectAskChunkTypes } from './router.js';

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
import { validatePlan, validateExecutorResult } from './validators.js';
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
  const debug = { steps: [], timings: {} };

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
      const isConfirm = isConfirmationMessage(message);
      const isCancel = isCancellationMessage(message);

      if (isConfirm || isCancel) {
        log('CONFIRMATION', `Pending action: ${pendingAction.action}, User response: ${isConfirm ? 'CONFIRM' : 'CANCEL'}`);

        if (isCancel) {
          // User cancelled - clear pending actions and acknowledge
          scratchpad = clearPendingActions(scratchpad);
          scratchpad = startTurn(scratchpad, message, 'ask');
          return {
            response: "Got it, I've cancelled that action. What else can I help with?",
            scratchpad: serialize(scratchpad),
            mode: 'ask',
            tools_used: [],
            debug: { ...debug, cancelled: true }
          };
        }

        // User confirmed - execute the pending action
        log('CONFIRMATION', `Executing confirmed action: ${pendingAction.action}`);
        const confirmResult = await executeConfirmedAction(pendingAction, workspaceId, scratchpad);
        scratchpad = clearPendingActions(scratchpad);
        scratchpad = startTurn(scratchpad, message, pendingAction.action.includes('enrich') ? 'enrich' : 'build');

        return {
          response: confirmResult.response,
          scratchpad: serialize(scratchpad),
          mode: pendingAction.action.includes('enrich') ? 'enrich' : 'build',
          tools_used: confirmResult.tools_used || [],
          debug: { ...debug, confirmed_action: pendingAction }
        };
      }
      // If not a clear confirm/cancel, continue with normal flow
      // The planner will see the pending action in context
    }

    // 2. Detect mode
    log('ROUTER', `Analyzing message: "${message.substring(0, 60)}..."`);
    const mode = detectMode(message, scratchpad);
    const subtype = mode === 'build' ? detectBuildSubtype(message) : null;
    const chunkTypes = mode === 'ask' ? detectAskChunkTypes(message) : null;

    scratchpad = startTurn(scratchpad, message, mode);
    debug.mode = mode;
    debug.subtype = subtype;
    debug.chunkTypes = chunkTypes;
    debug.timings.routing = Date.now() - startTime;

    logSuccess('ROUTER', `Mode: ${mode.toUpperCase()}${subtype ? ` (${subtype})` : ''}`);
    if (chunkTypes) {
      log('ROUTER', `Target chunk types: ${chunkTypes.join(', ')}`);
    }
    logTiming('ROUTER', debug.timings.routing - debug.timings.init);

    // 3. Generate plan
    log('PLANNER', 'Generating execution plan...');
    const planStartTime = Date.now();
    const plan = await generatePlan(message, mode, scratchpad, conversationHistory);
    debug.plan = plan;
    debug.timings.planning = Date.now() - planStartTime;

    if (!plan) {
      logError('PLANNER', 'Failed to generate valid plan');
      return {
        response: "I couldn't process that request. Could you rephrase it?",
        scratchpad: serialize(scratchpad),
        debug
      };
    }

    logSuccess('PLANNER', `Plan generated: ${plan.steps.length} step(s)`);
    log('PLANNER', `Reasoning: ${plan.reasoning}`);
    plan.steps.forEach((step, i) => {
      log('PLANNER', `  Step ${i + 1}: ${step.tool} - ${step.purpose}`);
    });
    logTiming('PLANNER', debug.timings.planning);

    // 4. Execute plan steps (scratchpad updates applied during execution)
    log('EXECUTOR', 'Beginning plan execution...');
    const execStartTime = Date.now();
    const { results, scratchpad: executorScratchpad } = await executePlan(plan, workspaceId, scratchpad);
    scratchpad = executorScratchpad; // Use scratchpad updated by executors
    debug.results = results;
    debug.timings.execution = Date.now() - execStartTime;

    const successCount = results.filter(r => r.success).length;
    if (successCount === results.length) {
      logSuccess('EXECUTOR', `All ${results.length} step(s) completed successfully`);
    } else {
      logError('EXECUTOR', `${successCount}/${results.length} steps succeeded`);
    }
    logTiming('EXECUTOR', debug.timings.execution);

    // 5. Apply any additional scratchpad updates from planner (e.g., predicted outcomes)
    if (plan.scratchpad_updates) {
      log('SCRATCHPAD', 'Applying additional updates from plan');
      scratchpad = applyUpdates(scratchpad, plan.scratchpad_updates);
    }

    // 6. Synthesize response
    log('SYNTHESIZER', 'Generating final response...');
    const synthStartTime = Date.now();
    const response = await synthesize(message, plan, results, scratchpad, conversationHistory);
    debug.timings.synthesis = Date.now() - synthStartTime;
    logSuccess('SYNTHESIZER', `Response generated (${response.length} chars)`);
    logTiming('SYNTHESIZER', debug.timings.synthesis);

    // 7. Complete turn
    scratchpad = completeTurn(scratchpad, response.substring(0, 200));
    debug.timings.total = Date.now() - startTime;

    console.log('='.repeat(70));
    logSuccess('COMPLETE', `Total orchestration time`);
    logTiming('TOTAL', debug.timings.total);
    log('COMPLETE', `Tools used: ${plan.steps.map(s => s.tool).join(', ')}`);
    console.log('='.repeat(70) + '\n');

    return {
      response,
      scratchpad: serialize(scratchpad),
      mode,
      tools_used: plan.steps.map(s => s.tool),
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
// PLANNER
// =============================================

/**
 * Generate execution plan from user message
 * @param {string} message - User's message
 * @param {string} mode - Detected mode
 * @param {object} scratchpad - Current scratchpad
 * @param {object[]} conversationHistory - Previous messages
 * @returns {Promise<object|null>} Validated plan or null
 */
async function generatePlan(message, mode, scratchpad, conversationHistory = []) {
  const systemPrompt = buildPlannerSystemPrompt(true);
  const contextSummary = getContextSummary(scratchpad);

  // Build recent conversation context (last 4-6 messages per spec)
  const recentMessages = conversationHistory.slice(-6);
  const conversationContext = recentMessages.length > 0
    ? recentMessages.map(m => `${m.role}: ${m.content}`).join('\n')
    : '';

  const userPrompt = buildPlannerInput(message, mode, scratchpad, contextSummary, conversationContext);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 800
    });

    const content = completion.choices[0].message.content.trim();

    // Parse JSON (handle potential markdown code blocks)
    let parsed;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : content);
    } catch (e) {
      console.error('[PLANNER] JSON parse error:', e.message);
      console.error('[PLANNER] Raw content:', content);
      return null;
    }

    // Validate plan schema
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
// EXECUTOR DISPATCH
// =============================================

/**
 * Execute all steps in the plan
 * @param {object} plan - Validated plan
 * @param {string} workspaceId - Workspace UUID
 * @param {object} scratchpad - Current scratchpad (will be mutated with updates)
 * @returns {Promise<{results: object[], scratchpad: object}>} Results and updated scratchpad
 */
async function executePlan(plan, workspaceId, scratchpad) {
  const results = [];
  let currentScratchpad = scratchpad;

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const stepStartTime = Date.now();

    log('STEP', `[${i + 1}/${plan.steps.length}] Executing: ${step.tool}`);
    log('STEP', `  Purpose: ${step.purpose}`);
    if (step.params && Object.keys(step.params).length > 0) {
      log('STEP', `  Params: ${JSON.stringify(step.params)}`);
    }

    try {
      // Get results from previous steps if this step depends on them
      const previousResults = step.depends_on !== undefined ? results[step.depends_on]?.data : null;
      if (step.depends_on !== undefined) {
        log('STEP', `  Depends on step ${step.depends_on + 1} result`);
      }

      // Dispatch to appropriate executor
      const result = await executeStep(step, workspaceId, currentScratchpad, previousResults);
      const stepTime = Date.now() - stepStartTime;

      // Apply scratchpad updates from executor IMMEDIATELY
      if (result.scratchpad_updates) {
        log('STEP', `  Applying scratchpad updates from ${step.tool}`);
        currentScratchpad = applyUpdates(currentScratchpad, result.scratchpad_updates);
      }

      // Log result summary
      const resultSummary = summarizeResult(step.tool, result);
      logSuccess('STEP', `[${i + 1}] ${step.tool} completed: ${resultSummary}`);
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

      // Continue with next step even if one fails
      // The synthesizer will handle partial results
    }
  }

  return { results, scratchpad: currentScratchpad };
}

/**
 * Summarize executor result for logging
 */
function summarizeResult(tool, result) {
  if (!result) return 'no result';

  switch (tool) {
    case 'rag_search':
      return `${result.total_results || result.chunks?.length || 0} chunks found`;
    case 'web_search':
      if (result.error) return `error: ${result.error}`;
      if (result.content) return `scraped ${result.raw_length || 'unknown'} chars`;
      return `${result.results?.length || 0} search results`;
    case 'crm_read':
      return `${result.prospects?.length || 0} prospects`;
    case 'crm_write':
      return `${result.action}: ${result.company_name}`;
    case 'qualify':
      return `score: ${result.score}/100 - ${result.score_reason?.substring(0, 50)}...`;
    default:
      return JSON.stringify(result).substring(0, 100);
  }
}

/**
 * Execute a single step by dispatching to the appropriate executor
 * @param {object} step - Plan step
 * @param {string} workspaceId - Workspace UUID
 * @param {object} scratchpad - Current scratchpad
 * @param {object} previousResult - Result from dependent step
 * @returns {Promise<object>} Executor result
 */
async function executeStep(step, workspaceId, scratchpad, previousResult) {
  const { tool, params } = step;

  // Merge in previous results if needed
  const mergedParams = previousResult
    ? { ...params, _previous: previousResult }
    : params;

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
      // Placeholder for future external enrichment providers
      return {
        message: 'External enrichment not yet implemented',
        params: mergedParams,
        available_providers: []
      };

    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

// =============================================
// SYNTHESIZER
// =============================================

/**
 * Synthesize final response from executor results
 * @param {string} originalMessage - User's original message
 * @param {object} plan - Execution plan
 * @param {object[]} results - Executor results
 * @param {object} scratchpad - Current scratchpad
 * @param {object[]} conversationHistory - Previous messages
 * @returns {Promise<string>} User-facing response
 */
async function synthesize(originalMessage, plan, results, scratchpad, conversationHistory) {
  // Build context from results
  const resultsContext = results.map(r => {
    if (r.success) {
      return `[${r.tool}] ${r.purpose}\nResult: ${JSON.stringify(r.data, null, 2)}`;
    } else {
      return `[${r.tool}] ${r.purpose}\nFailed: ${r.error}`;
    }
  }).join('\n\n');

  const systemPrompt = `You are Prover, a B2B sales enablement assistant.

Your task is to synthesize the results of an execution plan into a helpful, conversational response.

## GUIDELINES
- Be concise but informative
- Reference specific data from the results when relevant
- Suggest logical next actions when appropriate
- If some steps failed, acknowledge but focus on what succeeded
- Don't mention internal tools or technical details
- Be conversational, not robotic`;

  const userPrompt = `## USER'S ORIGINAL REQUEST
"${originalMessage}"

## EXECUTION PLAN
Mode: ${plan.mode}
Reasoning: ${plan.reasoning}

## RESULTS
${resultsContext}

## CONVERSATION CONTEXT
${getContextSummary(scratchpad)}

Based on these results, provide a helpful response to the user.`;

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

    // Fallback: simple response from results
    const successfulResults = results.filter(r => r.success);
    if (successfulResults.length === 0) {
      return "I wasn't able to complete that request. Could you try again?";
    }

    return `I found some information for you, but had trouble formatting it. Here's what I got: ${JSON.stringify(successfulResults[0].data)}`;
  }
}

// =============================================
// CONFIRMATION HELPERS
// =============================================

/**
 * Check if message is a confirmation
 * @param {string} message - User's message
 * @returns {boolean}
 */
function isConfirmationMessage(message) {
  const q = message.toLowerCase().trim();
  const confirmWords = ['yes', 'y', 'ok', 'okay', 'sure', 'confirm', 'save', 'do it', 'go ahead', 'looks good', 'perfect', 'yep', 'yup'];
  return confirmWords.some(word => q === word || q.startsWith(word + ' ') || q.includes(word));
}

/**
 * Check if message is a cancellation
 * @param {string} message - User's message
 * @returns {boolean}
 */
function isCancellationMessage(message) {
  const q = message.toLowerCase().trim();
  const cancelWords = ['no', 'cancel', 'stop', 'nevermind', 'never mind', 'nope', 'nah', 'don\'t', 'dont'];
  // Check for exact match, starts with word + space/comma/punctuation, or contains the word
  return cancelWords.some(word =>
    q === word ||
    q.startsWith(word + ' ') ||
    q.startsWith(word + ',') ||
    q.startsWith(word + '.') ||
    q.includes(' ' + word + ' ') ||
    q.includes(' ' + word + ',')
  );
}

/**
 * Execute a confirmed pending action
 * @param {object} pendingAction - The pending action to execute
 * @param {string} workspaceId - Workspace UUID
 * @param {object} scratchpad - Current scratchpad
 * @returns {Promise<{response: string, tools_used: string[]}>}
 */
async function executeConfirmedAction(pendingAction, workspaceId, scratchpad) {
  const { action, data } = pendingAction;
  const tools_used = [];

  try {
    switch (action) {
      case 'save_prospect': {
        // Execute CRM write with the stored prospect data
        const result = await executeCrmWrite(data, workspaceId);
        tools_used.push('crm_write');
        return {
          response: `Done! ${data.company_name} has been saved to your CRM.${result.action === 'updated' ? ' (Updated existing record)' : ''}`,
          tools_used
        };
      }

      case 'enrich_prospect': {
        // Execute web search + qualify + crm_write
        const webResult = await executeWebSearch({ query: `${data.company_name} company overview` }, workspaceId);
        tools_used.push('web_search');

        const qualifyResult = await executeQualify({ company_name: data.company_name }, workspaceId, scratchpad);
        tools_used.push('qualify');

        const crmResult = await executeCrmWrite({
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
        // Execute multiple CRM writes for each prospect in the list
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
      response: `I encountered an error while executing that action: ${error.message}`,
      tools_used
    };
  }
}

// =============================================
// EXPORTS
// =============================================

export default orchestrate;

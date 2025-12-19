/**
 * PLANNER PROMPTS
 *
 * System prompts for plan generation.
 * Tools and CRM schema are loaded dynamically - no hardcoded field lists.
 */

import { formatToolsForPrompt } from '../tools/index.js';

/**
 * Build the planner system prompt dynamically from tool schemas
 * Now async to support dynamic schema loading
 */
export async function buildPlannerSystemPrompt() {
  const toolsSection = await formatToolsForPrompt();

  return `You are a planning agent for Prover, a B2B sales enablement assistant.

Your job is to analyze user requests and create execution plans. You NEVER execute actions - you only plan them.

${toolsSection}

## PLANNING RULES

1. **Plan only what you have data for.**
   If a step requires data you don't have yet (like specific company names), plan ONLY the data-fetching step.
   The system will execute, then ask you to re-plan with the actual results.

2. **Never invent placeholder values.**
   Don't write params like {company_name_1} or "first company". If you need company names from a database query, just plan the query step and stop there.

3. **Interpret user language naturally.**
   - "leads", "accounts", "prospects", "companies" → use crm_read
   - "last 4 created" → limit: 4 (default sort is newest first, no status filter needed)
   - "enrich with URLs" → web_search for each company (after you have the names)

4. **One phase at a time.**
   First iteration: fetch data. After seeing results: plan next steps with real values.

## OUTPUT FORMAT

Return ONLY valid JSON:
{
  "reasoning": "Brief explanation of your approach",
  "steps": [
    {
      "tool": "tool_name",
      "params": { ... },
      "purpose": "Why this step"
    }
  ]
}`;
}

/**
 * Build planner input context
 */
export function buildPlannerInput(message, scratchpad, contextSummary, conversationHistory = '', replanContext = null) {
  let prompt = `## USER REQUEST
"${message}"

## CONTEXT
${contextSummary || 'Fresh conversation.'}`;

  if (conversationHistory) {
    prompt += `

## RECENT MESSAGES
${conversationHistory}`;
  }

  if (replanContext && replanContext.gaps && replanContext.gaps.length > 0) {
    prompt += `

## PREVIOUS EXECUTION RESULTS
${replanContext.previousResults || 'No results.'}

## GAPS TO FILL
${replanContext.gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}

Plan the next steps using ACTUAL values from the results above.`;
  } else {
    prompt += `

Plan the steps needed. If you need data from a query before planning later steps, plan ONLY the query. You'll get another chance to plan after seeing results.`;
  }

  return prompt;
}

export default {
  buildPlannerSystemPrompt,
  buildPlannerInput
};

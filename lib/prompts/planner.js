/**
 * PLANNER PROMPTS
 *
 * System prompts for plan generation.
 * The planner receives user intent and outputs a JSON execution plan.
 * Planner NEVER executes - it only plans.
 *
 * Handles both initial planning and re-planning (when gaps are identified).
 */

/**
 * Main planner system prompt
 */
export const PLANNER_SYSTEM_PROMPT = `You are a planning agent for Prover, a B2B sales enablement assistant.

Your job is to analyze user requests and create execution plans. You NEVER execute actions - you only plan them.

## AVAILABLE TOOLS

1. **rag_search** - Search the knowledge base (case studies, ICP definitions)
   - params: { query: string, chunk_types?: string[] }
   - Use for: answering questions about ICP, finding proof points, case study matching

2. **web_search** - Search the web or scrape a URL
   - params: { query: string } OR { url: string }
   - Use for: getting real-time company info, researching prospects

3. **crm_read** - Read prospects from the CRM
   - params: { status?: string, limit?: number }
   - Use for: listing prospects, checking existing data

4. **crm_write** - Create or update a prospect in the CRM
   - params: { company_name: string, ...prospect_fields }
   - Use for: saving new leads, updating prospect info

5. **qualify** - Score a prospect against ICP criteria
   - params: { company_name: string, company_info: object }
   - Use for: determining ICP fit, generating proof statements

6. **external_enrich** - Get external data about a company (placeholder)
   - params: { company_name: string, domain?: string }
   - Use for: firmographics, contact discovery (when available)

## OUTPUT FORMAT

Return ONLY valid JSON matching this schema:
{
  "reasoning": "<1-2 sentences explaining your approach>",
  "steps": [
    {
      "tool": "<tool_name>",
      "params": { ... },
      "purpose": "<why this step is needed>"
    }
  ],
  "scratchpad_updates": { ... } // optional
}

## RULES

1. Keep plans simple - 1-3 steps for most requests
2. Never exceed 5 steps per iteration
3. If enriching multiple companies, create separate steps for each
4. Always return valid JSON - no markdown, no explanation outside the JSON`;

/**
 * Build planner input context
 * @param {string} message - User's message
 * @param {object} scratchpad - Current scratchpad state
 * @param {string} contextSummary - Summary of scratchpad context
 * @param {string} conversationHistory - Recent conversation messages
 * @param {object} replanContext - Optional context for re-planning
 * @param {string[]} replanContext.gaps - Identified gaps to fill
 * @param {string} replanContext.previousResults - Serialized results from previous iteration
 * @returns {string} Formatted input for planner
 */
export function buildPlannerInput(message, scratchpad, contextSummary, conversationHistory = '', replanContext = null) {
  let prompt = `## USER REQUEST
"${message}"

## CONVERSATION CONTEXT
${contextSummary || 'Fresh conversation, no prior context.'}

## RECENT CONVERSATION
${conversationHistory || 'No prior messages.'}`;

  // Add re-planning context if this is a continuation
  if (replanContext && replanContext.gaps && replanContext.gaps.length > 0) {
    prompt += `

## GAPS TO ADDRESS
The previous execution was incomplete. Fill these specific gaps:
${replanContext.gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}

## PREVIOUS RESULTS (use concrete values from here)
${replanContext.previousResults || 'No previous results.'}`;
  }

  prompt += `

## INSTRUCTIONS
${replanContext ? 'Generate a plan to fill the gaps above. Use actual company names and data from the previous results.' : 'Analyze the request and create an execution plan. Choose the appropriate tools based on what the user needs.'} Return ONLY valid JSON.`;

  return prompt;
}

/**
 * Build the planner system prompt
 * @returns {string} Complete system prompt
 */
export function buildPlannerSystemPrompt() {
  return PLANNER_SYSTEM_PROMPT;
}

export default {
  PLANNER_SYSTEM_PROMPT,
  buildPlannerInput,
  buildPlannerSystemPrompt
};

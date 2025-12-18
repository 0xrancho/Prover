/**
 * QUALIFY EXECUTOR
 *
 * Scores prospects against ICP criteria using LLM.
 * Generates fit scores, rationale, and proof statements.
 */

import OpenAI from 'openai';
import { askRetrieval, formatChunksAsContext } from '../retrieval.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Execute qualification - score a prospect against ICP
 * @param {object} params - Qualification parameters
 * @param {string} params.company_name - Company name to qualify
 * @param {object} params.company_info - Company information (from web search, etc.)
 * @param {object} params._previous - Previous step results (from orchestrator)
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<object>} Qualification result
 */
export async function executeQualify(params, workspaceId) {
  const { company_name, company_info = {}, _previous } = params;

  if (!company_name) {
    throw new Error('Qualify requires company_name');
  }

  try {
    // Merge company info from previous steps if available
    const mergedInfo = {
      ...company_info,
      ...(_previous?.content ? { web_content: _previous.content } : {}),
      ...(_previous?.data ? _previous.data : {})
    };

    // 1. Get ICP context from knowledge base
    const icpRetrieval = await askRetrieval(
      `ICP criteria ideal customer profile`,
      workspaceId,
      { chunkTypes: ['icp_definition', 'icp_buyer', 'icp_negative'], limit: 5 }
    );
    const icpContext = formatChunksAsContext(icpRetrieval.chunks);

    // 2. Get relevant case studies for proof statement
    const caseStudyRetrieval = await askRetrieval(
      `${company_name} ${mergedInfo.industry || ''} case study similar company`,
      workspaceId,
      { chunkTypes: ['match_signal', 'insight_outcome', 'differentiator'], limit: 5 }
    );
    const caseStudyContext = formatChunksAsContext(caseStudyRetrieval.chunks);

    // 3. Build qualification prompt
    const qualificationPrompt = `You are scoring a prospect against ICP criteria.

## COMPANY TO SCORE
Name: ${company_name}
${mergedInfo.industry ? `Industry: ${mergedInfo.industry}` : ''}
${mergedInfo.company_size ? `Size: ${mergedInfo.company_size}` : ''}
${mergedInfo.location ? `Location: ${mergedInfo.location}` : ''}
${mergedInfo.description ? `Description: ${mergedInfo.description}` : ''}
${mergedInfo.web_content ? `\nWeb Research:\n${mergedInfo.web_content.substring(0, 2000)}` : ''}

## ICP CRITERIA
${icpContext || 'No ICP data available - use general B2B software/consulting fit criteria.'}

## RELEVANT CASE STUDIES
${caseStudyContext || 'No case studies available.'}

## TASK
Score this company 0-100 on ICP fit and generate a proof statement.

Return JSON:
{
  "score": <0-100>,
  "score_reason": "<2-3 sentences explaining the score>",
  "fit_signals": ["<positive signal 1>", "<positive signal 2>"],
  "concerns": ["<concern 1>", "<concern 2>"],
  "proof_statement": "<One compelling sentence connecting their needs to our capabilities, referencing a relevant case study if available>",
  "matched_case_study": "<case study name if relevant, or null>"
}

Score guidelines:
- 80-100: Strong ICP fit, clear pain points we solve
- 60-79: Good fit with some alignment
- 40-59: Moderate fit, worth exploring
- 20-39: Weak fit, proceed with caution
- 0-19: Poor fit, likely not a good prospect

Return ONLY valid JSON.`;

    // 4. Call LLM for qualification
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: qualificationPrompt }],
      temperature: 0.3,
      max_tokens: 600
    });

    const content = completion.choices[0].message.content.trim();

    // Parse response
    let result;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      result = JSON.parse(jsonMatch ? jsonMatch[1] : content);
    } catch (e) {
      console.error('[QUALIFY EXECUTOR] Parse error:', e);
      // Fallback result
      result = {
        score: 50,
        score_reason: 'Unable to fully qualify - insufficient data',
        fit_signals: [],
        concerns: ['Qualification data incomplete'],
        proof_statement: null,
        matched_case_study: null
      };
    }

    return {
      company_name,
      score: result.score,
      score_reason: result.score_reason,
      fit_signals: result.fit_signals || [],
      concerns: result.concerns || [],
      proof_statement: result.proof_statement,
      matched_case_study: result.matched_case_study,
      icp_chunks_used: icpRetrieval.chunks.length,
      case_study_chunks_used: caseStudyRetrieval.chunks.length,
      // Prospect data for CRM write step
      prospect_data: {
        score: result.score,
        score_reason: result.score_reason,
        proof_statement: result.proof_statement,
        matched_case_studies: result.matched_case_study ? [result.matched_case_study] : null,
        pain_points: result.fit_signals
      },
      // Scratchpad updates for orchestrator
      scratchpad_updates: {
        active_prospect: {
          company_name,
          status: 'qualified',
          data: {
            score: result.score,
            score_reason: result.score_reason,
            proof_statement: result.proof_statement
          }
        }
      }
    };

  } catch (error) {
    console.error('[QUALIFY EXECUTOR] Error:', error);
    throw new Error(`Qualification failed: ${error.message}`);
  }
}

/**
 * Batch qualify multiple prospects
 * @param {object} params - Batch parameters
 * @param {string[]} params.company_names - Companies to qualify
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<object>} Batch results
 */
export async function executeQualifyBatch(params, workspaceId) {
  const { company_names } = params;

  if (!company_names || company_names.length === 0) {
    throw new Error('Batch qualify requires company_names array');
  }

  const results = [];
  const errors = [];

  for (const company_name of company_names) {
    try {
      const result = await executeQualify({ company_name }, workspaceId);
      results.push(result);
    } catch (error) {
      errors.push({ company_name, error: error.message });
    }
  }

  return {
    results,
    errors,
    total_qualified: results.length,
    total_errors: errors.length
  };
}

export default {
  executeQualify,
  executeQualifyBatch
};

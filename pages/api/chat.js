/**
 * PROVER CHAT API - Orchestrated Architecture
 *
 * Flow:
 * 1. Router detects mode (ASK, BUILD, ENRICH, HYBRID)
 * 2. Planner generates execution plan
 * 3. Orchestrator executes plan steps via executors
 * 4. Synthesizer assembles final response
 *
 * This uses the Planner/Orchestrator/Executor pattern.
 * See lib/orchestrator/index.js for implementation details.
 */

import { orchestrate } from '../../lib/orchestrator/index.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      message,
      conversation_history = [],
      workspace_id,
      scratchpad = null
    } = req.body;

    // Validate required fields
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!workspace_id) {
      return res.status(400).json({ error: 'workspace_id is required' });
    }

    // Run orchestration
    const result = await orchestrate(
      message,
      workspace_id,
      conversation_history,
      scratchpad
    );

    // Return result
    return res.status(200).json({
      response: result.response,
      scratchpad: result.scratchpad,
      mode: result.mode,
      tools_used: result.tools_used || [],
      // Include debug info in development
      ...(process.env.NODE_ENV !== 'production' && { debug: result.debug })
    });

  } catch (error) {
    console.error('[CHAT API] Error:', error);
    return res.status(500).json({
      error: 'Failed to process request',
      details: error.message
    });
  }
}

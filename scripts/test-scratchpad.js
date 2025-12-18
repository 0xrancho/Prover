#!/usr/bin/env node
/**
 * Test scratchpad persistence across conversation turns
 * Including enrich -> add to CRM flow
 */

const BASE_URL = 'http://localhost:3000';
const WORKSPACE_ID = '71531422-e6e9-4c0a-84e3-50acde12148e';

async function chat(message, scratchpad = null, conversationHistory = []) {
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      workspace_id: WORKSPACE_ID,
      scratchpad,
      conversation_history: conversationHistory
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║              SCRATCHPAD PERSISTENCE TEST                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Accumulate conversation history across turns
  const history = [];

  // Turn 1: Ask about ICP
  console.log('=== TURN 1: ICP Question ===');
  const msg1 = 'Who is our ideal customer?';
  console.log(`→ "${msg1}"`);
  const r1 = await chat(msg1, null, history);
  console.log(`Mode: ${r1.mode}`);
  console.log(`Turn count: ${r1.scratchpad?.turn_count}`);
  console.log(`Response: "${r1.response?.substring(0, 100)}..."\n`);
  // Add to history
  history.push({ role: 'user', content: msg1 });
  history.push({ role: 'assistant', content: r1.response });

  // Turn 2: Enrich a company
  console.log('=== TURN 2: Enrich (with scratchpad + history) ===');
  const msg2 = 'Tell me about Stripe';
  console.log(`→ "${msg2}"`);
  const r2 = await chat(msg2, r1.scratchpad, history);
  console.log(`Mode: ${r2.mode}`);
  console.log(`Turn count: ${r2.scratchpad?.turn_count}`);
  console.log(`Tools used: ${r2.tools_used?.join(', ') || 'none'}`);
  console.log(`Response: "${r2.response?.substring(0, 100)}..."\n`);
  // Add to history
  history.push({ role: 'user', content: msg2 });
  history.push({ role: 'assistant', content: r2.response });

  // Turn 3: Ask if they fit ICP (context should include both ICP from turn 1 and Stripe from turn 2)
  console.log('=== TURN 3: Fit Check (with scratchpad + history) ===');
  const msg3 = 'Would they be a good fit based on our ICP?';
  console.log(`→ "${msg3}"`);
  const r3 = await chat(msg3, r2.scratchpad, history);
  console.log(`Mode: ${r3.mode}`);
  console.log(`Turn count: ${r3.scratchpad?.turn_count}`);
  console.log(`Response: "${r3.response?.substring(0, 100)}..."\n`);
  // Add to history
  history.push({ role: 'user', content: msg3 });
  history.push({ role: 'assistant', content: r3.response });

  // Turn 4: Add to CRM (should remember Stripe from context)
  console.log('=== TURN 4: Add to CRM (with scratchpad + history) ===');
  const msg4 = 'Add them as a prospect';
  console.log(`→ "${msg4}"`);
  const r4 = await chat(msg4, r3.scratchpad, history);
  console.log(`Mode: ${r4.mode}`);
  console.log(`Turn count: ${r4.scratchpad?.turn_count}`);
  console.log(`Tools used: ${r4.tools_used?.join(', ') || 'none'}`);
  console.log(`Response: "${r4.response?.substring(0, 100)}..."\n`);

  // Verify scratchpad state
  console.log('=== FINAL SCRATCHPAD STATE ===');
  console.log(`Workspace ID: ${r4.scratchpad?.workspace_id}`);
  console.log(`Turn count: ${r4.scratchpad?.turn_count}`);
  console.log(`Established ICP: ${r4.scratchpad?.established_icp ? 'Yes' : 'No'}`);
  console.log(`Active prospects: ${r4.scratchpad?.active_prospects?.length || 0}`);
  console.log(`Pending actions: ${r4.scratchpad?.pending_actions?.length || 0}`);
  console.log(`Last query: "${r4.scratchpad?.last_query?.message}"`);

  console.log('\n✅ Scratchpad persistence test complete');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

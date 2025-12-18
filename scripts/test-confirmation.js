#!/usr/bin/env node
/**
 * Test pending_actions confirmation flow
 *
 * Tests:
 * 1. Add prospect with pending confirmation
 * 2. Confirm the action
 * 3. Cancel flow
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
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json();
}

async function testConfirmationFlow() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║              PENDING ACTIONS CONFIRMATION TEST                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const history = [];

  // Test 1: Create a scratchpad with a pending action manually
  console.log('=== TEST 1: Manual Pending Action + Confirm ===');

  const scratchpadWithPending = {
    workspace_id: WORKSPACE_ID,
    turn_count: 1,
    established_icp: null,
    active_prospects: [],
    last_query: null,
    pending_actions: [{
      action: 'save_prospect',
      data: {
        company_name: 'TestCorp',
        contact_name: 'John Doe',
        contact_title: 'CEO',
        notes: 'Test pending action'
      },
      awaiting_confirmation: true
    }]
  };

  console.log('→ Sending "yes" with pending save_prospect action');
  const r1 = await chat('yes', scratchpadWithPending, history);
  console.log(`Response: "${r1.response}"`);
  console.log(`Mode: ${r1.mode}`);
  console.log(`Tools used: ${r1.tools_used?.join(', ') || 'none'}`);
  console.log(`Pending actions remaining: ${r1.scratchpad?.pending_actions?.length || 0}\n`);

  // Test 2: Cancel flow
  console.log('=== TEST 2: Manual Pending Action + Cancel ===');

  const scratchpadWithPending2 = {
    workspace_id: WORKSPACE_ID,
    turn_count: 1,
    established_icp: null,
    active_prospects: [],
    last_query: null,
    pending_actions: [{
      action: 'save_prospect',
      data: {
        company_name: 'CancelCorp',
        contact_name: 'Jane Doe',
        contact_title: 'CTO'
      },
      awaiting_confirmation: true
    }]
  };

  console.log('→ Sending "no, cancel that" with pending save_prospect action');
  const r2 = await chat('no, cancel that', scratchpadWithPending2, history);
  console.log(`Response: "${r2.response}"`);
  console.log(`Mode: ${r2.mode}`);
  console.log(`Pending actions remaining: ${r2.scratchpad?.pending_actions?.length || 0}\n`);

  // Test 3: enrich_prospect confirmation
  console.log('=== TEST 3: Enrich Prospect Confirmation ===');

  const scratchpadWithEnrich = {
    workspace_id: WORKSPACE_ID,
    turn_count: 1,
    established_icp: null,
    active_prospects: [],
    last_query: null,
    pending_actions: [{
      action: 'enrich_prospect',
      data: {
        company_name: 'Shopify'
      },
      awaiting_confirmation: true
    }]
  };

  console.log('→ Sending "go ahead" with pending enrich_prospect action');
  const r3 = await chat('go ahead', scratchpadWithEnrich, history);
  console.log(`Response: "${r3.response.substring(0, 150)}..."`);
  console.log(`Mode: ${r3.mode}`);
  console.log(`Tools used: ${r3.tools_used?.join(', ') || 'none'}`);
  console.log(`Pending actions remaining: ${r3.scratchpad?.pending_actions?.length || 0}\n`);

  // Test 4: Non-confirm message when pending (should continue normal flow)
  console.log('=== TEST 4: Non-Confirm Message with Pending Action ===');

  const scratchpadWithPending3 = {
    workspace_id: WORKSPACE_ID,
    turn_count: 1,
    established_icp: null,
    active_prospects: [],
    last_query: null,
    pending_actions: [{
      action: 'save_prospect',
      data: {
        company_name: 'AnotherCorp'
      },
      awaiting_confirmation: true
    }]
  };

  console.log('→ Sending "what is our ICP?" (not a confirmation)');
  const r4 = await chat('what is our ICP?', scratchpadWithPending3, history);
  console.log(`Response: "${r4.response.substring(0, 150)}..."`);
  console.log(`Mode: ${r4.mode}`);
  console.log(`Tools used: ${r4.tools_used?.join(', ') || 'none'}`);
  console.log(`Pending actions remaining: ${r4.scratchpad?.pending_actions?.length || 0}\n`);

  console.log('✅ Confirmation flow test complete');
}

testConfirmationFlow().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

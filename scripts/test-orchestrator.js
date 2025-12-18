#!/usr/bin/env node
/**
 * ORCHESTRATOR TEST SCRIPT
 *
 * Tests the orchestrator with various query types.
 * Run with: node scripts/test-orchestrator.js
 *
 * Requires:
 * - OPENAI_API_KEY in environment
 * - NEXT_PUBLIC_SUPABASE_URL in environment
 * - SUPABASE_SERVICE_ROLE_KEY in environment
 * - A valid workspace_id
 */

import 'dotenv/config';
import { orchestrate } from '../lib/orchestrator/index.js';
import { detectMode, detectBuildSubtype, detectAskChunkTypes } from '../lib/orchestrator/router.js';

// =============================================
// TEST CONFIGURATION
// =============================================

// Replace with a real workspace ID from your database
const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID || 'test-workspace-id';

const TEST_CASES = [
  {
    name: 'ASK - Pain points question',
    message: 'What pain points do medical device companies typically have?',
    expectedMode: 'ask'
  },
  {
    name: 'ASK - ICP question',
    message: 'Who is our ideal customer?',
    expectedMode: 'ask'
  },
  {
    name: 'ASK - Case study question',
    message: 'Show me proof points from our healthcare case studies',
    expectedMode: 'ask'
  },
  {
    name: 'BUILD - Create lead',
    message: 'Just met with Sarah Chen, CTO at TechFlow about their scaling challenges',
    expectedMode: 'build'
  },
  {
    name: 'BUILD - Find similar',
    message: 'Find me companies similar to our MedTech clients',
    expectedMode: 'build'
  },
  {
    name: 'ENRICH - Company research',
    message: 'Tell me about Acme Corporation',
    expectedMode: 'enrich'
  },
  {
    name: 'ENRICH - Explicit enrich',
    message: 'Enrich the prospect Globex Inc with company details',
    expectedMode: 'enrich'
  }
];

// =============================================
// TEST RUNNER
// =============================================

async function runRouterTests() {
  console.log('\n' + '='.repeat(70));
  console.log('ROUTER TESTS - Mode Detection');
  console.log('='.repeat(70) + '\n');

  let passed = 0;
  let failed = 0;

  for (const test of TEST_CASES) {
    const mode = detectMode(test.message);
    const subtype = mode === 'build' ? detectBuildSubtype(test.message) : null;
    const chunkTypes = mode === 'ask' ? detectAskChunkTypes(test.message) : null;

    const status = mode === test.expectedMode ? '✓' : '✗';
    const color = mode === test.expectedMode ? '\x1b[32m' : '\x1b[31m';

    console.log(`${color}${status}\x1b[0m ${test.name}`);
    console.log(`  Message: "${test.message.substring(0, 50)}..."`);
    console.log(`  Expected: ${test.expectedMode} | Got: ${mode}${subtype ? ` (${subtype})` : ''}`);
    if (chunkTypes) console.log(`  Chunk types: ${chunkTypes.join(', ')}`);
    console.log();

    if (mode === test.expectedMode) passed++;
    else failed++;
  }

  console.log('='.repeat(70));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(70) + '\n');

  return failed === 0;
}

async function runOrchestratorTest(testCase) {
  console.log('\n' + '='.repeat(70));
  console.log(`ORCHESTRATOR TEST: ${testCase.name}`);
  console.log('='.repeat(70));

  try {
    const result = await orchestrate(
      testCase.message,
      TEST_WORKSPACE_ID,
      [], // No conversation history
      null // Fresh scratchpad
    );

    console.log('\n--- RESULT ---');
    console.log('Mode:', result.mode);
    console.log('Tools used:', result.tools_used?.join(', ') || 'none');
    console.log('Response preview:', result.response?.substring(0, 200) + '...');

    if (result.debug) {
      console.log('\n--- TIMING ---');
      Object.entries(result.debug.timings || {}).forEach(([key, val]) => {
        console.log(`  ${key}: ${val}ms`);
      });
    }

    return { success: true, result };

  } catch (error) {
    console.error('\n--- ERROR ---');
    console.error(error.message);
    return { success: false, error };
  }
}

async function runFullTest() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║           PROVER ORCHESTRATOR TEST SUITE                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  // Check environment
  console.log('\n--- Environment Check ---');
  const envVars = ['OPENAI_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  let envOk = true;

  for (const v of envVars) {
    const status = process.env[v] ? '✓' : '✗';
    const color = process.env[v] ? '\x1b[32m' : '\x1b[31m';
    console.log(`${color}${status}\x1b[0m ${v}: ${process.env[v] ? 'set' : 'MISSING'}`);
    if (!process.env[v]) envOk = false;
  }

  console.log(`Workspace ID: ${TEST_WORKSPACE_ID}`);

  if (!envOk) {
    console.error('\n\x1b[31mMissing required environment variables. Aborting.\x1b[0m\n');
    process.exit(1);
  }

  // Run router tests
  const routerOk = await runRouterTests();

  // Ask user to continue with full orchestrator test
  if (process.argv.includes('--router-only')) {
    console.log('Router-only mode. Skipping orchestrator tests.');
    process.exit(routerOk ? 0 : 1);
  }

  // Run one orchestrator test
  const testIndex = parseInt(process.argv[2]) || 0;
  const selectedTest = TEST_CASES[testIndex];

  if (!selectedTest) {
    console.log('\nAvailable tests:');
    TEST_CASES.forEach((t, i) => console.log(`  ${i}: ${t.name}`));
    console.log('\nUsage: node scripts/test-orchestrator.js [test-index]');
    console.log('       node scripts/test-orchestrator.js --router-only');
    process.exit(0);
  }

  console.log(`\nRunning orchestrator test ${testIndex}: ${selectedTest.name}`);
  const result = await runOrchestratorTest(selectedTest);

  console.log('\n' + '='.repeat(70));
  console.log(result.success ? '\x1b[32mTEST PASSED\x1b[0m' : '\x1b[31mTEST FAILED\x1b[0m');
  console.log('='.repeat(70) + '\n');

  process.exit(result.success ? 0 : 1);
}

// Run tests
runFullTest().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});

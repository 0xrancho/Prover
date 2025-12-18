#!/usr/bin/env node
/**
 * ROUTER TEST SCRIPT
 *
 * Tests just the router logic without requiring API keys.
 * Run with: node scripts/test-router.js
 */

import { detectMode, detectBuildSubtype, detectAskChunkTypes } from '../lib/orchestrator/router.js';

// =============================================
// TEST CASES
// =============================================

const TEST_CASES = [
  // ASK mode tests
  { message: 'What pain points do medical device companies typically have?', expectedMode: 'ask' },
  { message: 'Who is our ideal customer?', expectedMode: 'ask' },
  { message: 'Show me proof points from our healthcare case studies', expectedMode: 'ask' },
  { message: 'What problems does the healthcare industry face?', expectedMode: 'ask' },
  { message: 'How did we help similar clients?', expectedMode: 'ask' },

  // BUILD mode tests
  { message: 'Just met with Sarah Chen, CTO at TechFlow', expectedMode: 'build' },
  { message: 'Add Acme Corp to my prospects', expectedMode: 'build' },
  { message: 'Create a new lead for GlobalTech', expectedMode: 'build' },
  { message: 'Find me companies similar to our MedTech clients', expectedMode: 'build' },
  { message: 'Build a list of healthcare prospects', expectedMode: 'build' },
  { message: 'Save this company to CRM', expectedMode: 'build' },
  { message: 'I talked to the VP of Engineering at StartupCo', expectedMode: 'build' },

  // ENRICH mode tests
  { message: 'Tell me about Acme Corporation', expectedMode: 'enrich' },
  { message: 'Enrich the prospect Globex Inc', expectedMode: 'enrich' },
  { message: 'Research this company for me', expectedMode: 'enrich' },
  { message: 'Look up company details for TechCorp', expectedMode: 'enrich' },
  { message: 'Get company details on MegaCorp', expectedMode: 'enrich' },
];

// =============================================
// RUN TESTS
// =============================================

console.log('\n' + '═'.repeat(70));
console.log('  ROUTER TEST SUITE');
console.log('═'.repeat(70) + '\n');

let passed = 0;
let failed = 0;

for (const test of TEST_CASES) {
  const mode = detectMode(test.message);
  const ok = mode === test.expectedMode;

  const icon = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  const modeColor = ok ? '\x1b[32m' : '\x1b[31m';

  console.log(`${icon} ${test.expectedMode.toUpperCase().padEnd(7)} → ${modeColor}${mode.toUpperCase().padEnd(7)}\x1b[0m "${test.message.substring(0, 50)}${test.message.length > 50 ? '...' : ''}"`);

  // Show additional info for BUILD mode
  if (mode === 'build') {
    const subtype = detectBuildSubtype(test.message);
    console.log(`  \x1b[2m└─ subtype: ${subtype}\x1b[0m`);
  }

  // Show additional info for ASK mode
  if (mode === 'ask') {
    const chunks = detectAskChunkTypes(test.message);
    if (chunks) {
      console.log(`  \x1b[2m└─ chunk hints: ${chunks.join(', ')}\x1b[0m`);
    }
  }

  if (ok) passed++;
  else failed++;
}

console.log('\n' + '─'.repeat(70));
console.log(`  Results: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`);
console.log('─'.repeat(70) + '\n');

process.exit(failed > 0 ? 1 : 0);

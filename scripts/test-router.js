#!/usr/bin/env node
/**
 * ROUTER TEST SCRIPT
 *
 * Tests confirmation/cancellation detection.
 * Mode detection has been removed - planner decides tools directly.
 *
 * Run with: node scripts/test-router.js
 */

import { isConfirmation, isCancellation } from '../lib/orchestrator/router.js';

// =============================================
// TEST CASES
// =============================================

const CONFIRM_TESTS = [
  { message: 'yes', expected: true },
  { message: 'y', expected: true },
  { message: 'ok', expected: true },
  { message: 'sure', expected: true },
  { message: 'looks good', expected: true },
  { message: 'Yes, do it', expected: true },
  { message: 'no', expected: false },
  { message: 'What pain points?', expected: false },
];

const CANCEL_TESTS = [
  { message: 'no', expected: true },
  { message: 'cancel', expected: true },
  { message: 'nevermind', expected: true },
  { message: "don't do that", expected: true },
  { message: 'yes', expected: false },
  { message: 'Add this lead', expected: false },
];

// =============================================
// RUN TESTS
// =============================================

console.log('\n' + '═'.repeat(70));
console.log('  ROUTER TEST SUITE (Confirmation Detection Only)');
console.log('  Note: Mode detection removed - planner reasons directly');
console.log('═'.repeat(70) + '\n');

let passed = 0;
let failed = 0;

console.log('CONFIRMATION TESTS:');
for (const test of CONFIRM_TESTS) {
  const result = isConfirmation(test.message);
  const ok = result === test.expected;
  const icon = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`${icon} "${test.message}" → ${result} (expected: ${test.expected})`);
  if (ok) passed++; else failed++;
}

console.log('\nCANCELLATION TESTS:');
for (const test of CANCEL_TESTS) {
  const result = isCancellation(test.message);
  const ok = result === test.expected;
  const icon = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`${icon} "${test.message}" → ${result} (expected: ${test.expected})`);
  if (ok) passed++; else failed++;
}

console.log('\n' + '─'.repeat(70));
console.log(`  Results: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`);
console.log('─'.repeat(70) + '\n');

process.exit(failed > 0 ? 1 : 0);

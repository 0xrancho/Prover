#!/usr/bin/env node
/**
 * SEED TEST DATA SCRIPT
 *
 * Creates a test workspace and ingests ICP + Case Study data.
 * Run with: node scripts/seed-test-data.js
 *
 * Requires:
 * - OPENAI_API_KEY in environment (for embeddings)
 * - SUPABASE credentials in environment
 * - Dev server running on localhost:3000
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Create Supabase admin client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function createWorkspace() {
  console.log('\n📦 Creating test workspace...');

  // Insert directly via Supabase admin client (bypasses RLS)
  // We'll set user_id to null or use a special test approach

  // First check if there's an existing workspace we can use
  const { data: existingWorkspaces } = await supabase
    .from('prover_workspaces')
    .select('id, name')
    .limit(1);

  if (existingWorkspaces && existingWorkspaces.length > 0) {
    console.log(`✓ Found existing workspace: ${existingWorkspaces[0].name} (${existingWorkspaces[0].id})`);
    return existingWorkspaces[0].id;
  }

  // Check if there's an existing user we can use
  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1 });

  if (!users || users.users.length === 0) {
    console.log('  No existing users found. Creating test user...');

    // Create a test user
    const { data: newUser, error: userError } = await supabase.auth.admin.createUser({
      email: 'test@arthurandarchie.com',
      password: 'testpassword123',
      email_confirm: true
    });

    if (userError) {
      // User might already exist, try to find them
      const { data: existingUsers } = await supabase.auth.admin.listUsers({ perPage: 10 });
      const testUser = existingUsers?.users?.find(u => u.email === 'test@arthurandarchie.com');
      if (testUser) {
        console.log(`  Found existing test user: ${testUser.id}`);
        users.users = [testUser];
      } else {
        throw new Error(`Failed to create test user: ${userError.message}`);
      }
    } else {
      users.users = [newUser.user];
      console.log(`  Created test user: ${newUser.user.id}`);
    }
  }

  const userId = users.users[0].id;
  console.log(`  Using user ID: ${userId}`);

  // Create workspace
  const { data: workspace, error: wsError } = await supabase
    .from('prover_workspaces')
    .insert({
      user_id: userId,
      name: 'Arthur & Archie Test Workspace',
      website_url: 'https://arthurandarchie.com'
    })
    .select()
    .single();

  if (wsError) {
    throw new Error(`Failed to create workspace: ${wsError.message}`);
  }

  console.log(`✓ Created workspace: ${workspace.id}`);
  return workspace.id;
}

async function ingestICP(workspaceId) {
  console.log('\n📄 Ingesting ICP data...');

  const icpPath = path.join(__dirname, '..', 'TEST_ICP');
  const icpContent = fs.readFileSync(icpPath, 'utf-8');

  const response = await fetch(`${BASE_URL}/api/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspace_id: workspaceId,
      doc_type: 'icp',
      content: icpContent,
      format: 'text',
      replace_existing: true
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to ingest ICP: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  console.log(`✓ Ingested ICP: ${data.chunks_created} chunks`);
  console.log(`  Chunk types:`, data.chunk_types);
  return data;
}

async function ingestCaseStudies(workspaceId) {
  console.log('\n📄 Ingesting Case Study data...');

  const csPath = path.join(__dirname, '..', 'TEST_Case Studies.txt');
  const csContent = fs.readFileSync(csPath, 'utf-8');

  const response = await fetch(`${BASE_URL}/api/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspace_id: workspaceId,
      doc_type: 'case_study',
      content: csContent,
      format: 'text',
      replace_existing: true
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to ingest case studies: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  console.log(`✓ Ingested Case Studies: ${data.chunks_created} chunks`);
  console.log(`  Doc IDs:`, data.doc_ids);
  console.log(`  Chunk types:`, data.chunk_types);
  return data;
}

async function testChat(workspaceId) {
  console.log('\n🧪 Testing chat endpoint...');

  const testMessages = [
    "Who is our ideal customer?",
    "Tell me about our case studies",
    "What pain points do our clients typically have?"
  ];

  for (const message of testMessages) {
    console.log(`\n  → "${message}"`);

    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        workspace_id: workspaceId
      })
    });

    if (!response.ok) {
      console.log(`  ✗ Failed: ${response.status}`);
      continue;
    }

    const data = await response.json();
    console.log(`  ✓ Mode: ${data.mode} | Tools: ${data.tools_used.join(', ') || 'none'}`);
    console.log(`  ← "${data.response.substring(0, 150)}..."`);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║              PROVER TEST DATA SEEDING SCRIPT                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  // Check environment
  console.log('\n📋 Environment check:');
  const envVars = ['OPENAI_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  let envOk = true;

  for (const v of envVars) {
    const status = process.env[v] ? '✓' : '✗';
    console.log(`  ${status} ${v}: ${process.env[v] ? 'set' : 'MISSING'}`);
    if (!process.env[v]) envOk = false;
  }

  if (!envOk) {
    console.error('\n❌ Missing required environment variables. Aborting.');
    process.exit(1);
  }

  try {
    // Step 1: Create workspace
    const workspaceId = await createWorkspace();

    // Step 2: Ingest ICP
    await ingestICP(workspaceId);

    // Step 3: Ingest Case Studies
    await ingestCaseStudies(workspaceId);

    // Step 4: Test chat
    await testChat(workspaceId);

    console.log('\n' + '═'.repeat(70));
    console.log('✅ SEEDING COMPLETE');
    console.log(`   Workspace ID: ${workspaceId}`);
    console.log('   Use this ID for testing the orchestrator.');
    console.log('═'.repeat(70) + '\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();

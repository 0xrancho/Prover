# Prover Orchestrator Implementation Progress

**Last Updated:** 2025-12-15 (Phase 3 Migration Complete)

## Overview

Implementing a Planner/Orchestrator/Executor pattern for the Prover sales enablement platform. The goal is proper orchestration where:
- **Planner** (LLM) generates JSON execution plans
- **Orchestrator** (code) validates and executes plans step by step
- **Executors** perform single-purpose operations (RAG search, web search, CRM ops, etc.)
- **Synthesizer** (LLM) assembles final response

Key principle: "Planner never executes. Executor never plans. Your code orchestrates."

---

## Completed Work

### Phase 0: Cleanup (Airtable to Supabase Migration)
- [x] Migrated `pages/api/build.js` from Airtable to Supabase
- [x] Migrated `pages/api/enrich.js` from Airtable to Supabase
- [x] Deleted `lib/airtable.js`

### Phase 1: Orchestrator Infrastructure
- [x] Created `lib/orchestrator/validators.js` - Zod schemas for plan validation
- [x] Created `lib/orchestrator/scratchpad.js` - Working memory management
- [x] Created `lib/orchestrator/router.js` - Lightweight mode detection (ASK/BUILD/ENRICH)
- [x] Created `lib/orchestrator/index.js` - Main orchestration loop with comprehensive logging
- [x] Created `lib/prompts/planner.js` - Planner system prompts with few-shot examples

### Phase 2: Executors
- [x] Created `lib/executors/rag.js` - Wraps retrieval.js for pgvector search
- [x] Created `lib/executors/web.js` - Wraps Firecrawl for web search/scrape
- [x] Created `lib/executors/crm.js` - Wraps prospects.js for Supabase CRM operations
- [x] Created `lib/executors/qualify.js` - ICP scoring via LLM
- [x] Created `lib/executors/index.js` - Central exports for all executors
- [x] Created `pages/api/orchestrated-chat.js` - New test endpoint using orchestrator

### Testing Infrastructure
- [x] Created `scripts/test-router.js` - Router unit tests (no API keys needed)
- [x] Created `scripts/test-orchestrator.js` - Full orchestrator tests (requires API keys)
- [x] Added structured logging to orchestrator with colored output and timing

---

## Test Results

### Router Tests: 17/17 PASSING

```
node scripts/test-router.js
```

All mode detection tests pass:
- ASK mode: 5/5 (pain points, ICP questions, proof points, etc.)
- BUILD mode: 7/7 (create lead, add prospect, lookalike, etc.)
- ENRICH mode: 5/5 (tell me about, research, company details, etc.)

### E2E Orchestration Tests

Tested via curl against `pages/api/orchestrated-chat.js`:

| Mode | Router | Planner | Executor | Synthesizer | Status |
|------|--------|---------|----------|-------------|--------|
| **ASK** | ✓ detected | ✓ 1 step (rag_search) | ✗ (invalid workspace) | ✓ fallback | Working |
| **BUILD** | ✓ detected (create-lead) | ✓ 1 step (crm_write) | ✗ (FK constraint) | ✓ fallback | Working |
| **ENRICH** | ✓ detected | ✓ 4 steps | 3/4 success | ✓ comprehensive | Working |

**Note:** Executor failures are expected - we used fake workspace UUIDs. With a real workspace, all operations would succeed.

#### ENRICH Flow Detail (most complex test)
1. `web_search` - ✓ Found 10 results about Stripe (1181ms)
2. `rag_search` - ✓ Returned 0 chunks (empty test workspace) (1644ms)
3. `qualify` - ✓ Generated score 50/100 with proof statement (10109ms)
4. `crm_write` - ✗ FK constraint (expected - fake workspace UUID)

### Sample Console Output

```
======================================================================
[ORCHESTRATOR] [START] New orchestration request
======================================================================
[ORCHESTRATOR] [INIT] Validating scratchpad...
✓ [INIT] Scratchpad ready (turn 0)
⏱ [INIT] 1ms
[ORCHESTRATOR] [ROUTER] Analyzing message: "Tell me about Stripe..."
✓ [ROUTER] Mode: ENRICH
⏱ [ROUTER] 0ms
[ORCHESTRATOR] [PLANNER] Generating execution plan...
✓ [PLANNER] Plan generated: 4 step(s)
[PLANNER] Reasoning: User wants to enrich the information about Stripe...
[PLANNER]   Step 1: web_search - Get company information from web
[PLANNER]   Step 2: rag_search - Find relevant case studies for proof statement
[PLANNER]   Step 3: qualify - Score against ICP and generate proof statement
[PLANNER]   Step 4: crm_write - Save enrichment data to CRM
⏱ [PLANNER] 9736ms
[ORCHESTRATOR] [EXECUTOR] Beginning plan execution...
✓ [STEP] [1] web_search completed: 10 search results
✓ [STEP] [2] rag_search completed: 0 chunks found
✓ [STEP] [3] qualify completed: score: 50/100
✗ [STEP] [4] crm_write failed: FK constraint
✗ [EXECUTOR] 3/4 steps succeeded
⏱ [EXECUTOR] 13320ms
[ORCHESTRATOR] [SYNTHESIZER] Generating final response...
✓ [SYNTHESIZER] Response generated (1062 chars)
⏱ [SYNTHESIZER] 20225ms
======================================================================
✓ [COMPLETE] Total orchestration time
⏱ [TOTAL] 43283ms
[COMPLETE] Tools used: web_search, rag_search, qualify, crm_write
======================================================================
```

---

## File Structure

```
lib/
├── orchestrator/
│   ├── index.js        # Main orchestration loop
│   ├── router.js       # Lightweight mode detection
│   ├── scratchpad.js   # Working memory management
│   └── validators.js   # Zod schemas for plans
├── executors/
│   ├── index.js        # Central exports
│   ├── rag.js          # RAG/vector search executor
│   ├── web.js          # Web search/scrape executor
│   ├── crm.js          # CRM read/write executor
│   └── qualify.js      # ICP qualification executor
├── prompts/
│   └── planner.js      # Planner system prompts
pages/api/
├── orchestrated-chat.js  # NEW: Test endpoint for orchestrator
├── chat.js               # OLD: Direct mode handling (to be deprecated)
├── ask.js                # OLD: Separate endpoint (to be deprecated)
├── build.js              # OLD: Separate endpoint (migrated to Supabase)
├── enrich.js             # OLD: Separate endpoint (migrated to Supabase)
scripts/
├── test-router.js        # Router unit tests
└── test-orchestrator.js  # Full orchestrator tests
```

---

## Next Steps

### Phase 3: Migration
- [x] Update `pages/api/chat.js` to use orchestrator instead of direct mode handling
- [x] Test with real workspace ID and real data
- [x] Verify scratchpad persistence across conversation turns
- [x] Fixed conversation history passing to planner (per spec: "Pass last 4-6 messages raw")
- [x] Increased reasoning field limit from 200 to 500 chars for context-aware plans

### Phase 4: Deprecation (COMPLETE)
- [x] Remove separate `ask.js`, `build.js`, `enrich.js` endpoints
- [x] Remove `orchestrated-chat.js` test endpoint (chat.js now uses orchestrator)
- [x] Clean up any remaining Airtable references
- [x] Removed `airtable` package from dependencies
- [x] Removed `test-airtable.js` and `backups/` directory
- [x] Update frontend to use new response format
  - Fixed `handleSaveList` to use `/api/chat` instead of deleted `/api/build`
  - Fixed `handleEnrichFromPreview` to use `/api/chat` instead of deleted `/api/enrich`

### Testing To-Do
- [x] Test with a real workspace UUID from the database
- [x] Test multi-turn conversation (scratchpad persistence)
- [x] Test HYBRID mode (multiple intents in one message)
  - Tested: "Research Stripe and add them as a prospect if they fit our ICP" → web_search + qualify + crm_write
  - Tested: "What pain points do tech companies have and can you add Acme Corp" → rag_search + crm_write
  - Planner correctly combines multiple intents into single execution plan
- [x] Test confirmation flows (pending_actions in scratchpad)
  - Test 1: Confirm save_prospect with "yes" → ✅ Saved to CRM
  - Test 2: Cancel with "no, cancel that" → ✅ Cancelled correctly
  - Test 3: Confirm enrich_prospect with "go ahead" → ✅ Enriched with web_search + qualify + crm_write
  - Test 4: Non-confirm message preserves pending_actions → ✅ ICP question answered, action preserved
- [ ] Load test for performance benchmarking

### Known Issues
- OpenAI client initializes at import time in `lib/embeddings.js`, causing test script failures when `dotenv` hasn't loaded yet
- Web scrape executor (`web_scrape`) is implemented but not yet tested
- `external.js` executor (for Apollo/etc enrichment) is placeholder - TBD on data source

---

## Key Design Decisions

1. **Lightweight Router**: Uses simple keyword matching for mode hints. Complex intent detection is the Planner's job (LLM).

2. **Planner Generates JSON**: The planner outputs structured JSON with reasoning, mode, steps, and scratchpad_updates. Validated via Zod.

3. **Sequential Execution**: Steps execute in order. Each step's results are available to subsequent steps and the synthesizer.

4. **Graceful Degradation**: If executors fail, the synthesizer still generates a response using whatever data was collected.

5. **Scratchpad**: Maintains working memory across turns - ICP context, active prospects, pending actions, etc.

---

## How to Test

### Router Only (no API keys needed)
```bash
node scripts/test-router.js
```

### Full Orchestrator (requires .env.local)
```bash
npm run dev
# In another terminal:
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Tell me about Stripe",
    "workspace_id": "71531422-e6e9-4c0a-84e3-50acde12148e"
  }'
```

### Multi-turn Conversation Test
```bash
node scripts/test-scratchpad.js
```

---

## Reference

- **REFACTOR_PLAN_V2.md**: Full architectural plan
- **supabase/schema-v2.sql**: Database schema with workspaces, chunks, prospects

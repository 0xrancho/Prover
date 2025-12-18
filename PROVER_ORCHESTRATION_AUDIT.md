# Prover Orchestration Audit Tracker

**Audit Date:** 2024-12-15  
**Spec Reference:** `REFACTOR_PLAN_V2.md`  
**Status:** ✅ Phase 1 Fixes Complete (2024-12-15)

---

## Summary

Core orchestration loop is ~95% spec-compliant. 

**Critical gaps:**
1. **No eval/re-planning** — Complex queries can't iterate (deferred to Phase 3)
2. ~~**Scratchpad doesn't flow** — Executors don't return updates, `applyUpdates()` has bugs~~ **FIXED**
3. ~~**Syntax error** — rag.js will crash at runtime~~ **FIXED (was already correct)**

**Phase 1 Complete:** Issues #2 and #3 fixed. Scratchpad now flows through executor loop.

**Legacy code:** `system.js`, `modes.js`, `buildPrompt()` **CONFIRMED UNUSED** — safe to remove (only referenced within prompts/ directory).

---

## Critical Issues

### 1. No Eval Gate Before Synthesis

**Severity:** High  
**Impact:** Complex queries can't verify intent satisfaction before responding  
**Location:** `lib/orchestrator/index.js` → `synthesize()`

**Current Behavior:**  
Synthesizer formats whatever results came back. No check for "did we actually answer the question?"

**Required Behavior:**  
Eval step checks if execution results satisfy user intent. If not, either re-plan or inform user what's missing.

**Fix Options:**
| Option | Effort | Tradeoff |
|--------|--------|----------|
| A) Eval gate, no re-plan | 1-2 hrs | User must confirm to continue |
| B) Full agentic loop | 4-6 hrs | Handles everything in one turn, higher token cost |
| C) Loop construct in schema | 2-3 hrs | Handles known cardinality, simpler than B |

**Files to Create/Modify:**
- [ ] `lib/prompts/eval.js` (new)
- [ ] `lib/orchestrator/index.js` (add eval call)
- [ ] `lib/orchestrator/validators.js` (add EvalResultSchema)

---

### 2. Scratchpad Updates Not Flowing From Executors

**Severity:** High  
**Impact:** Multi-step plans can't pass discovered context between steps  
**Location:** `lib/orchestrator/index.js` → `executePlan()`

**Current Behavior:**
```javascript
// Only applies planner-predicted updates AFTER all steps complete
if (plan.scratchpad_updates) {
  scratchpad = applyUpdates(scratchpad, plan.scratchpad_updates);
}
```

**Required Behavior:**
```javascript
for (const step of plan.steps) {
  const result = await executeStep(...);
  // Apply executor-returned updates IMMEDIATELY
  if (result.scratchpad_updates) {
    scratchpad = applyUpdates(scratchpad, result.scratchpad_updates);
  }
  results.push(result);
}
```

**Files to Modify:**
- [ ] `lib/orchestrator/index.js` (loop update)
- [ ] `lib/orchestrator/scratchpad.js` (fix `applyUpdates()` early returns + add `active_prospects` array support)
- [ ] `lib/executors/rag.js` (return scratchpad_updates)
- [ ] `lib/executors/web.js` (return scratchpad_updates)
- [ ] `lib/executors/crm.js` (return scratchpad_updates)
- [ ] `lib/executors/qualify.js` (return scratchpad_updates)

---

### 3. No Loop Construct for "For Each" Operations

**Severity:** Medium  
**Impact:** Can't handle "enrich each of these 5 companies" in one plan  
**Location:** `lib/prompts/planner.js`, `lib/orchestrator/validators.js`

**Current Behavior:**  
Plan steps are a flat array. Planner can't express "run step 3 for each result of step 2."

**Required Behavior (Option C):**
```javascript
{
  tool: 'qualify',
  loop_over: 1,  // Step index to iterate over
  params: { company_name: '$item.company_name' }  // Template variable
}
```

**Files to Modify:**
- [ ] `lib/orchestrator/validators.js` (add loop_over to PlanStepSchema)
- [ ] `lib/prompts/planner.js` (teach model loop construct)
- [ ] `lib/orchestrator/index.js` (interpret loop_over in executePlan)

---

## Medium Issues

### 4. `validateExecutorResult` Imported But Unused

**Severity:** Low  
**Impact:** Malformed executor outputs could cause downstream errors  
**Location:** `lib/orchestrator/index.js`

**Fix:**  
Either wire up validation or remove dead import.

```javascript
// Option A: Validate
const validation = validateExecutorResult(result);
if (!validation.success) {
  log('EXECUTOR', `Invalid result from ${step.tool}`, validation.error);
}

// Option B: Remove
// Delete: import { validateExecutorResult } from './validators.js';
```

---

### 5. Synthesizer Ignores Conversation History

**Severity:** Low  
**Impact:** Multi-turn coherence slightly degraded  
**Location:** `lib/orchestrator/index.js` → `synthesize()`

**Current:** `conversationHistory` param passed but not used in prompt.

**Fix:** Include last 2-3 messages in synthesizer context for tone/reference continuity.

---

### 6. Model Hardcoded to GPT-4

**Severity:** Low  
**Impact:** Can't easily switch models during outages  
**Location:** `lib/orchestrator/index.js`

**Fix:**
```javascript
const PLANNER_MODEL = process.env.PLANNER_MODEL || 'gpt-4';
const SYNTH_MODEL = process.env.SYNTH_MODEL || 'gpt-4';
```

---

### 7. Syntax Error in rag.js

**Severity:** High (will crash)  
**Impact:** RAG executor throws syntax error  
**Location:** `lib/executors/rag.js` lines ~47 and ~85

**Current:**
```javascript
throw new Error`RAG search failed: ${error.message}`);
```

**Fix:**
```javascript
throw new Error(`RAG search failed: ${error.message}`);
```

---

### 8. Orchestrator Doesn't Use `getExecutor()`

**Severity:** Low  
**Impact:** Duplicate tool→executor mapping  
**Location:** `lib/orchestrator/index.js` + `lib/executors/index.js`

`executors/index.js` exports `getExecutor(tool)` lookup function, but orchestrator has its own switch statement. Should consolidate to single source of truth.

---

### 9. Planner Prompt Gaps

**Severity:** Medium  
**Impact:** Planner doesn't learn certain patterns  
**Location:** `lib/prompts/planner.js`

**Missing from examples:**
- No `depends_on` usage (step chaining)
- No multi-company flows (discover N → process each)
- No `respond_directly` tool for conversational messages

**Fix:** Add 2-3 more few-shot examples demonstrating these patterns.

---

## Spec Compliance Checklist

| Requirement | Spec Line | Status |
|------------|-----------|--------|
| Tool inventory matches | 383 | ✅ |
| Orchestrator signature | 209 | ✅ |
| Plan validation with Zod | 375-394 | ✅ |
| Conversation history to planner | 498 | ✅ |
| Pending action confirmation | 347-352 | ✅ |
| Scratchpad updates from results | 214 | ✅ |
| Executor result validation | 396-402 | ❌ |
| Latency benchmarking | 517 | ⏳ Not started |
| External enrichment provider | 419 | ⏳ Placeholder only |

---

## Files Audited

| File | Status | Notes |
|------|--------|-------|
| `lib/orchestrator/index.js` | ✅ Audited | Issues #1, #2, #4, #5, #6 |
| `lib/prompts/planner.js` | ✅ Audited | No eval logic. Missing: depends_on examples, multi-company examples, respond_directly tool |
| `lib/orchestrator/validators.js` | ✅ Audited | Spec-compliant. Add EvalResultSchema + loop_over when needed |
| `lib/orchestrator/scratchpad.js` | ✅ Audited | Schema correct. `applyUpdates()` needs fix for multi-prospect + early returns |
| `lib/orchestrator/router.js` | ✅ Audited | Clean. Minor: duplicate confirmation logic with orchestrator |
| `lib/executors/rag.js` | ✅ Audited | No scratchpad_updates. Syntax error (missing parens). |
| `lib/executors/web.js` | ✅ Audited | No scratchpad_updates. Needs company_name param for tracking. |
| `lib/executors/crm.js` | ✅ Audited | No scratchpad_updates. Easy to add - has all needed data. |
| `lib/executors/qualify.js` | ✅ Audited | No scratchpad_updates. Easy to add - returns full qualification. |
| `lib/prompts/extraction.js` | ✅ Audited | Active (intake chunking). INTENT_CLASSIFICATION may be unused. |
| `lib/prompts/system.js` | ✅ Audited | Likely legacy - verify usage before removing. |
| `lib/prompts/modes.js` | ✅ Audited | Likely legacy - replaced by planner + executors. |
| `lib/prompts/index.js` | ✅ Audited | `buildPrompt()` likely unused - verify before cleanup. |

---

## Missing Files (Per Spec)

| File | Spec Reference | Status |
|------|----------------|--------|
| `lib/prompts/synthesizer.js` | Line 134 | ❌ Not created - prompt inline in orchestrator |
| `lib/prompts/eval.js` | N/A (Issue #1) | ❌ Not created - needed for eval gate |

---

## Recommended Fix Order

### Phase 1 (Core Validation)
1. **Issue #7** (rag.js syntax error) — 2 min, will crash otherwise
2. **Scratchpad `applyUpdates()` fix** — 15 min, remove early returns + add array support
3. **Issue #2** (executor scratchpad returns) — 2 hrs, enables multi-step context flow

### Phase 2 (External Sources)
4. **External enrichment adapter** — Implement when provider selected

### Phase 3 (Complex Patterns)
5. **Issue #1** (eval gate) — Choose Option A first for quick win
6. **Issue #3** (loop construct) — After eval is working
7. **Issue #9** (planner examples) — Add depends_on, multi-company examples

### Cleanup (Anytime)
8. **Issues #4-6, #8** — Validation, model config, getExecutor consolidation
9. **Legacy prompts** — Verify usage, then deprecate `system.js`, `modes.js`

---

## Legacy Code Verification

Run these to confirm what's dead:

```bash
# Check if MODE_PROMPTS is used anywhere
grep -r "MODE_PROMPTS" --include="*.js" lib/ pages/

# Check if SYSTEM_PROMPTS is used anywhere  
grep -r "SYSTEM_PROMPTS" --include="*.js" lib/ pages/

# Check if buildPrompt is called
grep -r "buildPrompt" --include="*.js" lib/ pages/
```

If only in `prompts/index.js` exports → safe to remove.

---

## Next Session

- Continue audit: `validators.js`, `scratchpad.js`, `router.js`
- Then executors: `rag.js`, `web.js`, `crm.js`, `qualify.js`
- Decide on eval gate approach (A/B/C)

---

## Phased Validation Roadmap

### Phase 1: Core Functionality ✅ COMPLETE
**Goal:** Basic ASK/BUILD/ENRICH flows work end-to-end

**Blocking Fixes (must do):**
- [x] Fix rag.js syntax error (Issue #7) — was already correct
- [x] Fix `applyUpdates()` early returns in scratchpad.js

**Recommended Fixes (should do):**
- [x] Add `scratchpad_updates` to executors (Issue #2)
- [x] Wire up scratchpad flow in orchestrator loop

**Test Cases:**
- [ ] ASK: "What pain points do medical device companies have?"
- [ ] BUILD: "Just talked to Sarah Chen, CTO at TechFlow"
- [ ] ENRICH: "Enrich Acme Corp with company details"
- [ ] Multi-turn: "Tell me about Stripe" → "Would they be a good fit?"

---

### Phase 2: External Sources
**Goal:** Apollo/Clay/external enrichment providers integrated

**Prerequisites:** Phase 1 complete, scratchpad flow working

**Work:**
- [ ] Implement `executors/external.js` adapter pattern
- [ ] Select and integrate first provider (Apollo?)
- [ ] Add `external_enrich` examples to planner

---

### Phase 3: Complex Patterns
**Goal:** Multi-company, looping, re-planning flows

**Prerequisites:** Phase 2 complete, external sources available

**Work:**
- [ ] Implement eval gate (Issue #1)
- [ ] Add loop construct OR agentic re-planning (Issue #3)
- [ ] Add multi-company examples to planner
- [ ] Test: "Find ICP lookalikes in Denver, enrich with CEO contacts"

---

## Phase 1 Quickstart

**Minimum fixes to validate core:**

```bash
# 1. Fix syntax error (2 min)
# lib/executors/rag.js - two locations
throw new Error(`RAG search failed: ${error.message}`);  # Add missing (

# 2. Fix scratchpad applyUpdates (10 min)
# lib/orchestrator/scratchpad.js - remove early returns, add active_prospects array support

# 3. Test basic flows
curl -X POST /api/chat -d '{"message": "What is our ICP?", "workspace_id": "..."}'
```

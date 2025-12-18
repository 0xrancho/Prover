/**
 * Seed script to load Joel's case studies as the 'demo' tenant
 *
 * Usage:
 *   node scripts/seed-demo-tenant.js
 *
 * Requires environment variables:
 *   OPENAI_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import 'dotenv/config';
import { processIntake } from '../lib/chunker.js';
import { embedChunks } from '../lib/embeddings.js';
import { insertChunks, deleteChunksForTenant, countChunks } from '../lib/supabase.js';

const DEMO_TENANT_ID = 'demo';

const CASE_STUDIES = `# Case Study: SimpleIT / MacExpress


## Company Profile
- Name: SimpleIT
- Type: Corporate MSP
- Headcount: 6
- Revenue: $1.2M
- Location: Indianapolis, IN


## Target Company (Acquisition)
- Name: MacExpress
- Type: Apple licensed reseller and repair shop
- Context: Acquisition target for SimpleIT


## Buyer Profile
- Name: Thomas
- Title: CEO
- Persona: Owner-operator of small MSP evaluating inorganic growth


## Relationship Origin
- Network: Indy Redemptive Entrepreneur network
- Relationship type: Personal friend
- Warm intro: Direct relationship, no intermediary


## Trigger / Timing
- Event: Evaluating MacExpress acquisition
- Constraint: Needed due diligence without distracting his 6-person team
- Urgency: Active deal evaluation


## Stated Need vs. Actual Need
- Stated: Clay enrichment for opportunity canvassing
- Actual: Strategic BI analysis to determine acquisition viability
- Gap: Thought he needed data; needed insight


## Deliverables
- AI-powered Python analysis
- Tailwind data visualization
- Strategic recommendation


## Key Insight / Proof Point
MacExpress owner is actively letting contracts attrit. He wants to focus on his inventory SaaS and let IT/procurement work fizzle out. However, IT and procurement work drives the margin. The SaaS is a loser. Neither owner knew this. Insight changed both parties' strategies:
- Thomas: Shifted from acquisition to partnership model
- MacExpress owner: Now has clarity on where his value actually sits


## Outcome
- Decision: Acquisition → Partnership
- Strategic clarity for both parties
- No wasted capital on misaligned acquisition


## Differentiator (Why Joel)
- Alternative: Hire BI analyst for less
- Analyst limitation: "What are your queries?" — reactive
- Joel advantage: Proactive analysis from RevOps + BI + AI + P&L experience
- Didn't need to be told what to look for


## Engagement Economics
- Hours: 8
- Price: $1,500
- Effective rate: $187.50/hr
- Unit economics: Worked for both parties


## Reference
- Thomas: Yes, reference-able


## Match Signals (Future Prospects)
- Firmographic: Small MSP or IT services, <10 headcount, owner-operated
- Trigger: Acquisition, partnership evaluation, due diligence need
- Buyer: CEO/owner without internal analyst capacity
- Pain: Need insight, not just data; can't distract small team
- Relationship: Trust-based, warm network, values-aligned
- Engagement: Short-cycle, high-trust, strategic output.


# Case Study: OpenInsights


## Company Profile
- Name: OpenInsights
- Type: ML insights company (retail data intelligence)
- Headcount: ~8
- Revenue: $2M
- Location: Indianapolis, IN
- Tech stack: BigQuery, Elastic, Google Cloud (client-hosted)


## What They Do
Ingest large retail data (Macy's, Bass Pro scale), apply proprietary Universal ML model, reveal millions in re-targeting, retention, and acquisition opportunity for enterprise retail clients.


## Buyer Profile
- Primary: Kelly, Chief Strategy Officer
- Secondary: Angel, CEO
- Dynamic: Kelly championed engagement; Angel initially reluctant, later grateful


## Relationship Origin
- Network: Indy Redemptive Entrepreneur network
- Relationship type: Kelly knew Joel's capabilities directly
- Entry: Kelly told Angel he was bringing Joel in


## Trigger / Timing
- Problem: ICP is DTC Enterprise Retail Marketing teams, but product users are Data Scientists / IT analysts
- Friction: Marketing buyers can't access insights without Data team intermediaries
- Pain level: Hurting enough to know it's a problem, not enough to proactively seek help
- Catalyst: Kelly's direct advocacy


## Stated Need vs. Actual Need
- Stated: GTM Product Strategy
- Actual: Technical roadmap to unlock sales demos without Product team dependency
- Gap: Thought they needed strategy; needed strategy + buildable plan


## Deliverables
- Team interviews
- Prototype: Big Loud Shirt (goal-based analytics demo)
- Strategy documentation
- Technical roadmap: Streamlit app on Terraform preset configs
- Outcome: Presales can spin up demos independently


## Key Insight / Proof Point
Sales cannot sell without Product team involvement. Universal ML model is powerful but inaccessible to buyer persona. Solution: Demo layer (Streamlit) with preset configs that presales can deploy on Terraform. Marketing buyers discover opportunities directly; Data team intermediaries removed from sales cycle.


## Outcome
- Delivered: New strategic vision for a company that had none
- Status: Aim to implement early 2025
- Future work: Build engagement queued pending their execution


## Differentiator (Why Joel)
- Alternative: Continue struggling, hire agency, or hire product person
- Agency limitation: Ideas without technical feasibility
- Product hire limitation: Slow, expensive, uncertain fit
- Joel advantage: Strategy + hard technical roadmap in one engagement
- Quote-worthy: "I didn't just deliver ideas but a hard technical roadmap... cause I can."


## Engagement Economics
- Hours: ~20
- Price: $5,000
- Effective rate: $250/hr
- Engagement type: Paid discovery / consulting


## Reference
- Kelly & Angel: Yes, reference-able
- Constraint: No product to show externally (strategy docs only)


## Match Signals (Future Prospects)
- Firmographic: ML/data company, $1-5M rev, <15 headcount, technical product
- Trigger: GTM friction between technical product and business buyer
- Buyer: CSO, CEO, or founder with strategy gap
- Pain: Product team bottleneck in sales cycle; can't demo without engineering
- Relationship: Trust-based, warm network, values-aligned (Redemptive Entrepreneur)
- Engagement: Paid discovery, strategy + prototype, potential build follow-on`;

const ICP_DEFINITION = `**Summary:** Trust-based professional services firms. Relationship-sold, high-ACV or retainer models, minimal ops capacity.

**Fits:** Custom software consultancies, boutique strategy firms, technical advisory, B2B agencies, niche implementation partners.

**Does not fit:** Big 4, staffing firms, government contractors, high-volume agencies, RFP-driven procurement.

**Buyer persona:** Solo GTM Principal. Founder, partner, or one-person revenue function. Owns BD strategy and execution. No ops support. Needs leverage, not tools to manage.`;

async function seed() {
  console.log('🌱 Seeding demo tenant...\n');

  // Check environment
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set');
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase credentials not set');
  }

  // Clear existing demo data
  console.log('🗑️  Clearing existing demo data...');
  await deleteChunksForTenant(DEMO_TENANT_ID);

  // Process case studies
  console.log('\n📚 Processing case studies...');
  const caseStudyChunks = await processIntake(CASE_STUDIES, DEMO_TENANT_ID, 'case_study', 'text');
  console.log(`   Generated ${caseStudyChunks.length} chunks`);

  // Process ICP
  console.log('\n🎯 Processing ICP definition...');
  const icpChunks = await processIntake(ICP_DEFINITION, DEMO_TENANT_ID, 'icp', 'text');
  console.log(`   Generated ${icpChunks.length} chunks`);

  // Combine all chunks
  const allChunks = [...caseStudyChunks, ...icpChunks];

  // Generate embeddings
  console.log('\n🧠 Generating embeddings...');
  const chunksWithEmbeddings = await embedChunks(allChunks);
  console.log(`   Embedded ${chunksWithEmbeddings.length} chunks`);

  // Insert into Supabase
  console.log('\n💾 Inserting into Supabase...');
  await insertChunks(chunksWithEmbeddings);

  // Verify
  const totalChunks = await countChunks(DEMO_TENANT_ID);
  console.log(`\n✅ Seeding complete! ${totalChunks} chunks loaded for tenant: ${DEMO_TENANT_ID}`);

  // Summary
  console.log('\n📊 Chunk breakdown:');
  const breakdown = allChunks.reduce((acc, c) => {
    const key = `${c.doc_type}/${c.chunk_type}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  Object.entries(breakdown).forEach(([key, count]) => {
    console.log(`   ${key}: ${count}`);
  });
}

seed().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});

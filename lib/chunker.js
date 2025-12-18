import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Parse CSV content into array of objects
function parseCSV(csvContent) {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);

  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((header, index) => {
      obj[header.trim()] = (values[index] || '').trim();
    });
    return obj;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

// Generate unique chunk ID
function generateChunkId(docId, chunkType, index = 0) {
  return `${docId}_${chunkType}_${index}`;
}

// ============================================
// CASE STUDY CHUNKING
// ============================================

// Chunk a single case study into multiple typed chunks
function chunkCaseStudy(caseStudy, docId) {
  const chunks = [];

  // Company Profile chunk
  const companyProfile = [
    caseStudy.company_name && `${caseStudy.company_name}`,
    caseStudy.company_type && `Type: ${caseStudy.company_type}`,
    caseStudy.headcount && `Headcount: ${caseStudy.headcount}`,
    caseStudy.revenue && `Revenue: ${caseStudy.revenue}`,
    caseStudy.location && `Location: ${caseStudy.location}`,
    caseStudy.target_company && `Target/Related Company: ${caseStudy.target_company}`,
  ].filter(Boolean).join('. ');

  if (companyProfile) {
    chunks.push({
      doc_id: docId,
      chunk_id: generateChunkId(docId, 'company_profile'),
      chunk_type: 'company_profile',
      content: companyProfile,
      metadata: {
        company_name: caseStudy.company_name,
        headcount: caseStudy.headcount,
        revenue: caseStudy.revenue,
      },
    });
  }

  // Problem Trigger chunk
  const problemTrigger = [
    caseStudy.buyer_name && `Buyer: ${caseStudy.buyer_name}`,
    caseStudy.buyer_title && `Title: ${caseStudy.buyer_title}`,
    caseStudy.buyer_persona && `Persona: ${caseStudy.buyer_persona}`,
    caseStudy.relationship_origin && `Relationship: ${caseStudy.relationship_origin}`,
    caseStudy.trigger_event && `Trigger: ${caseStudy.trigger_event}`,
    caseStudy.stated_need && `Stated Need: ${caseStudy.stated_need}`,
    caseStudy.actual_need && `Actual Need: ${caseStudy.actual_need}`,
  ].filter(Boolean).join('. ');

  if (problemTrigger) {
    chunks.push({
      doc_id: docId,
      chunk_id: generateChunkId(docId, 'problem_trigger'),
      chunk_type: 'problem_trigger',
      content: problemTrigger,
      metadata: {
        company_name: caseStudy.company_name,
        buyer_name: caseStudy.buyer_name,
        buyer_title: caseStudy.buyer_title,
      },
    });
  }

  // Insight Outcome chunk
  const insightOutcome = [
    caseStudy.key_insight && `Key Insight: ${caseStudy.key_insight}`,
    caseStudy.outcome && `Outcome: ${caseStudy.outcome}`,
    caseStudy.deliverables && `Deliverables: ${caseStudy.deliverables}`,
  ].filter(Boolean).join('. ');

  if (insightOutcome) {
    chunks.push({
      doc_id: docId,
      chunk_id: generateChunkId(docId, 'insight_outcome'),
      chunk_type: 'insight_outcome',
      content: insightOutcome,
      metadata: {
        company_name: caseStudy.company_name,
        outcome: caseStudy.outcome,
      },
    });
  }

  // Differentiator chunk
  if (caseStudy.differentiator) {
    chunks.push({
      doc_id: docId,
      chunk_id: generateChunkId(docId, 'differentiator'),
      chunk_type: 'differentiator',
      content: caseStudy.differentiator,
      metadata: {
        company_name: caseStudy.company_name,
      },
    });
  }

  // Match Signal chunk
  if (caseStudy.match_signals) {
    chunks.push({
      doc_id: docId,
      chunk_id: generateChunkId(docId, 'match_signal'),
      chunk_type: 'match_signal',
      content: caseStudy.match_signals,
      metadata: {
        company_name: caseStudy.company_name,
      },
    });
  }

  return chunks;
}

// Process CSV of case studies
export function chunkCaseStudiesFromCSV(csvContent, tenantId) {
  const records = parseCSV(csvContent);
  const allChunks = [];

  records.forEach((record, index) => {
    const docId = record.company_name
      ? record.company_name.toLowerCase().replace(/[^a-z0-9]/g, '_')
      : `case_study_${index}`;

    const chunks = chunkCaseStudy(record, docId);

    chunks.forEach(chunk => {
      allChunks.push({
        tenant_id: tenantId,
        doc_type: 'case_study',
        ...chunk,
      });
    });
  });

  return allChunks;
}

// ============================================
// ICP CHUNKING
// ============================================

function chunkICP(icp, docId) {
  const chunks = [];

  // ICP Definition chunk
  const definition = [
    icp.summary,
    icp.fits && `Fits: ${icp.fits}`,
  ].filter(Boolean).join('. ');

  if (definition) {
    chunks.push({
      doc_id: docId,
      chunk_id: generateChunkId(docId, 'icp_definition'),
      chunk_type: 'icp_definition',
      content: definition,
      metadata: {},
    });
  }

  // ICP Buyer chunk
  const buyer = [
    icp.buyer_persona && `Buyer Persona: ${icp.buyer_persona}`,
    icp.buyer_description,
  ].filter(Boolean).join('. ');

  if (buyer) {
    chunks.push({
      doc_id: docId,
      chunk_id: generateChunkId(docId, 'icp_buyer'),
      chunk_type: 'icp_buyer',
      content: buyer,
      metadata: {},
    });
  }

  // ICP Negative chunk
  if (icp.does_not_fit) {
    chunks.push({
      doc_id: docId,
      chunk_id: generateChunkId(docId, 'icp_negative'),
      chunk_type: 'icp_negative',
      content: `Does not fit: ${icp.does_not_fit}`,
      metadata: {},
    });
  }

  return chunks;
}

// Process CSV of ICP definitions
export function chunkICPFromCSV(csvContent, tenantId) {
  const records = parseCSV(csvContent);
  const allChunks = [];

  records.forEach((record, index) => {
    const docId = `icp_${index}`;
    const chunks = chunkICP(record, docId);

    chunks.forEach(chunk => {
      allChunks.push({
        tenant_id: tenantId,
        doc_type: 'icp',
        ...chunk,
      });
    });
  });

  return allChunks;
}

// ============================================
// FREEFORM TEXT CHUNKING (GPT-4 assisted)
// ============================================

const CASE_STUDY_EXTRACTION_PROMPT = `Extract structured case study data from the following text. Return a JSON array where each object has these fields:

- company_name: Name of the client company
- company_type: Type of business (e.g., "Corporate MSP", "ML insights company")
- headcount: Number of employees (e.g., "6", "~8")
- revenue: Revenue if mentioned (e.g., "$1.2M", "$2M")
- location: Location if mentioned
- target_company: If there's a secondary company involved (acquisition target, etc.)
- buyer_name: Primary buyer/champion name
- buyer_title: Buyer's job title
- buyer_persona: Brief description of buyer type
- relationship_origin: How the relationship started
- trigger_event: What triggered the engagement
- stated_need: What they said they needed
- actual_need: What they actually needed
- deliverables: What was delivered
- key_insight: The key insight or proof point from the engagement
- outcome: The business outcome
- differentiator: Why you vs alternatives
- hours: Hours spent if mentioned
- price: Price if mentioned
- match_signals: Characteristics that signal a similar prospect would be a good fit

Return ONLY valid JSON, no explanation.`;

const ICP_EXTRACTION_PROMPT = `Extract structured ICP (Ideal Customer Profile) data from the following text. Return a JSON array where each object has these fields:

- summary: One-line summary of the ICP
- fits: Types of companies/personas that fit
- does_not_fit: Types that don't fit (negative signals)
- buyer_persona: Description of the ideal buyer persona
- buyer_description: More detail about the buyer

Return ONLY valid JSON, no explanation.`;

// Use GPT-4 to extract structured data from freeform text
async function extractStructuredData(text, docType) {
  const prompt = docType === 'case_study'
    ? CASE_STUDY_EXTRACTION_PROMPT
    : ICP_EXTRACTION_PROMPT;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: text },
    ],
    temperature: 0.1,
    max_tokens: 4000,
  });

  const content = completion.choices[0].message.content.trim();

  // Try to parse JSON from the response
  try {
    // Handle potential markdown code blocks
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                      content.match(/```\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse GPT-4 extraction:', e);
    console.error('Raw content:', content);
    throw new Error('Failed to extract structured data from text');
  }
}

// Chunk freeform text by first extracting structure via GPT-4
export async function chunkFromFreeformText(text, tenantId, docType) {
  const records = await extractStructuredData(text, docType);

  if (!Array.isArray(records)) {
    throw new Error('Extraction did not return an array');
  }

  if (docType === 'case_study') {
    const allChunks = [];
    records.forEach((record, index) => {
      const docId = record.company_name
        ? record.company_name.toLowerCase().replace(/[^a-z0-9]/g, '_')
        : `case_study_${index}`;

      const chunks = chunkCaseStudy(record, docId);
      chunks.forEach(chunk => {
        allChunks.push({
          tenant_id: tenantId,
          doc_type: 'case_study',
          ...chunk,
        });
      });
    });
    return allChunks;
  }

  if (docType === 'icp') {
    const allChunks = [];
    records.forEach((record, index) => {
      const docId = `icp_${index}`;
      const chunks = chunkICP(record, docId);
      chunks.forEach(chunk => {
        allChunks.push({
          tenant_id: tenantId,
          doc_type: 'icp',
          ...chunk,
        });
      });
    });
    return allChunks;
  }

  throw new Error(`Unknown doc_type: ${docType}`);
}

// ============================================
// MAIN ENTRY POINT
// ============================================

// Legacy: tenant_id based
export async function processIntake(content, tenantId, docType, format) {
  let chunks;

  if (format === 'csv') {
    if (docType === 'case_study') {
      chunks = chunkCaseStudiesFromCSV(content, tenantId);
    } else if (docType === 'icp') {
      chunks = chunkICPFromCSV(content, tenantId);
    } else {
      throw new Error(`Unknown doc_type: ${docType}`);
    }
  } else if (format === 'text') {
    chunks = await chunkFromFreeformText(content, tenantId, docType);
  } else {
    throw new Error(`Unknown format: ${format}`);
  }

  return chunks;
}

// New: workspace_id based
export async function processIntakeForWorkspace(content, workspaceId, docType, format) {
  // Use GPT-4 extraction for text format
  let records;

  if (format === 'csv') {
    records = parseCSV(content);
  } else if (format === 'text') {
    records = await extractStructuredData(content, docType);
  } else {
    throw new Error(`Unknown format: ${format}`);
  }

  if (!Array.isArray(records)) {
    throw new Error('Extraction did not return an array');
  }

  const allChunks = [];

  if (docType === 'case_study') {
    records.forEach((record, index) => {
      const docId = record.company_name
        ? record.company_name.toLowerCase().replace(/[^a-z0-9]/g, '_')
        : `case_study_${index}`;

      const chunks = chunkCaseStudy(record, docId);
      chunks.forEach(chunk => {
        allChunks.push({
          workspace_id: workspaceId,
          doc_type: 'case_study',
          ...chunk,
        });
      });
    });
  } else if (docType === 'icp') {
    records.forEach((record, index) => {
      const docId = `icp_${index}`;
      const chunks = chunkICP(record, docId);
      chunks.forEach(chunk => {
        allChunks.push({
          workspace_id: workspaceId,
          doc_type: 'icp',
          ...chunk,
        });
      });
    });
  } else {
    throw new Error(`Unknown doc_type: ${docType}`);
  }

  return allChunks;
}

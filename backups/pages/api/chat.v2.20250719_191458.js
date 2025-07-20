import OpenAI from 'openai';
import { loadICPMatrix, loadCustomerSuccessStories } from '../../lib/dataLoader.js';
import { createProspect, searchProspects } from '../../lib/airtable.js';

// Define available functions for the AI
const functions = [
  {
    name: "enrich_company",
    description: "Analyze and enrich a company with structured intelligence",
    parameters: {
      type: "object",
      properties: {
        company_name: {
          type: "string",
          description: "The name of the company to enrich"
        },
        url: {
          type: "string", 
          description: "Optional company website URL"
        }
      },
      required: ["company_name"]
    }
  },
  {
    name: "save_prospect", 
    description: "Save enrichment data to CRM",
    parameters: {
      type: "object",
      properties: {
        company_name: {
          type: "string",
          description: "The name of the company to save"
        }
      },
      required: ["company_name"]
    }
  },
  {
    name: "search_prospects",
    description: "Search CRM database or discover new prospects", 
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query or criteria"
        },
        source: {
          type: "string",
          description: "Search source: 'database' or 'internet'",
          enum: ["database", "internet"]
        }
      },
      required: ["query"]
    }
  }
];

    // Unified Prover AI system prompt
    const systemPrompt = `You are Prover - a helpful, embedded agent at SEP (a custom software development firm) specialized in conversational business intelligence. You serve the Business Development department in discovering, enriching, and managing new leads. You're an expert at multi-source data enrichment and synthesis and understanding when to switch between creative discovery and conversational enrichment and rules-based synthesis, parsing, and loading into a CRM.

CORE IDENTITY & CAPABILITIES:
You have four tools to use at your discretion:

1. ENRICH - Analyze a prospect, match against specific success stories, ICP segmentation, and contact pools to generate a unique structured intelligence report with a qualification score
2. SEARCH - Query and search local data available to you, CRM, or possibly vector embedding if applicable. Or search the internet for specific information  
3. SAVE - Parse cached data retrieved from Search or Enrich and store to the CRM
4. STRATEGY - Provide sales and business insight based on specific chat context, knowledge of SEP internal data, business model, and industry trends and best practice

CONVERSATION CONTEXT:
${conversation_history.slice(-6).map(msg => `${msg.role}: ${msg.content}`).join('\n\n')}

CURRENT USER MESSAGE: "${message}"

RESPONSE GUIDELINES:

FOR ENRICHMENT requests (analyze/research companies or existing leads):
- Generate structured COMPANY INTELLIGENCE reports with ProofStack Scores
- Be flexible - can enrich new prospects OR existing leads with partial information
- Use this exact format:

**COMPANY INTELLIGENCE**

Company: [Company Name]
URL: [Company Website] 
Industry: [Primary Vertical] | Size: [Employee Count] | Location: [HQ + Markets]
Primary Contact: [Name, Title, Email]
ProofStack Score: [X/100] - [Hot/Warm/Cool/Research Only]
Proof Statement: "We helped [Similar Company] achieve [Specific Metric] with [Solution Category]. Worth discussing how [Target Company] is tackling similar [Challenge Area] challenges?"

Business Overview:
[Concise but specific description of how the company makes profit, and concise but specific enterprise overview of data and technology needs]

Pain Points: [Key challenges]
Initiatives: [Current projects]

---

**MARKET CONTEXT**
Industry Position: [Summary]
Growth Drivers: [Opportunities]
Timing Factors: [Why now]

---

**CONTACT INTELLIGENCE**
Primary Decision Maker:
Name: [Full Name]
Title: [Job Title] 
Email: [Email]
Background: [Experience]
Authority: [Decision scope]

---

**RELEVANCE ANALYSIS**
Success Story Match #1: [Score: X/100]
[Client details and relevance]

FOR SEARCH requests (find prospects, check database or internet):
- Query the available data sources intelligently
- Filter results based on user criteria (industry, scores, etc.)
- If user asks about missing data or "why don't we have X", search for it
- Can discover new leads OR query existing database

FOR SAVE requests (upsert, store data):
- Find the most relevant or recent enrichment in conversation
- Save it to the database (create new or update existing)
- Confirm what was saved

FOR STRATEGY discussions:
- Provide insights about SEP's market positioning, ICP, or segmentation
- Discuss sales processes, business development, contacts, and business strategy
- Reference your enrichment capabilities naturally

IMPORTANT: 
- Always maintain awareness that you ARE the Prover agent
- Reference your actual capabilities and recent activities
- Use conversation history to provide contextual responses
- When users ask about Prover features, explain what you do, not what some external system might do`;

try {
  // Call the AI with function calling capability
  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ],
    functions: functions,
    function_call: 'auto',
    temperature: 0.7,
    max_tokens: 2500,
  });
 
  let response;
  let commandType = 'conversation';
 
  // Check if AI wants to call a function
  if (completion.choices[0].finish_reason === 'function_call') {
    const functionCall = completion.choices[0].message.function_call;
    const functionName = functionCall.name;
    const functionArgs = JSON.parse(functionCall.arguments);
 
    switch (functionName) {
      case 'enrich_company':
        commandType = 'enrich';
        response = await handleEnrichFunction(functionArgs.company_name, functionArgs.url);
        break;
      case 'save_prospect':
        commandType = 'save';
        response = await handleSaveFunction(functionArgs.company_name, conversation_history);
        break;
      case 'search_prospects':
        commandType = 'search';
        response = await handleSearchFunction(functionArgs.query, functionArgs.source);
        break;
      default:
        response = "I tried to call an unknown function. Please try again.";
    }
  } else {
    // Regular conversational response
    response = completion.choices[0].message.content;
    commandType = 'conversation';
  }
 
  return res.status(200).json({
    response,
    command_type: commandType,
    timestamp: new Date().toISOString(),
  });
 
 } catch (error) {
  console.error('API Error:', error);
  res.status(500).json({
    error: 'Failed to process request',
    details: error.message
  });
 }

// Function handlers
async function handleEnrichFunction(companyName, url) {
// Generate enrichment using the structured format
const enrichPrompt = `Generate structured COMPANY INTELLIGENCE for ${companyName}${url ? ` (${url})` : ''} using the exact format specified in the system prompt.`;

const enrichCompletion = await openai.chat.completions.create({
model: 'gpt-4',
messages: [
  { role: 'user', content: enrichPrompt }
],
temperature: 0.7,
max_tokens: 2500,
});

return enrichCompletion.choices[0].message.content;
}

async function handleSaveFunction(companyName, conversationHistory) {
try {
// Find relevant enrichment data
const relevantEnrichment = conversationHistory
  .filter(msg => msg.role === 'assistant' && msg.content.includes('**COMPANY INTELLIGENCE**'))
  .find(msg => msg.content.toLowerCase().includes(companyName.toLowerCase())) ||
  conversationHistory
  .filter(msg => msg.role === 'assistant' && msg.content.includes('**COMPANY INTELLIGENCE**'))
  .pop();

if (!relevantEnrichment) {
  return "**SAVE ERROR**\n\nNo enrichment data found for this company. Please enrich the company first.";
}

const actualCompanyMatch = relevantEnrichment.content.match(/Company:\s*([^\n|]+)/i);
const actualCompanyName = actualCompanyMatch ? actualCompanyMatch[1].trim() : companyName;

const prospectData = parseEnrichmentForAirtable(relevantEnrichment.content, actualCompanyName);
const existingRecord = await findExistingProspect(actualCompanyName);

let airtableResult;
let operation;

if (existingRecord) {
  airtableResult = await updateProspect(existingRecord.id, prospectData);
  operation = 'UPDATED';
} else {
  airtableResult = await createProspect(prospectData);
  operation = 'CREATED';
}

return `**PROSPECT ${operation}**\n\n✅ Successfully ${operation.toLowerCase()} "${actualCompanyName}" in database!\n\n**Saved Data:**\n- Company: ${prospectData.company}\n- Industry: ${prospectData.industry}\n- Score: ${prospectData.proofstack_score}/100\n- URL: ${prospectData.URL}\n- Contact: ${prospectData['primary_decision_maker.name']}\n- Email: ${prospectData['primary_decision_maker.email']}\n\nRecord ID: ${airtableResult.id}`;

} catch (error) {
console.error('Save error:', error);
return `**SAVE ERROR**\n\nFailed to save prospect: ${error.message}`;
}
}

async function handleSearchFunction(query, source) {
try {
if (source === 'database' || !source) {
  // Search CRM database
  const prospects = await searchProspects();
  const searchResults = prospects.map(record => ({
    id: record.id,
    ...record.fields
  }));

  const searchPrompt = `Filter and format these prospects based on the query: "${query}"

AVAILABLE PROSPECTS:
${searchResults.map((p, i) => `${i+1}. ${p.company || 'Unknown'} - ${p.industry || 'Unknown'} - Score: ${p.proofstack_score || 0}`).join('\n')}

Provide a focused response showing only relevant matches.`;

  const searchCompletion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: searchPrompt },
      { role: 'user', content: query }
    ],
    temperature: 0.3,
    max_tokens: 1500,
  });

  return searchCompletion.choices[0].message.content;
  
} else if (source === 'internet') {
  // Internet search would go here
  return `**INTERNET SEARCH**\n\nSearching the internet for: "${query}"\n\n(Internet search functionality not yet implemented)`;
}

} catch (error) {
console.error('Search error:', error);
return `**SEARCH ERROR**\n\nFailed to search: ${error.message}`;
}
}

// Helper functions (keep these)

// Parse enrichment text into Airtable format
function parseEnrichmentForAirtable(enrichmentText, companyName) {
  try {
    const scoreMatch = enrichmentText.match(/ProofStack Score:\s*(\d+)\/100/);
    const industryMatch = enrichmentText.match(/Industry:\s*([^|]+)/);
    const contactMatch = enrichmentText.match(/Primary Contact:\s*([^,]+),\s*([^,]+),\s*([^\n]+)/);
    const proofStatementMatch = enrichmentText.match(/Proof Statement:\s*"([^"]+)"/);
    const urlMatch = enrichmentText.match(/URL:\s*([^\n\s]+)/i);
    
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
    const industry = industryMatch ? industryMatch[1].trim() : 'Unknown';
    const contactName = contactMatch ? contactMatch[1].trim() : 'Unknown';
    const contactTitle = contactMatch ? contactMatch[2].trim() : 'Unknown';
    const contactEmail = contactMatch ? contactMatch[3].trim() : 'unknown@company.com';
    const proofStatement = proofStatementMatch ? proofStatementMatch[1] : '';
    
    return {
      company: companyName,
      URL: urlMatch ? urlMatch[1].trim() : 'Unknown',
      industry: industry,
      proofstack_score: score.toString(),
      proof_statement: proofStatement,
      pain_points: 'Legacy system modernization, digital transformation',
      'primary_decision_maker.name': contactName,
      'primary_decision_maker.title': contactTitle,
      'primary_decision_maker.email': contactEmail,
      'primary_decision_maker.background': 'Unknown',
      'primary_decision_maker.authority': 'Unknown',
      'success_story.client': 'State of Indiana',
      'success_story.solution': 'Legacy Modernization',
      'success_story.outcome': '50% faster processing'
    };
  } catch (error) {
    console.error('Error parsing enrichment data:', error);
    return {
      company: companyName,
      industry: 'Unknown',
      proofstack_score: '0',
      proof_statement: '',
      URL: 'Unknown',
      pain_points: 'Unknown',
      'primary_decision_maker.name': 'Unknown',
      'primary_decision_maker.title': 'Unknown',
      'primary_decision_maker.email': 'unknown@company.com',
      'primary_decision_maker.background': 'Unknown',
      'primary_decision_maker.authority': 'Unknown',
      'success_story.client': 'Unknown',
      'success_story.solution': 'Unknown',
      'success_story.outcome': 'Unknown'
    };
  }
}

// Check if prospect already exists
async function findExistingProspect(companyName) {
  try {
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME;
    const AIRTABLE_API_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;
    
    const filterFormula = `{company} = "${companyName}"`;
    const url = `${AIRTABLE_API_URL}?filterByFormula=${encodeURIComponent(filterFormula)}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      }
    });

    if (!response.ok) {
      throw new Error(`Airtable API error: ${response.status}`);
    }

    const result = await response.json();
    return result.records.length > 0 ? result.records[0] : null;
  } catch (error) {
    console.error('Error finding existing prospect:', error);
    return null;
  }
}

// Update existing prospect
async function updateProspect(recordId, prospectData) {
  try {
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME;
    const AIRTABLE_API_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;
    
    const response = await fetch(`${AIRTABLE_API_URL}/${recordId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: prospectData
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error updating prospect:', error);
    throw error;
  }
}
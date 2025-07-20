import OpenAI from 'openai';
import { loadICPMatrix, loadCustomerSuccessStories } from '../../lib/dataLoader.js';
import { createProspect, searchProspects } from '../../lib/airtable.js';
import { DataQueryLogger } from '../../lib/data-queries.js';

const openai = new OpenAI({  
  apiKey: process.env.OPENAI_API_KEY,
}); 

const functions = [
  {
    name: "enrich_prospect",
    description: "Research and analyze a company for business development opportunities",
    parameters: {
      type: "object",
      properties: {
        company_identifier: {
          type: "string",
          description: "Company name, URL, or other identifier"
        },
        analysis_depth: {
          type: "string",
          description: "Level of analysis needed",
          enum: ["quick_overview", "full_intelligence", "competitive_analysis"]
        }
      },
      required: ["company_identifier"]
    }
  },
  {
    name: "manage_prospect_data",
    description: "Store, update, or organize prospect information in the CRM system",
    parameters: {
      type: "object",
      properties: {
        data_operation: {
          type: "string",
          description: "Type of data management needed",
          enum: ["store_new", "update_existing", "organize_pipeline", "generate_report"]
        },
        context: {
          type: "string",
          description: "Context or identifier for the data operation"
        }
      },
      required: ["data_operation"]
    }
  }
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, conversation_history = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    const logger = new DataQueryLogger();
    const icpMatrix = await loadICPMatrix();
    const successStories = await loadCustomerSuccessStories();

    // Unified Prover AI system prompt
    const systemPrompt = `You are Prover - an embedded business intelligence agent at SEP (custom software development firm). You excel at understanding business intent and applying the right analytical approach.

CORE PHILOSOPHY:
You are an intelligent business strategist with embedded data access. Use natural conversation for strategic discussions. Only call functions for specific structured tasks: detailed company analysis or data management operations.

CAPABILITIES:
- Strategic business conversations using embedded proprietary data
- Structured company enrichment and analysis (when requested)
- CRM data management and pipeline operations
- Natural market insights and synthesis using loaded ICP and success story data

FUNCTION CALLING RULES:
Use functions for these specific cases:

1. ENRICH_PROSPECT: When user wants structured, detailed company analysis
   - "Analyze Tesla as a prospect"
   - "Give me full intelligence on Roche"
   - "Enrich this company for our pipeline"
   
2. MANAGE_PROSPECT_DATA: When user wants to read, store, update, or organize CRM data
   - "Save this analysis to our CRM"
   - "What mid-size healthcare companies in leads list need qualification data?"
   - "Update this company's status"

NATURAL CONVERSATION (no functions): Everything else
   - Strategic discussions: "What would our ICP look like spcific to mid-west manufacturing companies?"
   - Market analysis: "Based on our recent successes, what new companies should we target?"
   - Follow-up questions: "Tell me more about their revenue model"
   - Campaign planning: "How should we approach these prospects?"

CONVERSATIONAL CONTEXT AWARENESS:
- Use embedded ICP Matrix and Success Stories for strategic discussions
- Reference previous enrichments in follow-up conversations
- Provide insights using proprietary data without rigid formatting
- Be a knowledgeable business partner, not a function router

INTENT EXAMPLES:
"What local municipal offices are closely related to ones we've already served?" → Natural conversation using Success Stories
"Analyze Zimmer Biomet as a prospect" → enrich_prospect  
"Save this prospect to our pipeline" → manage_prospect_data
"How does our ICP look for fintech?" → Natural conversation using embedded ICP data

CONVERSATION CONTEXT:
${conversation_history.slice(-6).map(msg => `${msg.role}: ${msg.content}`).join('\n\n')}

PROPRIETARY DATA CONTEXT:
ICP MATRIX (always available for strategic discussions):
${icpMatrix.map(icp => `${icp.vertical} (${icp.company_size}): ${icp.pain_points}`).join('\n')}

RECENT SUCCESS STORIES (for strategic context):
${successStories.slice(0,6).map(story => `${story.company_name}: ${story.solution_delivered} → ${story.business_outcome}`).join('\n')}

For strategic discussions, use this proprietary data naturally in conversation. Don't format responses with headers or structured blocks - just be a knowledgeable strategist who happens to know our business inside and out.

CURRENT USER MESSAGE: "${message}"

Understand the user's business intent and apply appropriate analysis. Be conversational and intelligent about function selection.`;

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
        case 'enrich_prospect':
          commandType = 'enrich';
          response = await handleProspectEnrichment(
            functionArgs.company_identifier, 
            functionArgs.analysis_depth || 'full_intelligence',
            conversation_history
          );
          break;
                    
        case 'manage_prospect_data':
          commandType = 'manage';
          response = await handleDataManagement(
            functionArgs.data_operation, 
            functionArgs.context, 
            conversation_history
          );
          break;
          
        default:
          response = "I tried to call an unknown function. Please try again.";
      }
    } else {
      // Regular conversational response
      response = completion.choices[0].message.content;
      commandType = 'conversation';
    }

    const dataQueries = logger.getQueries();
    await logRouting(message, commandType, response, { data_queries: dataQueries });


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
}

// Unified function handlers with semantic intent processing:

async function handleProspectEnrichment(companyIdentifier, analysisDepth, conversationHistory) {
  // Extract company name and URL if provided
  const urlMatch = companyIdentifier.match(/(https?:\/\/[^\s]+)/);
  const url = urlMatch ? urlMatch[1] : null;
  const companyName = companyIdentifier.replace(urlMatch?.[1] || '', '').trim();

  let promptTemplate;
  switch (analysisDepth) {
    case 'quick_overview':
      promptTemplate = `Provide a concise business overview of ${companyName}${url ? ` (${url})` : ''} focusing on: revenue model, key products/services, target market, and potential fit for SEP's custom software services.`;
      break;
    case 'competitive_analysis':
      promptTemplate = `Analyze ${companyName}${url ? ` (${url})` : ''} as a competitive benchmark, focusing on: market position, technology capabilities, service offerings, and strategic differentiation opportunities for SEP.`;
      break;
    default: // full_intelligence
      promptTemplate = `Generate structured COMPANY INTELLIGENCE for ${companyName}${url ? ` (${url})` : ''} using this exact format:

**COMPANY INTELLIGENCE**

Company: [Company Name]
URL: [Company Website] 
Industry: [Primary Vertical] | Size: [Employee Count] | Location: [HQ + Markets]
Primary Contact: [Name, Title, Email]
Lead Score: [X/100] - [Hot/Warm/Cool/Research Only]
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
[Client details and relevance]`;
  }
  
  const analysisCompletion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: promptTemplate }
    ],
    temperature: 0.7,
    max_tokens: 2500,
  });
  
  return analysisCompletion.choices[0].message.content;
}


async function handleDataManagement(operation, context, conversationHistory) {
  try {
    switch (operation) {
      case 'store_new':
        return await storeNewProspectData(context, conversationHistory);
      
      case 'update_existing':
        return await updateExistingProspect(context, conversationHistory);
      
      case 'organize_pipeline':
        return await organizePipeline(context);
      
      case 'generate_report':
        return await generateProspectReport(context);
      
      default:
        return await storeNewProspectData(context, conversationHistory);
    }
  } catch (error) {
    console.error('Data management error:', error);
    return `**DATA MANAGEMENT ERROR**\n\nFailed to manage data: ${error.message}`;
  }
}

// Supporting function implementations:

async function searchExistingProspects(query) {
  const prospects = await searchProspects();
  const searchResults = prospects.map(record => ({
    id: record.id,
    ...record.fields
  }));

  const searchPrompt = `Filter and format these prospects based on the query: "${query}"

AVAILABLE PROSPECTS:
${searchResults.map((p, i) => `${i+1}. ${p.company || 'Unknown'} - ${p.industry || 'Unknown'} - Score: ${p.prover_score || 0}`).join('\n')}

Provide a focused response showing only relevant matches with actionable insights.`;

  const searchCompletion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: searchPrompt },
      { role: 'user', content: query }
    ],
    temperature: 0.3,
    max_tokens: 1500,
  });

  return `**DATABASE SEARCH RESULTS**\n\n${searchCompletion.choices[0].message.content}`;
}

async function gatherMarketIntelligence(query, conversationHistory) {
  // Extract company context from conversation history if available
  const companyContext = conversationHistory
    .filter(msg => msg.content.includes('**COMPANY INTELLIGENCE**'))
    .pop();
  
  let contextualPrompt = '';
  if (companyContext) {
    const companyMatch = companyContext.content.match(/Company:\s*([^\n|]+)/i);
    const companyName = companyMatch ? companyMatch[1].trim() : '';
    contextualPrompt = companyName ? `\n\nCONTEXT: This request follows analysis of ${companyName}. Focus research on ${companyName} specifically or use their profile for comparison.` : '';
  }
  
  const researchPrompt = `Provide market intelligence analysis for: "${query}"${contextualPrompt}

Focus on:
- Market size, growth trends, and key drivers
- Technology adoption patterns and digital transformation needs
- Regulatory/compliance factors affecting the industry
- Key challenges creating opportunities for custom software development
- Strategic timing factors and market entry considerations
- Revenue models and business structure analysis

Provide actionable insights for SEP's business development strategy.`;

  const researchCompletion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: researchPrompt },
      { role: 'user', content: query }
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  return `**MARKET INTELLIGENCE**\n\n${researchCompletion.choices[0].message.content}`;
}

async function performCompetitiveResearch(query, conversationHistory) {
  const competitivePrompt = `Analyze the competitive landscape for: "${query}"

Focus on:
- Key competitors and their positioning
- Service offerings and pricing models
- Technology capabilities and differentiation
- Market share and client relationships
- Competitive gaps and opportunities for SEP
- Strategic positioning recommendations

Provide competitive intelligence to inform SEP's strategy.`;

  const competitiveCompletion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: competitivePrompt },
      { role: 'user', content: query }
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  return `**COMPETITIVE RESEARCH**\n\n${competitiveCompletion.choices[0].message.content}`;
}

async function storeNewProspectData(context, conversationHistory) {
  // Find the most recent analysis in conversation
  const recentAnalysis = conversationHistory
    .filter(msg => msg.role === 'assistant' && msg.content.includes('**COMPANY INTELLIGENCE**'))
    .pop();

  if (!recentAnalysis) {
    return "**STORAGE ERROR**\n\nNo prospect analysis found to store. Please analyze a company first.";
  }

  // Extract company name from context or analysis
  const companyMatch = recentAnalysis.content.match(/Company:\s*([^\n|]+)/i);
  const companyName = companyMatch ? companyMatch[1].trim() : (context || 'Unknown Company');
  
  const prospectData = parseEnrichmentForAirtable(recentAnalysis.content, companyName);
  const existingRecord = await findExistingProspect(companyName);
  
  let airtableResult;
  let operation;

  if (existingRecord) {
    airtableResult = await updateProspect(existingRecord.id, prospectData);
    operation = 'UPDATED';
  } else {
    airtableResult = await createProspect(prospectData);
    operation = 'CREATED';
  }

  return `**PROSPECT ${operation}**\n\n✅ Successfully ${operation.toLowerCase()} "${companyName}" in database!\n\n**Saved Data:**\n- Company: ${prospectData.company}\n- Industry: ${prospectData.industry}\n- Score: ${prospectData.prover_score}/100\n- URL: ${prospectData.URL}\n- Contact: ${prospectData['primary_decision_maker.name']}\n- Email: ${prospectData['primary_decision_maker.email']}\n\nRecord ID: ${airtableResult.id}`;
}

async function updateExistingProspect(context, conversationHistory) {
  return `**UPDATE FUNCTION**\n\nUpdating existing prospect: ${context}\n\n(Update logic implementation pending)`;
}

async function organizePipeline(context) {
  const prospects = await searchProspects();
  
  const organizePrompt = `Organize and analyze this prospect pipeline: ${context}

CURRENT PROSPECTS:
${prospects.map(p => `${p.fields.company} - ${p.fields.industry} - Score: ${p.fields.prover_score}`).join('\n')}

Provide pipeline organization with:
- Priority ranking
- Next actions for each segment
- Pipeline health analysis
- Recommendations for optimization`;

  const organizeCompletion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: organizePrompt },
      { role: 'user', content: context }
    ],
    temperature: 0.3,
    max_tokens: 1500,
  });

  return `**PIPELINE ORGANIZATION**\n\n${organizeCompletion.choices[0].message.content}`;
}

async function generateProspectReport(context) {
  const prospects = await searchProspects();
  
  const reportPrompt = `Generate a prospect report for: ${context}

PROSPECT DATA:
${prospects.map(p => `${p.fields.company} - ${p.fields.industry} - Score: ${p.fields.prover_score} - Status: ${p.fields.status || 'Unknown'}`).join('\n')}

Include:
- Executive summary
- Key metrics and trends
- High-priority opportunities
- Action recommendations
- Performance insights`;

  const reportCompletion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: reportPrompt },
      { role: 'user', content: context }
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });

  return `**PROSPECT REPORT**\n\n${reportCompletion.choices[0].message.content}`;
}

// Helper functions
function parseEnrichmentForAirtable(enrichmentText, companyName) {
  try {
    const scoreMatch = enrichmentText.match(/Lead Score:\s*(\d+)\/100/);
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
      prover_score: score.toString(),
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
      prover_score: '0',
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

async function logRouting(input, commandType, response, additionalData = {}) {
try {
  const logEntry = {
    input: input.substring(0, 200),
    command_type: commandType,
    data_queries: additionalData.data_queries || [],
    response_preview: response.substring(0, 300) + '...',
  };

  await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(logEntry)
  }).catch(err => console.error('Logging failed:', err));
} catch (error) {
  console.error('Logging failed:', error);
}
}
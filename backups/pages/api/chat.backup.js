import OpenAI from 'openai';
import { loadICPMatrix, loadCustomerSuccessStories, findICPMatch, findSuccessStoryMatches } from '../../lib/dataLoader.js';
import { createProspect, searchProspects } from '../../lib/airtable.js';
// Check if prospect already exists (inline function)
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

// Update existing prospect (inline function)
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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Command detection
function detectCommand(message) {
  const enrichMatch = message.match(/^\/\/enrich\s+(.+)/i);
  if (enrichMatch) {
    return { type: 'enrich', target: enrichMatch[1].trim() };
  }
  
  const searchMatch = message.match(/^\/\/search\s+(.+)/i);
  if (searchMatch) {
    return { type: 'search', query: searchMatch[1].trim() };
  }
  
  const upsertMatch = message.match(/^\/\/upsert\s+(.+)/i);
  if (upsertMatch) {
    return { type: 'upsert', operation: upsertMatch[1].trim() };
  }
  
  return { type: 'conversation', message };
}

// Enhanced system prompts with real data context
const getSystemPrompt = (commandType, context = {}) => {
  switch (commandType) {
    case 'enrich':
      const icpData = loadICPMatrix();
      const successStories = loadCustomerSuccessStories();
      
      return `You are a prospect enrichment specialist with access to SEP's ICP profiles and customer success stories.

TASK: Analyze the target company and provide structured intelligence.

ICP PROFILES AVAILABLE:
${icpData.map(profile => `- ${profile.vertical}: ${profile.pain_points}`).join('\n')}

SUCCESS STORIES AVAILABLE:
${successStories.slice(0, 10).map(story => `- ${story.company_name} (${story.industry}): ${story.solution_category} → ${story.business_outcome_metrics}`).join('\n')}

OUTPUT FORMAT (EXACT):

**COMPANY INTELLIGENCE**

Company: [Company Name]
Industry: [Primary Vertical] | Size: [Employee Count] | Location: [HQ + Markets]
Primary Contact: [Name, Title, Email] 
ProofStack Score: [X/100] - [Hot/Warm/Cool/Research Only]
Proof Statement: "We helped [Similar Company] achieve [Specific Metric] with [Solution Category]. Worth discussing how [Target Company] is tackling similar [Challenge Area] challenges?"

Business Overview:
[Detailed business model and market position analysis]

Pain Points: [Key challenges based on ICP matching]
Initiatives: [Current transformation projects or growth moves]

---

**MARKET CONTEXT**

Industry Position: [Competitive landscape summary]
Growth Drivers: [Business pressures and opportunities]  
Timing Factors: [Why now for potential engagement]

---

**CONTACT INTELLIGENCE**

Primary Decision Maker:
Name: [Full Name]
Title: [Job Title]
Email: [Email Address]
Phone: [Phone Number if available]
LinkedIn: [Profile URL if available]
Background: [Relevant experience and tenure]
Authority: [Budget/technical decision scope]

Secondary Contacts:
[Name] - [Title] - [Email] - [Authority Level]
[Name] - [Title] - [Email] - [Authority Level]

---

**RELEVANCE ANALYSIS**

Success Story Match #1: [Score: X/100]
Client: [Customer Name] ([Industry], [Size])
Solution: [Solution Category]
Outcome: [Specific metrics and business impact]
Relevance: [Why this matters to target prospect]

Success Story Match #2: [Score: X/100]
[Brief format for secondary matches]

Success Story Match #3: [Score: X/100]
[Brief format for tertiary matches]

SCORING CRITERIA:
- Industry Match: 40 points
- Pain Point Fit: 30 points  
- Company Profile: 20 points
- Contact Quality: 10 points

Use realistic data and focus on SEP's strengths: custom software development, AI implementation, municipal/enterprise solutions, IoT platforms, and legacy modernization.`;
      
    case 'search':
      return `You are a prospect database search assistant. Help users find and retrieve prospect data.

AVAILABLE DATA:
- ${loadCustomerSuccessStories().length} customer success stories across multiple verticals
- ${loadICPMatrix().length} ICP profiles for target industries
- Prospect intelligence and contact data

For search queries, provide realistic responses based on the available data. Show relevant matches and suggest refinements.`;
      
    case 'upsert':
      return `You are a prospect data management assistant. Help users create, update, or delete prospect records.

OPERATIONS SUPPORTED:
- CREATE: Add new prospect with enrichment data
- UPDATE: Modify existing prospect information  
- DELETE: Remove prospect from database

For data operations, acknowledge the request and show what would be saved/changed. Use realistic prospect data format.`;
      
    default:
      return `You are a strategic advisor for SEP, a consultancy specializing in custom software development, AI implementation, and municipal/enterprise solutions.

SEP's core strengths:
- Custom software development for complex enterprise needs
- AI implementation and workflow automation
- Municipal/government digital transformation
- IoT platform development and connectivity solutions
- Legacy system modernization

Provide helpful insights about business strategy, sales processes, market positioning, and how SEP's capabilities align with market opportunities.`;
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, conversation_history = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // AI Router - Let AI decide what function to call
    const routerPrompt = `You are ProofStack's intelligent command router. Analyze the user's intent and decide which function to execute.

RECENT CONVERSATION:
${conversation_history.slice(-6).map(msg => `${msg.role}: ${msg.content}`).join('\n\n')}

CURRENT USER MESSAGE: "${message}"

AVAILABLE FUNCTIONS:
- ENRICH: Research and analyze a company (when user asks to analyze, research, or enrich a company)
- UPSERT: Save enrichment data to database (when user wants to save, store, or upsert recent company data)
- SEARCH: Query saved prospects database (when user wants to see, find, or search saved prospects)
- CHAT: General conversation (for strategy questions, general advice, etc.)

ROUTING RULES:
- If user says "//enrich [company]" → ENRICH
- If user says "//upsert" or "let's save this" or "looks good, upsert" → UPSERT  
- If user says "//search" or "show prospects" → SEARCH
- Everything else → CHAT

Respond with ONLY one word: ENRICH, UPSERT, SEARCH, or CHAT`;

    // Get AI routing decision
    const routerCompletion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: routerPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.1,
      max_tokens: 20,
    });

    const aiDecision = routerCompletion.choices[0].message.content.trim().toUpperCase();
    console.log('AI Routing Decision:', aiDecision);

    // Execute the appropriate function based on AI decision
    switch (aiDecision) {
      case 'ENRICH':
        return await executeEnrichFunction(message, res);
        
      case 'UPSERT':
        return await executeUpsertFunction(conversation_history, res);
        
      case 'SEARCH':
        return await executeSearchFunction(message, res);
        
      case 'CHAT':
        return await executeChatFunction(message, res);
        
      default:
        // Fallback to chat if AI response is unclear
        return await executeChatFunction(message, res);
    }

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      error: 'Failed to process request',
      details: error.message 
    });
  }
}

// Execute enrichment function
async function executeEnrichFunction(message, res) {
  try {
    // Extract company from message
    const companyMatch = message.match(/(?:enrich|analyze)\s+(.+)/i) || message.match(/\/\/enrich\s+(.+)/i);
    const company = companyMatch ? companyMatch[1].trim() : message.trim();

    const enrichPrompt = `You are a prospect enrichment specialist for SEP, a consultancy specializing in custom software development, AI implementation, and municipal/enterprise solutions.

TASK: Analyze "${company}" and provide structured intelligence.

OUTPUT FORMAT (EXACT):

**COMPANY INTELLIGENCE**

Company: [Company Name]
URL: [Company Website URL]
Industry: [Primary Vertical] | Size: [Employee Count] | Location: [HQ + Markets]
Primary Contact: [Name, Title, Email] 
ProofStack Score: [X/100] - [Hot/Warm/Cool/Research Only]
Proof Statement: "We helped [Similar Company] achieve [Specific Metric] with [Solution Category]. Worth discussing how [Target Company] is tackling similar [Challenge Area] challenges?"

Business Overview:
[Detailed business model and market position analysis]

Pain Points: [Key challenges based on industry]
Initiatives: [Current transformation projects or growth moves]

---

**MARKET CONTEXT**

Industry Position: [Competitive landscape summary]
Growth Drivers: [Business pressures and opportunities]  
Timing Factors: [Why now for potential engagement]

---

**CONTACT INTELLIGENCE**

Primary Decision Maker:
Name: [Full Name]
Title: [Job Title]
Email: [Email Address]
Phone: [Phone Number if available]
LinkedIn: [Profile URL if available]
Background: [Relevant experience and tenure]
Authority: [Budget/technical decision scope]

Secondary Contacts:
[Name] - [Title] - [Email] - [Authority Level]
[Name] - [Title] - [Email] - [Authority Level]

---

**RELEVANCE ANALYSIS**

Success Story Match #1: [Score: X/100]
Client: [Customer Name] ([Industry], [Size])
Solution: [Solution Category]
Outcome: [Specific metrics and business impact]
Relevance: [Why this matters to target prospect]

Success Story Match #2: [Score: X/100]
Success Story Match #3: [Score: X/100]

Make the analysis realistic and specific.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: enrichPrompt },
        { role: 'user', content: `Enrich: ${company}` }
      ],
      temperature: 0.7,
      max_tokens: 2500,
    });

    return res.status(200).json({
      response: completion.choices[0].message.content,
      command_type: 'enrich',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Enrich error:', error);
    return res.status(500).json({
      response: `**ENRICH ERROR**\n\nFailed to analyze company: ${error.message}`,
      command_type: 'enrich',
      timestamp: new Date().toISOString(),
    });
  }
}

// Execute upsert function
async function executeUpsertFunction(conversationHistory, res) {
  try {
    // Find most recent enrichment
    const recentEnrichment = conversationHistory
      .filter(msg => msg.role === 'assistant' && msg.content.includes('**COMPANY INTELLIGENCE**'))
      .pop();

    if (!recentEnrichment) {
      return res.status(200).json({
        response: `**UPSERT ERROR**\n\nNo recent enrichment found. Please enrich a company first, then try saving it.`,
        command_type: 'upsert',
        timestamp: new Date().toISOString(),
      });
    }

    // Extract company name and parse data
    const companyMatch = recentEnrichment.content.match(/Company:\s*([^\n|]+)/i);
    const companyName = companyMatch ? companyMatch[1].trim() : 'Unknown Company';

    // Parse enrichment data
    const prospectData = parseEnrichmentForAirtable(recentEnrichment.content, companyName);

    // Check if prospect already exists
    const existingRecord = await findExistingProspect(companyName);

    let airtableResult;
    let operation;

    if (existingRecord) {
    // Update existing record
    airtableResult = await updateProspect(existingRecord.id, prospectData);
    operation = 'UPDATED';
    } else {
    // Create new record
    airtableResult = await createProspect(prospectData);
    operation = 'CREATED';
    }
    
    return res.status(200).json({
      response: `**PROSPECT SAVED**\n\n✅ Successfully saved "${companyName}" to database!\n\n**Saved Data:**\n- Company: ${prospectData.company}\n- Industry: ${prospectData.industry}\n- Score: ${prospectData.proofstack_score}/100\n- URL: ${prospectData.URL}\n- Contact: ${prospectData['primary_decision_maker.name']}\n- Email: ${prospectData['primary_decision_maker.email']}\n\nRecord ID: ${airtableResult.id}`,
      command_type: 'upsert',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Upsert error:', error);
    return res.status(500).json({
      response: `**UPSERT ERROR**\n\nFailed to save prospect: ${error.message}`,
      command_type: 'upsert',
      timestamp: new Date().toISOString(),
    });
  }
}

// Execute search function
async function executeSearchFunction(message, res) {
  try {
    // Get all prospects
    const prospects = await searchProspects();
    const searchResults = prospects.map(record => ({
      id: record.id,
      ...record.fields
    }));
    
    // Let AI filter and format results based on user query
    const searchPrompt = `You are analyzing a prospect database query. 

USER QUERY: "${message}"

AVAILABLE PROSPECTS:
${searchResults.map((p, i) => `${i+1}. ${p.company || 'Unknown'} - ${p.industry || 'Unknown'} - Score: ${p.proofstack_score || 0}`).join('\n')}

TASK:
1. Filter prospects that match the user's criteria
2. Format results clearly
3. If no matches, say so

Respond with filtered results in this format:
**SEARCH RESULTS**

Found X matching prospects:

[List only the relevant ones with company, industry, score]`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: searchPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    return res.status(200).json({
      response: completion.choices[0].message.content,
      command_type: 'search',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({
      response: `**SEARCH ERROR**\n\nFailed to retrieve prospects: ${error.message}`,
      command_type: 'search',
      timestamp: new Date().toISOString(),
    });
  }
}

// Execute chat function
async function executeChatFunction(message, res) {
  try {
    const chatPrompt = `You are a strategic advisor for SEP, a consultancy specializing in custom software development, AI implementation, and municipal/enterprise solutions. Provide helpful insights about business strategy, sales processes, and market positioning.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: chatPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    return res.status(200).json({
      response: completion.choices[0].message.content,
      command_type: 'conversation',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({
      response: `**CHAT ERROR**\n\nFailed to process message: ${error.message}`,
      command_type: 'conversation',
      timestamp: new Date().toISOString(),
    });
  }
}
// Parse enrichment text into Airtable format
function parseEnrichmentForAirtable(enrichmentText, companyName) {
  try {
    const scoreMatch = enrichmentText.match(/ProofStack Score:\s*(\d+)\/100/);
    const industryMatch = enrichmentText.match(/Industry:\s*([^|]+)/);
    const contactMatch = enrichmentText.match(/Primary Contact:\s*([^,]+),\s*([^,]+),\s*([^\n]+)/);
    const proofStatementMatch = enrichmentText.match(/Proof Statement:\s*"([^"]+)"/);
    const urlMatch = enrichmentText.match(/URL:\s*([^\n\s]+)/i) || enrichmentText.match(/(https?:\/\/[^\s]+)/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
    const industry = industryMatch ? industryMatch[1].trim() : 'Unknown';
    const contactName = contactMatch ? contactMatch[1].trim() : 'Unknown';
    const contactTitle = contactMatch ? contactMatch[2].trim() : 'Unknown';
    const contactEmail = contactMatch ? contactMatch[3].trim() : 'unknown@company.com';
    const proofStatement = proofStatementMatch ? proofStatementMatch[1] : '';
    
    let status = 'Research';
    if (score >= 80) status = 'Hot';
    else if (score >= 60) status = 'Warm';
    else if (score >= 40) status = 'Cool';
    
    return {
      company: companyName,
      industry: industry,
      proofstack_score: score.toString(),
      proof_statement: proofStatement,
      url: urlMatch ? urlMatch[1] : 'Unknown',
      pain_points: 'Legacy system modernization, digital transformation', // Default for now
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
      company_name: companyName,
      industry: 'Unknown',
      enrichment_date: new Date().toISOString().split('T')[0],
      status: 'Research'
    };
  }
}
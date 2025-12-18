/**
 * WEB EXECUTOR
 *
 * Wraps web search and scraping functionality.
 * Extracted from pages/api/chat.js Firecrawl integration.
 */

import OpenAI from 'openai';

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Execute a web search or URL scrape
 * @param {object} params - Search parameters
 * @param {string} params.query - Search query (if not a URL)
 * @param {string} params.url - URL to scrape (if direct scrape)
 * @param {string} params.company_name - Company being researched (for tracking)
 * @param {boolean} params.enrich - If true, auto-scrape top result for structured data
 * @param {number} params.limit - Max search results (default 10)
 * @returns {Promise<object>} Search/scrape results
 */
export async function executeWebSearch(params) {
  const { query, url, company_name, enrich = false, limit = 10 } = params;

  // If a URL is provided, scrape it directly
  if (url) {
    return await scrapeUrl(url, company_name);
  }

  // Check if query contains a URL to scrape
  const urlMatch = query?.match(/(https?:\/\/[^\s]+)/);
  if (urlMatch) {
    return await scrapeUrl(urlMatch[1], company_name);
  }

  // Perform web search
  const searchResults = await searchWeb(query, limit, company_name);

  // If enrichment mode and we got results, scrape the top result for structured data
  if (enrich && searchResults.results && searchResults.results.length > 0) {
    const topResult = searchResults.results[0];
    if (topResult.url) {
      console.log(`[WEB EXECUTOR] Enrichment mode: scraping top result ${topResult.url}`);
      const scrapeResult = await scrapeUrl(topResult.url, company_name);

      // Combine search results with scraped structured data
      return {
        query,
        company_name,
        website_url: topResult.url,
        search_results: searchResults.results.slice(0, 3), // Keep top 3 for reference
        enrichment: scrapeResult.structured || null,
        content_summary: scrapeResult.content || null,
        error: scrapeResult.error || null
      };
    }
  }

  return searchResults;
}

/**
 * Search the web using Firecrawl
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @param {string} companyName - Optional company name for scratchpad tracking
 * @returns {Promise<object>} Search results
 */
async function searchWeb(query, limit = 10, companyName = null) {
  if (!FIRECRAWL_API_KEY) {
    return {
      query,
      results: [],
      error: 'Web search unavailable (no FIRECRAWL_API_KEY configured)'
    };
  }

  try {
    const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`
      },
      body: JSON.stringify({ query, limit })
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      return {
        query,
        results: [],
        error: `Search failed: ${searchResponse.status} - ${errorText}`
      };
    }

    const searchData = await searchResponse.json();
    const results = searchData.data || [];

    if (results.length === 0) {
      return {
        query,
        results: [],
        message: `No results found for: ${query}`
      };
    }

    const formattedResults = {
      query,
      results: results.map((r, i) => ({
        rank: i + 1,
        title: r.title || 'Unknown',
        url: r.url || '',
        snippet: r.description || r.snippet || ''
      })),
      total: results.length
    };

    // If we're researching a specific company, track it in scratchpad
    if (companyName) {
      formattedResults.scratchpad_updates = {
        active_prospect: {
          company_name: companyName,
          status: 'researching',
          data: {
            web_search_results: results.length,
            last_searched: new Date().toISOString()
          }
        }
      };
    }

    return formattedResults;

  } catch (error) {
    console.error('[WEB EXECUTOR] Search error:', error);
    return {
      query,
      results: [],
      error: `Web search failed: ${error.message}`
    };
  }
}

/**
 * Scrape and extract structured data from a URL
 * Returns data matching CRM schema for opportunistic enrichment
 * @param {string} url - URL to scrape
 * @param {string} companyName - Optional company name for context
 * @returns {Promise<object>} Scraped content with structured CRM-ready data
 */
async function scrapeUrl(url, companyName = null) {
  if (!FIRECRAWL_API_KEY) {
    return {
      url,
      content: null,
      error: 'URL scraping unavailable (no FIRECRAWL_API_KEY configured)'
    };
  }

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true
      })
    });

    if (!response.ok) {
      return {
        url,
        content: null,
        error: `Could not scrape ${url}: ${response.status}`
      };
    }

    const data = await response.json();
    const content = data.data?.markdown || '';

    if (!content || content.length < 100) {
      return {
        url,
        content: null,
        message: 'Could not extract meaningful content from URL'
      };
    }

    // Extract structured data matching CRM schema
    const extracted = await extractStructuredData(url, content.substring(0, 6000), companyName);

    return {
      url,
      content: extracted.summary,
      structured: extracted.data,
      raw_length: content.length
    };

  } catch (error) {
    console.error('[WEB EXECUTOR] Scrape error:', error);
    return {
      url,
      content: null,
      error: `Failed to scrape ${url}: ${error.message}`
    };
  }
}

/**
 * Extract structured data from scraped content - matches CRM schema
 * Returns both a summary and CRM-ready structured fields
 * @param {string} url - Source URL
 * @param {string} content - Raw content
 * @param {string} companyName - Optional company name for context
 * @returns {Promise<{summary: string, data: object}>}
 */
async function extractStructuredData(url, content, companyName = null) {
  const prompt = `Extract business information from this website and return as JSON.

URL: ${url}
${companyName ? `Company we're researching: ${companyName}` : ''}
Content: ${content}

Return a JSON object with these fields (use null if not found):
{
  "company_name": "official company name",
  "industry": "industry/sector (e.g., 'Higher Education', 'Professional Services', 'Manufacturing')",
  "description": "1-2 sentence company description",
  "location": "headquarters location (city, state/country)",
  "company_size": "employee count or range if mentioned (e.g., '50-200', '1000+')",
  "services": ["list", "of", "key", "services/products"],
  "contact_email": "general contact email if found",
  "summary": "2-3 sentence summary of what this company does"
}

Be factual - only include what's actually on the page. Return ONLY the JSON.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 800
    });

    const responseText = completion.choices[0].message.content.trim();

    // Parse JSON from response
    let parsed;
    try {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : responseText);
    } catch (e) {
      console.error('[WEB EXECUTOR] JSON parse error:', e.message);
      return {
        summary: responseText,
        data: { company_name: companyName }
      };
    }

    // Separate summary from CRM-ready data
    const { summary, services, ...crmFields } = parsed;

    return {
      summary: summary || parsed.description || 'Company information extracted.',
      data: {
        ...crmFields,
        // Keep services as notes if present
        notes: services ? `Services: ${services.join(', ')}` : null
      }
    };

  } catch (error) {
    console.error('[WEB EXECUTOR] Extraction error:', error);
    return {
      summary: `URL: ${url}\nContent extracted but extraction failed.`,
      data: { company_name: companyName }
    };
  }
}

export default {
  executeWebSearch
};

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
 * @param {string} params.company_name - Company being researched (for scratchpad tracking)
 * @param {number} params.limit - Max search results (default 10)
 * @returns {Promise<object>} Search/scrape results
 */
export async function executeWebSearch(params) {
  const { query, url, company_name, limit = 10 } = params;

  // If a URL is provided, scrape it directly
  if (url) {
    return await scrapeUrl(url);
  }

  // Check if query contains a URL to scrape
  const urlMatch = query?.match(/(https?:\/\/[^\s]+)/);
  if (urlMatch) {
    return await scrapeUrl(urlMatch[1]);
  }

  // Otherwise, perform a web search
  return await searchWeb(query, limit, company_name);
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
 * Scrape and summarize a URL
 * @param {string} url - URL to scrape
 * @returns {Promise<object>} Scraped content summary
 */
async function scrapeUrl(url) {
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

    // Summarize with LLM
    const summary = await summarizeContent(url, content.substring(0, 6000));

    return {
      url,
      content: summary,
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
 * Summarize scraped content using LLM
 * @param {string} url - Source URL
 * @param {string} content - Raw content
 * @returns {Promise<string>} Summary
 */
async function summarizeContent(url, content) {
  const prompt = `Extract key business information from this website:

URL: ${url}
Content: ${content}

Provide a concise summary with:
- Company name and what they do
- Industry
- Location (if found)
- Key services/products
- Any contact info found
- Company size/stage indicators

Be factual - only include what's actually on the page.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 800
    });

    return completion.choices[0].message.content;

  } catch (error) {
    console.error('[WEB EXECUTOR] Summarization error:', error);
    return `URL: ${url}\nContent extracted but summarization failed.`;
  }
}

export default {
  executeWebSearch
};

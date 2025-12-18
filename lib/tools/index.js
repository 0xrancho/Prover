/**
 * TOOL REGISTRY
 *
 * Central registry of all available tools with their schemas.
 * Tools are self-describing - the planner reads these definitions directly.
 *
 * Each tool defines:
 * - name: Tool identifier used in plans
 * - description: What the tool does (shown to LLM)
 * - parameters: JSON Schema for params
 * - examples: Optional usage examples
 */

export const TOOLS = {
  rag_search: {
    name: 'rag_search',
    description: 'Search the knowledge base for case studies, ICP definitions, proof points, and other embedded content. Returns semantically similar chunks.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query'
        },
        chunk_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional filter by chunk type (e.g., "case_study", "icp_definition", "insight_outcome")'
        },
        limit: {
          type: 'number',
          description: 'Max chunks to return (default: 5)'
        }
      },
      required: ['query']
    }
  },

  web_search: {
    name: 'web_search',
    description: 'Search the web and optionally enrich company data. When enrich=true, automatically scrapes the top result and extracts structured CRM-ready data (industry, location, size, description, etc.).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query - include company name (e.g., "Acme Corp")'
        },
        company_name: {
          type: 'string',
          description: 'Company name being researched (required for enrichment)'
        },
        enrich: {
          type: 'boolean',
          description: 'If true, scrapes top result and extracts structured data for CRM. Returns website_url, industry, location, company_size, description. Use this for enrichment tasks.'
        },
        url: {
          type: 'string',
          description: 'Specific URL to scrape instead of searching'
        }
      },
      required: ['query']
    },
    notes: 'With enrich=true, returns: { website_url, enrichment: { industry, location, company_size, description, contact_email }, content_summary }'
  },

  crm_read: {
    name: 'crm_read',
    description: 'Read from the prospects table. Contains companies being tracked for sales with contact info, ICP scores, and status. User terms like "leads", "accounts", "pipeline" typically mean prospects.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max records to return'
        },
        status: {
          type: 'string',
          description: 'Filter by status (e.g., "new", "contacted", "qualified"). Only use if user explicitly mentions status.'
        },
        company_name: {
          type: 'string',
          description: 'Find a specific company by name'
        },
        sortBy: {
          type: 'string',
          description: 'Field to sort by (default: "created_at")'
        },
        sortOrder: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction (default: "desc" = newest first)'
        }
      },
      required: []
    },
    notes: 'Returns: company_name, website_url, industry, company_size, location, contact_name, contact_title, contact_email, score, status, created_at, updated_at'
  },

  crm_write: {
    name: 'crm_write',
    description: 'Create or update a prospect in the CRM. If company_name exists, updates the record; otherwise creates new.',
    parameters: {
      type: 'object',
      properties: {
        company_name: {
          type: 'string',
          description: 'Company name (required, used as identifier)'
        },
        website_url: {
          type: 'string',
          description: 'Company website URL'
        },
        industry: {
          type: 'string',
          description: 'Company industry'
        },
        company_size: {
          type: 'string',
          description: 'Company size (e.g., "50-200", "1000+")'
        },
        location: {
          type: 'string',
          description: 'Company location'
        },
        description: {
          type: 'string',
          description: 'Company description'
        },
        contact_name: {
          type: 'string',
          description: 'Primary contact name'
        },
        contact_title: {
          type: 'string',
          description: 'Primary contact job title'
        },
        contact_email: {
          type: 'string',
          description: 'Primary contact email'
        },
        score: {
          type: 'number',
          description: 'ICP fit score (0-100)'
        },
        score_reason: {
          type: 'string',
          description: 'Explanation of ICP score'
        },
        status: {
          type: 'string',
          description: 'Prospect status (e.g., "new", "contacted", "qualified")'
        },
        notes: {
          type: 'string',
          description: 'Free-form notes'
        }
      },
      required: ['company_name']
    }
  },

  qualify: {
    name: 'qualify',
    description: 'Score a prospect against ICP criteria using the knowledge base. Returns fit score and reasoning.',
    parameters: {
      type: 'object',
      properties: {
        company_name: {
          type: 'string',
          description: 'Company to qualify'
        },
        company_info: {
          type: 'object',
          description: 'Optional additional company data to consider'
        }
      },
      required: ['company_name']
    }
  }
};

/**
 * Format tools for the planner prompt
 * Generates a clean, readable tools section from the schema
 */
export function formatToolsForPrompt() {
  const lines = ['## AVAILABLE TOOLS\n'];

  Object.values(TOOLS).forEach((tool, index) => {
    lines.push(`### ${index + 1}. ${tool.name}`);
    lines.push(tool.description);
    lines.push('');
    lines.push('**Parameters:**');

    const props = tool.parameters.properties || {};
    const required = tool.parameters.required || [];

    if (Object.keys(props).length === 0) {
      lines.push('  None required');
    } else {
      Object.entries(props).forEach(([name, schema]) => {
        const req = required.includes(name) ? ' (required)' : '';
        const type = schema.enum ? schema.enum.join('|') : schema.type;
        lines.push(`  - **${name}**${req}: ${schema.description} [${type}]`);
      });
    }

    if (tool.notes) {
      lines.push('');
      lines.push(`*${tool.notes}*`);
    }

    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Get tool schema by name
 */
export function getTool(name) {
  return TOOLS[name] || null;
}

/**
 * Get all tool names
 */
export function getToolNames() {
  return Object.keys(TOOLS);
}

export default {
  TOOLS,
  formatToolsForPrompt,
  getTool,
  getToolNames
};

/**
 * TOOL REGISTRY
 *
 * Central registry of all available tools with their schemas.
 * CRM tools load their field definitions dynamically from the database.
 *
 * Each tool defines:
 * - name: Tool identifier used in plans
 * - description: What the tool does (shown to LLM)
 * - parameters: JSON Schema for params
 * - dynamic: If true, schema is loaded at runtime
 */

import { getCrmSchemaDescription } from '../executors/crm.js';

// Static tool definitions
const STATIC_TOOLS = {
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
    description: 'Search the web and optionally enrich company data. When enrich=true, automatically scrapes the top result and extracts structured data for the opportunity record.',
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
          description: 'If true, scrapes top result and extracts structured data. Returns all discoverable fields for the opportunity.'
        },
        url: {
          type: 'string',
          description: 'Specific URL to scrape instead of searching'
        }
      },
      required: ['query']
    },
    notes: 'With enrich=true, returns structured data that can be written directly to CRM'
  },

  qualify: {
    name: 'qualify',
    description: 'Score an opportunity against ICP criteria using the knowledge base. Returns fit score and reasoning.',
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

// Dynamic tool definitions (schema loaded at runtime)
const DYNAMIC_TOOLS = {
  crm_read: {
    name: 'crm_read',
    description: 'Read from the opportunities table. Contains companies being tracked with contact info, ICP scores, and status. User terms like "leads", "accounts", "pipeline", "opportunities" refer to this table.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max records to return'
        },
        status: {
          type: 'string',
          description: 'Filter by status. Only use if user explicitly mentions status.'
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
    dynamic: true,
    schemaLoader: getCrmSchemaDescription
  },

  crm_write: {
    name: 'crm_write',
    description: 'Create or update an opportunity in the CRM. Accepts ANY field that exists in the schema. If company_name exists, updates the record; otherwise creates new.',
    parameters: {
      type: 'object',
      properties: {
        company_name: {
          type: 'string',
          description: 'Company name (required, used as identifier)'
        }
        // Additional fields loaded dynamically from schema
      },
      required: ['company_name']
    },
    dynamic: true,
    schemaLoader: getCrmSchemaDescription,
    notes: 'Pass any fields discovered from web_search enrichment or user input. Schema is dynamic - check available fields.'
  }
};

// Combined registry
export const TOOLS = { ...STATIC_TOOLS, ...DYNAMIC_TOOLS };

/**
 * Format tools for the planner prompt
 * Loads dynamic schemas for CRM tools
 */
export async function formatToolsForPrompt() {
  const lines = ['## AVAILABLE TOOLS\n'];

  // Load dynamic schema once
  let crmSchema = null;
  try {
    crmSchema = await getCrmSchemaDescription();
  } catch (e) {
    console.warn('[TOOLS] Could not load CRM schema:', e.message);
    crmSchema = 'Schema unavailable - accept any reasonable fields';
  }

  const allTools = Object.values(TOOLS);

  for (let i = 0; i < allTools.length; i++) {
    const tool = allTools[i];
    lines.push(`### ${i + 1}. ${tool.name}`);
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

    // Add dynamic schema info for CRM tools
    if (tool.dynamic && crmSchema) {
      lines.push('');
      lines.push('**Available Fields (from database schema):**');
      lines.push(crmSchema);
    }

    if (tool.notes) {
      lines.push('');
      lines.push(`*${tool.notes}*`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Synchronous version for cases where async isn't possible
 * Uses static descriptions only
 */
export function formatToolsForPromptSync() {
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
  formatToolsForPromptSync,
  getTool,
  getToolNames
};

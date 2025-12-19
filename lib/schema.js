/**
 * SCHEMA DISCOVERY
 *
 * Dynamically reads table schemas from Supabase.
 * The agent uses this to understand what fields exist and can write to any of them.
 *
 * This enables:
 * - Dynamic field access without hardcoding
 * - Agent awareness of actual database structure
 * - Future: schema evolution (adding columns for new signals)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let adminClient = null;
function getAdmin() {
  if (!adminClient && supabaseUrl && supabaseServiceKey) {
    adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });
  }
  if (!adminClient) {
    throw new Error('Supabase admin client not available');
  }
  return adminClient;
}

// Cache schemas to avoid repeated queries
const schemaCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get column definitions for a table
 * @param {string} tableName - Table to inspect
 * @returns {Promise<object[]>} Array of column definitions
 */
export async function getTableSchema(tableName) {
  const cacheKey = tableName;
  const cached = schemaCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.schema;
  }

  try {
    // Query information_schema for column details
    const { data, error } = await getAdmin()
      .rpc('get_table_columns', { table_name: tableName });

    if (error) {
      console.error('[SCHEMA] Error fetching schema:', error);
      // Fall back to a basic select to infer columns
      return await inferSchemaFromSelect(tableName);
    }

    const schema = data.map(col => ({
      name: col.column_name,
      type: col.data_type,
      nullable: col.is_nullable === 'YES',
      default: col.column_default
    }));

    schemaCache.set(cacheKey, { schema, timestamp: Date.now() });
    return schema;

  } catch (error) {
    console.error('[SCHEMA] Discovery failed:', error);
    return await inferSchemaFromSelect(tableName);
  }
}

/**
 * Fallback: infer schema from a sample row
 */
async function inferSchemaFromSelect(tableName) {
  try {
    const { data, error } = await getAdmin()
      .from(tableName)
      .select('*')
      .limit(1);

    if (error || !data || data.length === 0) {
      console.error('[SCHEMA] Inference failed:', error);
      return [];
    }

    // Infer types from values
    const row = data[0];
    return Object.entries(row).map(([name, value]) => ({
      name,
      type: inferType(value),
      nullable: true,
      default: null
    }));

  } catch (error) {
    console.error('[SCHEMA] Inference error:', error);
    return [];
  }
}

function inferType(value) {
  if (value === null) return 'unknown';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'numeric';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') {
    if (value.match(/^\d{4}-\d{2}-\d{2}/)) return 'timestamp';
    if (value.match(/^[0-9a-f-]{36}$/i)) return 'uuid';
    return 'text';
  }
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'jsonb';
  return 'text';
}

/**
 * Get writable fields for a table (excludes system fields)
 * @param {string} tableName - Table name
 * @returns {Promise<string[]>} List of field names the agent can write to
 */
export async function getWritableFields(tableName) {
  const schema = await getTableSchema(tableName);

  // Exclude system-managed fields
  const systemFields = ['id', 'created_at', 'updated_at', 'workspace_id'];

  return schema
    .filter(col => !systemFields.includes(col.name))
    .map(col => col.name);
}

/**
 * Get field types as a map for validation
 * @param {string} tableName - Table name
 * @returns {Promise<object>} Map of field name to type
 */
export async function getFieldTypes(tableName) {
  const schema = await getTableSchema(tableName);
  return Object.fromEntries(schema.map(col => [col.name, col.type]));
}

/**
 * Format schema for LLM prompt consumption
 * @param {string} tableName - Table name
 * @returns {Promise<string>} Human-readable schema description
 */
export async function formatSchemaForPrompt(tableName) {
  const schema = await getTableSchema(tableName);

  if (schema.length === 0) {
    return `Table "${tableName}": schema unavailable`;
  }

  const systemFields = ['id', 'created_at', 'updated_at', 'workspace_id'];
  const writableFields = schema.filter(col => !systemFields.includes(col.name));

  const fieldList = writableFields.map(col => {
    let desc = `  - ${col.name}: ${col.type}`;
    if (!col.nullable) desc += ' (required)';
    return desc;
  }).join('\n');

  return `Table "${tableName}" fields:\n${fieldList}`;
}

/**
 * Validate data against schema before write
 * @param {string} tableName - Table name
 * @param {object} data - Data to validate
 * @returns {Promise<{valid: boolean, errors: string[], cleaned: object}>}
 */
export async function validateAndClean(tableName, data) {
  const fieldTypes = await getFieldTypes(tableName);
  const errors = [];
  const cleaned = {};

  for (const [key, value] of Object.entries(data)) {
    // Skip system fields
    if (['id', 'created_at', 'updated_at', 'workspace_id'].includes(key)) {
      continue;
    }

    // Check if field exists in schema
    if (!fieldTypes[key]) {
      errors.push(`Unknown field: ${key}`);
      continue;
    }

    // Basic type coercion
    const expectedType = fieldTypes[key];
    cleaned[key] = coerceType(value, expectedType);
  }

  return {
    valid: errors.length === 0,
    errors,
    cleaned
  };
}

function coerceType(value, expectedType) {
  if (value === null || value === undefined) return null;

  switch (expectedType) {
    case 'integer':
    case 'bigint':
      return typeof value === 'number' ? Math.floor(value) : parseInt(value, 10) || null;
    case 'numeric':
    case 'real':
    case 'double precision':
      return typeof value === 'number' ? value : parseFloat(value) || null;
    case 'boolean':
      return Boolean(value);
    case 'jsonb':
    case 'json':
      return typeof value === 'object' ? value : null;
    case 'ARRAY':
    case 'array':
      return Array.isArray(value) ? value : [value];
    default:
      return String(value);
  }
}

/**
 * Clear schema cache (call after schema changes)
 */
export function clearSchemaCache() {
  schemaCache.clear();
}

export default {
  getTableSchema,
  getWritableFields,
  getFieldTypes,
  formatSchemaForPrompt,
  validateAndClean,
  clearSchemaCache
};

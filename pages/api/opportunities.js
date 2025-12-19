/**
 * OPPORTUNITIES API
 *
 * CRUD operations for opportunities in Supabase
 * All operations are workspace-scoped
 */

import {
  getOpportunities,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
  getOpportunityStats
} from '../../lib/opportunities.js';

export default async function handler(req, res) {
  const { method } = req;

  try {
    switch (method) {
      case 'GET':
        return await handleGet(req, res);
      case 'POST':
        return await handlePost(req, res);
      case 'PATCH':
        return await handlePatch(req, res);
      case 'DELETE':
        return await handleDelete(req, res);
      default:
        res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
        return res.status(405).json({ error: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('[OPPORTUNITIES API] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}

/**
 * GET /api/opportunities
 * Query params: workspace_id, status, sort_by, sort_order, limit
 */
async function handleGet(req, res) {
  const {
    workspace_id,
    status,
    sort_by = 'created_at',
    sort_order = 'desc',
    limit = 100,
    stats_only = false
  } = req.query;

  if (!workspace_id) {
    return res.status(400).json({ error: 'workspace_id is required' });
  }

  // If just requesting stats
  if (stats_only === 'true') {
    const stats = await getOpportunityStats(workspace_id);
    return res.status(200).json({ stats });
  }

  const opportunities = await getOpportunities(workspace_id, {
    status: status || undefined,
    sortBy: sort_by,
    sortOrder: sort_order,
    limit: parseInt(limit)
  });

  return res.status(200).json({
    opportunities,
    total: opportunities.length,
    workspace_id
  });
}

/**
 * POST /api/opportunities
 * Body: workspace_id, company_name, ...opportunity data
 */
async function handlePost(req, res) {
  const { workspace_id, ...opportunityData } = req.body;

  if (!workspace_id) {
    return res.status(400).json({ error: 'workspace_id is required' });
  }

  if (!opportunityData.company_name) {
    return res.status(400).json({ error: 'company_name is required' });
  }

  const opportunity = await createOpportunity(workspace_id, opportunityData);

  return res.status(201).json({
    opportunity,
    message: `Created ${opportunity.company_name}`
  });
}

/**
 * PATCH /api/opportunities
 * Body: id, ...fields to update
 */
async function handlePatch(req, res) {
  const { id, ...updateData } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'id is required' });
  }

  const opportunity = await updateOpportunity(id, updateData);

  return res.status(200).json({
    opportunity,
    message: `Updated ${opportunity.company_name}`
  });
}

/**
 * DELETE /api/opportunities
 * Query params: id
 */
async function handleDelete(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'id is required' });
  }

  await deleteOpportunity(id);

  return res.status(200).json({
    message: 'Opportunity deleted',
    id
  });
}

import {
  createWorkspace,
  getWorkspacesForUser,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from '../../lib/supabase';

export default async function handler(req, res) {
  const { method } = req;

  try {
    switch (method) {
      case 'GET': {
        const { user_id, workspace_id } = req.query;

        if (workspace_id) {
          // Get single workspace
          const workspace = await getWorkspace(workspace_id);
          return res.status(200).json({ workspace });
        }

        if (!user_id) {
          return res.status(400).json({ error: 'user_id is required' });
        }

        // Get all workspaces for user
        const workspaces = await getWorkspacesForUser(user_id);
        return res.status(200).json({ workspaces });
      }

      case 'POST': {
        const { user_id, name, website_url } = req.body;

        if (!user_id || !name) {
          return res.status(400).json({ error: 'user_id and name are required' });
        }

        const workspace = await createWorkspace(user_id, name, website_url);
        return res.status(201).json({ workspace });
      }

      case 'PUT': {
        const { workspace_id, name, website_url } = req.body;

        if (!workspace_id) {
          return res.status(400).json({ error: 'workspace_id is required' });
        }

        const updates = {};
        if (name !== undefined) updates.name = name;
        if (website_url !== undefined) updates.website_url = website_url;

        const workspace = await updateWorkspace(workspace_id, updates);
        return res.status(200).json({ workspace });
      }

      case 'DELETE': {
        const { workspace_id } = req.query;

        if (!workspace_id) {
          return res.status(400).json({ error: 'workspace_id is required' });
        }

        await deleteWorkspace(workspace_id);
        return res.status(200).json({ success: true });
      }

      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).json({ error: `Method ${method} not allowed` });
    }
  } catch (error) {
    console.error('Workspaces API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

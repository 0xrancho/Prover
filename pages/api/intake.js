import { processIntakeForWorkspace } from '../../lib/chunker.js';
import { embedChunks } from '../../lib/embeddings.js';
import { insertChunks, deleteChunksForWorkspace, getChunksForWorkspace, countChunksForWorkspace } from '../../lib/supabase.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  // GET: Retrieve chunks for a workspace
  if (req.method === 'GET') {
    try {
      const { workspace_id, doc_type } = req.query;

      if (!workspace_id) {
        return res.status(400).json({ error: 'workspace_id is required' });
      }

      const chunks = await getChunksForWorkspace(workspace_id, doc_type || null);
      const count = await countChunksForWorkspace(workspace_id);

      return res.status(200).json({
        workspace_id,
        total_chunks: count,
        chunks,
      });
    } catch (error) {
      console.error('GET intake error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // DELETE: Clear chunks for a workspace
  if (req.method === 'DELETE') {
    try {
      const { workspace_id, doc_type } = req.query;

      if (!workspace_id) {
        return res.status(400).json({ error: 'workspace_id is required' });
      }

      await deleteChunksForWorkspace(workspace_id, doc_type || null);

      return res.status(200).json({
        success: true,
        message: `Cleared chunks${doc_type ? ` (${doc_type})` : ''}`,
      });
    } catch (error) {
      console.error('DELETE intake error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // POST: Process and store new chunks
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { workspace_id, doc_type, content, format, replace_existing = true } = req.body;

    // Validate required fields
    if (!workspace_id) {
      return res.status(400).json({ error: 'workspace_id is required' });
    }
    if (!doc_type || !['case_study', 'icp'].includes(doc_type)) {
      return res.status(400).json({ error: 'doc_type must be "case_study" or "icp"' });
    }
    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }
    if (!format || !['csv', 'text'].includes(format)) {
      return res.status(400).json({ error: 'format must be "csv" or "text"' });
    }

    // Step 1: Process content into chunks
    console.log(`Processing ${doc_type} for workspace ${workspace_id}...`);
    const chunks = await processIntakeForWorkspace(content, workspace_id, doc_type, format);

    if (chunks.length === 0) {
      return res.status(400).json({ error: 'No valid data found in content' });
    }

    console.log(`Generated ${chunks.length} chunks`);

    // Step 2: Generate embeddings for all chunks
    console.log('Generating embeddings...');
    const chunksWithEmbeddings = await embedChunks(chunks);

    // Step 3: Clear existing chunks if replacing
    if (replace_existing) {
      console.log('Clearing existing chunks...');
      await deleteChunksForWorkspace(workspace_id, doc_type);
    }

    // Step 4: Insert chunks into Supabase
    console.log('Inserting chunks into Supabase...');
    const insertedChunks = await insertChunks(chunksWithEmbeddings);

    // Step 5: Return summary
    const docIds = [...new Set(chunks.map(c => c.doc_id))];
    const chunkTypeCounts = chunks.reduce((acc, c) => {
      acc[c.chunk_type] = (acc[c.chunk_type] || 0) + 1;
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      workspace_id,
      doc_type,
      chunks_created: insertedChunks.length,
      doc_ids: docIds,
      chunk_types: chunkTypeCounts,
    });

  } catch (error) {
    console.error('Intake API error:', error);
    return res.status(500).json({
      error: 'Failed to process intake',
      details: error.message,
    });
  }
}

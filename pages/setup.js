import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../lib/AuthContext';

export default function Setup() {
  const router = useRouter();
  const { user, loading: authLoading, workspace, workspaces, selectWorkspace, refreshWorkspaces } = useAuth();

  // Create workspace form
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceUrl, setNewWorkspaceUrl] = useState('');
  const [creating, setCreating] = useState(false);

  // Data upload state
  const [caseStudyContent, setCaseStudyContent] = useState('');
  const [caseStudyFormat, setCaseStudyFormat] = useState('text');
  const [icpContent, setIcpContent] = useState('');
  const [icpFormat, setIcpFormat] = useState('text');
  const [status, setStatus] = useState({ caseStudy: null, icp: null });
  const [uploading, setUploading] = useState({ caseStudy: false, icp: false });
  const [existingData, setExistingData] = useState(null);
  const [loadingData, setLoadingData] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Fetch existing data when workspace changes
  useEffect(() => {
    if (workspace?.id) {
      fetchExistingData();
    } else {
      setExistingData(null);
    }
  }, [workspace?.id]);

  const fetchExistingData = async () => {
    if (!workspace?.id) return;
    setLoadingData(true);
    try {
      const res = await fetch(`/api/intake?workspace_id=${workspace.id}`);
      if (res.ok) {
        const data = await res.json();
        setExistingData(data);
      }
    } catch (e) {
      console.error('Failed to fetch existing data:', e);
    } finally {
      setLoadingData(false);
    }
  };

  const handleCreateWorkspace = async (e) => {
    e.preventDefault();
    if (!newWorkspaceName.trim() || !user) return;

    setCreating(true);
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          name: newWorkspaceName.trim(),
          website_url: newWorkspaceUrl.trim() || null,
        }),
      });

      if (res.ok) {
        const { workspace: newWs } = await res.json();
        await refreshWorkspaces();
        selectWorkspace(newWs);
        setNewWorkspaceName('');
        setNewWorkspaceUrl('');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create workspace');
      }
    } catch (e) {
      alert('Failed to create workspace: ' + e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateWorkspace = async (websiteUrl) => {
    if (!workspace?.id) return;
    try {
      await fetch('/api/workspaces', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspace.id,
          website_url: websiteUrl,
        }),
      });
      await refreshWorkspaces();
    } catch (e) {
      console.error('Failed to update workspace:', e);
    }
  };

  const handleDeleteWorkspace = async (wsId) => {
    if (!confirm('Delete this workspace and all its data?')) return;

    try {
      const res = await fetch(`/api/workspaces?workspace_id=${wsId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await refreshWorkspaces();
        if (workspace?.id === wsId) {
          selectWorkspace(workspaces.find(w => w.id !== wsId) || null);
        }
      }
    } catch (e) {
      alert('Failed to delete workspace: ' + e.message);
    }
  };

  const handleUpload = async (docType) => {
    const content = docType === 'case_study' ? caseStudyContent : icpContent;
    const format = docType === 'case_study' ? caseStudyFormat : icpFormat;

    if (!workspace?.id) {
      alert('Please select or create a workspace first');
      return;
    }
    if (!content.trim()) {
      alert(`Please enter ${docType === 'case_study' ? 'Case Study' : 'ICP'} content`);
      return;
    }

    const key = docType === 'case_study' ? 'caseStudy' : 'icp';
    setUploading(prev => ({ ...prev, [key]: true }));
    setStatus(prev => ({ ...prev, [key]: null }));

    try {
      const res = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspace.id,
          doc_type: docType,
          content,
          format,
          replace_existing: true,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus(prev => ({
          ...prev,
          [key]: {
            success: true,
            message: `${data.chunks_created} chunks created from ${data.doc_ids.length} document(s)`,
          },
        }));
        fetchExistingData();
        if (docType === 'case_study') setCaseStudyContent('');
        else setIcpContent('');
      } else {
        setStatus(prev => ({
          ...prev,
          [key]: { success: false, message: data.error || 'Upload failed' },
        }));
      }
    } catch (e) {
      setStatus(prev => ({
        ...prev,
        [key]: { success: false, message: e.message },
      }));
    } finally {
      setUploading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleClearData = async (docType = null) => {
    if (!workspace?.id) return;

    const confirmMsg = docType
      ? `Clear all ${docType.replace('_', ' ')} data?`
      : `Clear ALL data for this workspace?`;

    if (!confirm(confirmMsg)) return;

    try {
      const url = docType
        ? `/api/intake?workspace_id=${workspace.id}&doc_type=${docType}`
        : `/api/intake?workspace_id=${workspace.id}`;

      const res = await fetch(url, { method: 'DELETE' });
      if (res.ok) {
        fetchExistingData();
      }
    } catch (e) {
      alert('Failed to clear data: ' + e.message);
    }
  };

  // Parse existing data
  const getLoadedDataSummary = () => {
    if (!existingData || !existingData.chunks || existingData.chunks.length === 0) {
      return null;
    }

    const caseStudies = {};
    const icpChunks = [];

    existingData.chunks.forEach(chunk => {
      if (chunk.doc_type === 'case_study') {
        if (!caseStudies[chunk.doc_id]) {
          caseStudies[chunk.doc_id] = {
            name: chunk.doc_id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            chunks: [],
            metadata: chunk.metadata || {}
          };
        }
        caseStudies[chunk.doc_id].chunks.push(chunk);
      } else if (chunk.doc_type === 'icp') {
        icpChunks.push(chunk);
      }
    });

    return {
      caseStudies: Object.values(caseStudies),
      icpChunks,
      totalChunks: existingData.total_chunks
    };
  };

  const loadedData = getLoadedDataSummary();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#d5d5d5' }}>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen" style={{ background: '#d5d5d5' }}>
      <Head>
        <title>Prover Setup</title>
      </Head>

      <div className="max-w-4xl mx-auto p-6">
        <header className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-black mb-2 font-jetbrains">
              Prover Setup
            </h1>
            <p className="text-gray-600">
              Manage workspaces and knowledge base.
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">{user.email}</p>
            <button
              onClick={() => router.push('/')}
              className="text-sm text-gray-500 hover:text-black"
            >
              ← Back to Prover
            </button>
          </div>
        </header>

        {/* WORKSPACES SECTION */}
        <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Workspaces</h2>

          {/* Workspace List */}
          {workspaces.length > 0 && (
            <div className="space-y-2 mb-4">
              {workspaces.map(ws => (
                <div
                  key={ws.id}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    workspace?.id === ws.id
                      ? 'bg-blue-900/30 border-blue-500'
                      : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                  }`}
                  onClick={() => selectWorkspace(ws)}
                >
                  <div>
                    <span className="font-medium text-white">{ws.name}</span>
                    {ws.website_url && (
                      <span className="text-xs text-gray-500 ml-2">{ws.website_url}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {workspace?.id === ws.id && (
                      <span className="text-xs text-blue-400">Active</span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteWorkspace(ws.id);
                      }}
                      className="text-xs text-red-400 hover:text-red-300 px-2"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create Workspace Form */}
          <form onSubmit={handleCreateWorkspace} className="border-t border-gray-700 pt-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Create New Workspace</h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="Workspace name"
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="url"
                value={newWorkspaceUrl}
                onChange={(e) => setNewWorkspaceUrl(e.target.value)}
                placeholder="Website URL (optional)"
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={creating || !newWorkspaceName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>

        {/* WORKSPACE SETTINGS (if workspace selected) */}
        {workspace && (
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Workspace: {workspace.name}
            </h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Website URL
              </label>
              <input
                type="url"
                value={workspace.website_url || ''}
                onChange={(e) => handleUpdateWorkspace(e.target.value)}
                placeholder="https://yourcompany.com"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Used to enhance understanding of your ICP and services when answering queries.
              </p>
            </div>
          </div>
        )}

        {/* LOADED DATA SECTION */}
        {workspace && (
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-white">Loaded Data</h2>
              {loadingData && (
                <span className="text-sm text-gray-400">Loading...</span>
              )}
            </div>

            {!loadedData ? (
              <div className="text-center py-8">
                <p className="text-gray-400 mb-4">No data loaded in this workspace</p>
                <p className="text-sm text-gray-500">Upload case studies and ICP definition below.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Case Studies */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-200">
                      Case Studies ({loadedData.caseStudies.length})
                    </h3>
                    {loadedData.caseStudies.length > 0 && (
                      <button
                        onClick={() => handleClearData('case_study')}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {loadedData.caseStudies.length > 0 ? (
                    <div className="grid gap-2">
                      {loadedData.caseStudies.map((cs, i) => (
                        <div key={i} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-white">{cs.name}</span>
                            <span className="text-xs text-gray-500">{cs.chunks.length} chunks</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {[...new Set(cs.chunks.map(c => c.chunk_type))].map(type => (
                              <span key={type} className="text-xs px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded border border-blue-800">
                                {type.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No case studies loaded</p>
                  )}
                </div>

                {/* ICP Definition */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-200">
                      ICP Definition ({loadedData.icpChunks.length} chunks)
                    </h3>
                    {loadedData.icpChunks.length > 0 && (
                      <button
                        onClick={() => handleClearData('icp')}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {loadedData.icpChunks.length > 0 ? (
                    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                      <div className="flex flex-wrap gap-1 mb-2">
                        {[...new Set(loadedData.icpChunks.map(c => c.chunk_type))].map(type => (
                          <span key={type} className="text-xs px-2 py-0.5 bg-green-900/50 text-green-400 rounded border border-green-800">
                            {type.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                      {loadedData.icpChunks.slice(0, 1).map((chunk, i) => (
                        <p key={i} className="text-sm text-gray-400 line-clamp-2">
                          {chunk.content.substring(0, 150)}...
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No ICP definition loaded</p>
                  )}
                </div>

                {/* Total */}
                <div className="pt-3 border-t border-gray-700 flex justify-between items-center">
                  <span className="text-sm text-gray-400">
                    Total: {loadedData.totalChunks} chunks indexed
                  </span>
                  <a
                    href="/"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500"
                  >
                    Start Using Prover
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ADD DATA SECTION */}
        {workspace && (
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">Add Data</h2>

            {/* Case Studies Upload */}
            <div className="mb-6">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-medium text-gray-200">Case Studies</h3>
                  <p className="text-sm text-gray-500">Your client success stories for proof point matching</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCaseStudyFormat('text')}
                    className={`px-3 py-1 text-xs rounded border ${caseStudyFormat === 'text' ? 'border-blue-500 text-blue-400' : 'border-gray-600 text-gray-500'}`}
                  >
                    Text
                  </button>
                  <button
                    onClick={() => setCaseStudyFormat('csv')}
                    className={`px-3 py-1 text-xs rounded border ${caseStudyFormat === 'csv' ? 'border-blue-500 text-blue-400' : 'border-gray-600 text-gray-500'}`}
                  >
                    CSV
                  </button>
                </div>
              </div>

              {/* File Upload */}
              <div className="mb-2">
                <label className="flex items-center justify-center w-full h-12 border border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-gray-500 transition-colors">
                  <input
                    type="file"
                    accept={caseStudyFormat === 'csv' ? '.csv' : '.txt,.md'}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setCaseStudyContent(ev.target?.result || '');
                        };
                        reader.readAsText(file);
                      }
                    }}
                    className="hidden"
                  />
                  <span className="text-gray-400 text-sm">
                    Click to upload {caseStudyFormat === 'csv' ? '.csv' : '.txt/.md'} file
                  </span>
                </label>
              </div>

              <textarea
                value={caseStudyContent}
                onChange={(e) => setCaseStudyContent(e.target.value)}
                placeholder={caseStudyFormat === 'csv'
                  ? 'Or paste CSV with headers: company_name, buyer_name, trigger_event, key_insight, outcome, match_signals...'
                  : 'Or paste case study narratives. Include company details, buyer info, trigger, deliverables, key insight, outcome, differentiator, and match signals.'}
                className="w-full h-32 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
              />

              <div className="flex justify-end mt-2">
                <button
                  onClick={() => handleUpload('case_study')}
                  disabled={uploading.caseStudy || !caseStudyContent}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading.caseStudy ? 'Processing...' : 'Upload Case Studies'}
                </button>
              </div>

              {status.caseStudy && (
                <div className={`mt-2 p-2 rounded text-sm ${status.caseStudy.success ? 'bg-green-900/50 text-green-400 border border-green-800' : 'bg-red-900/50 text-red-400 border border-red-800'}`}>
                  {status.caseStudy.message}
                </div>
              )}
            </div>

            {/* ICP Upload */}
            <div>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-medium text-gray-200">ICP Definition</h3>
                  <p className="text-sm text-gray-500">Your ideal customer profile for fit scoring</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIcpFormat('text')}
                    className={`px-3 py-1 text-xs rounded border ${icpFormat === 'text' ? 'border-blue-500 text-blue-400' : 'border-gray-600 text-gray-500'}`}
                  >
                    Text
                  </button>
                  <button
                    onClick={() => setIcpFormat('csv')}
                    className={`px-3 py-1 text-xs rounded border ${icpFormat === 'csv' ? 'border-blue-500 text-blue-400' : 'border-gray-600 text-gray-500'}`}
                  >
                    CSV
                  </button>
                </div>
              </div>

              {/* File Upload */}
              <div className="mb-2">
                <label className="flex items-center justify-center w-full h-12 border border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-gray-500 transition-colors">
                  <input
                    type="file"
                    accept={icpFormat === 'csv' ? '.csv' : '.txt,.md'}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setIcpContent(ev.target?.result || '');
                        };
                        reader.readAsText(file);
                      }
                    }}
                    className="hidden"
                  />
                  <span className="text-gray-400 text-sm">
                    Click to upload {icpFormat === 'csv' ? '.csv' : '.txt/.md'} file
                  </span>
                </label>
              </div>

              <textarea
                value={icpContent}
                onChange={(e) => setIcpContent(e.target.value)}
                placeholder="Or describe your ideal customer profile. Include: who fits, who doesn't fit, and the buyer persona you target."
                className="w-full h-24 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
              />

              <div className="flex justify-end mt-2">
                <button
                  onClick={() => handleUpload('icp')}
                  disabled={uploading.icp || !icpContent}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading.icp ? 'Processing...' : 'Upload ICP'}
                </button>
              </div>

              {status.icp && (
                <div className={`mt-2 p-2 rounded text-sm ${status.icp.success ? 'bg-green-900/50 text-green-400 border border-green-800' : 'bg-red-900/50 text-red-400 border border-red-800'}`}>
                  {status.icp.message}
                </div>
              )}
            </div>
          </div>
        )}

        {/* No workspace selected prompt */}
        {!workspace && workspaces.length === 0 && (
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-8 text-center">
            <p className="text-gray-400 mb-2">Create a workspace to get started</p>
            <p className="text-sm text-gray-500">Each workspace contains its own case studies and ICP data.</p>
          </div>
        )}
      </div>
    </div>
  );
}

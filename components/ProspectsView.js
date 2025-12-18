/**
 * PROSPECTS VIEW
 *
 * Inline view showing prospects in table or kanban format
 * Replaces the slide-out panel with an in-place view
 */

import { useState, useEffect } from 'react';

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

const STATUS_COLORS = {
  new: 'bg-gray-600',
  contacted: 'bg-blue-600',
  qualified: 'bg-yellow-600',
  proposal: 'bg-purple-600',
  won: 'bg-green-600',
  lost: 'bg-red-600'
};

export default function ProspectsView({ workspaceId, onEnrich }) {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('table'); // 'table' | 'kanban'
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    if (workspaceId) {
      fetchProspects();
    }
  }, [workspaceId, sortBy, sortOrder]);

  const fetchProspects = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/prospects?workspace_id=${workspaceId}&sort_by=${sortBy}&sort_order=${sortOrder}`
      );
      const data = await res.json();
      setProspects(data.prospects || []);
    } catch (error) {
      console.error('Failed to fetch prospects:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, newStatus) => {
    try {
      await fetch('/api/prospects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus })
      });
      setProspects(prev =>
        prev.map(p => (p.id === id ? { ...p, status: newStatus } : p))
      );
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const deleteProspect = async (id) => {
    if (!confirm('Delete this prospect?')) return;
    try {
      await fetch(`/api/prospects?id=${id}`, { method: 'DELETE' });
      setProspects(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  return (
    <div className="border border-gray-700 rounded-2xl bg-gray-900 min-h-[60vh]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white">Prospects</h2>
          <span className="text-sm text-gray-400">({prospects.length})</span>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setView('table')}
              className={`px-3 py-1 text-xs rounded ${
                view === 'table' ? 'bg-gray-700 text-white' : 'text-gray-400'
              }`}
            >
              Table
            </button>
            <button
              onClick={() => setView('kanban')}
              className={`px-3 py-1 text-xs rounded ${
                view === 'kanban' ? 'bg-gray-700 text-white' : 'text-gray-400'
              }`}
            >
              Kanban
            </button>
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-gray-800 text-gray-300 text-xs rounded px-2 py-1 border border-gray-700"
          >
            <option value="created_at">Date</option>
            <option value="score">Score</option>
            <option value="company_name">Name</option>
            <option value="status">Status</option>
          </select>

          {/* Refresh */}
          <button
            onClick={fetchProspects}
            className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-800"
            title="Refresh"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-gray-400">Loading...</div>
          </div>
        ) : prospects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4 opacity-50">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p className="text-lg">No prospects yet</p>
            <p className="text-sm mt-1 text-gray-500">Create leads through the Chat view</p>
          </div>
        ) : view === 'table' ? (
          <TableView
            prospects={prospects}
            onUpdateStatus={updateStatus}
            onDelete={deleteProspect}
            onEnrich={onEnrich}
          />
        ) : (
          <KanbanView
            prospects={prospects}
            onUpdateStatus={updateStatus}
            onDelete={deleteProspect}
            onEnrich={onEnrich}
          />
        )}
      </div>
    </div>
  );
}

function TableView({ prospects, onUpdateStatus, onDelete, onEnrich }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-700">
            <th className="pb-3 font-medium">Company</th>
            <th className="pb-3 font-medium">Contact</th>
            <th className="pb-3 font-medium">Industry</th>
            <th className="pb-3 font-medium">Score</th>
            <th className="pb-3 font-medium">Status</th>
            <th className="pb-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {prospects.map((p) => (
            <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/50">
              <td className="py-3">
                <div className="font-medium text-white">{p.company_name}</div>
                {p.website_url && (
                  <a
                    href={p.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:underline"
                  >
                    {p.website_url.replace(/https?:\/\//, '').substring(0, 30)}
                  </a>
                )}
              </td>
              <td className="py-3">
                <div className="text-gray-300">{p.contact_name || '-'}</div>
                {p.contact_title && (
                  <div className="text-xs text-gray-500">{p.contact_title}</div>
                )}
              </td>
              <td className="py-3">
                <span className="text-gray-400 text-xs">{p.industry || '-'}</span>
              </td>
              <td className="py-3">
                <span className={`font-medium ${
                  p.score >= 70 ? 'text-green-400' :
                  p.score >= 40 ? 'text-yellow-400' : 'text-gray-400'
                }`}>
                  {p.score || 0}
                </span>
              </td>
              <td className="py-3">
                <select
                  value={p.status}
                  onChange={(e) => onUpdateStatus(p.id, e.target.value)}
                  className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[p.status]} text-white border-0 cursor-pointer`}
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </td>
              <td className="py-3">
                <div className="flex gap-1">
                  <button
                    onClick={() => onEnrich(p.company_name)}
                    className="p-1.5 text-gray-400 hover:text-blue-400 rounded hover:bg-gray-700"
                    title="Enrich"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.35-4.35" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDelete(p.id)}
                    className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-700"
                    title="Delete"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KanbanView({ prospects, onUpdateStatus, onDelete, onEnrich }) {
  const columns = STATUS_OPTIONS.slice(0, 4); // Show first 4 statuses

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map(status => {
        const items = prospects.filter(p => p.status === status);
        return (
          <div key={status} className="flex-shrink-0 w-60">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[status]}`} />
              <span className="text-sm font-medium text-gray-300 capitalize">{status}</span>
              <span className="text-xs text-gray-500">({items.length})</span>
            </div>

            <div className="space-y-2">
              {items.map(p => (
                <div
                  key={p.id}
                  className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-gray-600 transition-colors"
                >
                  <div className="font-medium text-white text-sm">{p.company_name}</div>
                  {p.contact_name && (
                    <div className="text-xs text-gray-400 mt-1">{p.contact_name}</div>
                  )}
                  {p.industry && (
                    <div className="text-xs text-gray-500 mt-0.5">{p.industry}</div>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <span className={`text-xs font-medium ${
                      p.score >= 70 ? 'text-green-400' :
                      p.score >= 40 ? 'text-yellow-400' : 'text-gray-500'
                    }`}>
                      Score: {p.score || 0}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => onEnrich(p.company_name)}
                        className="p-1 text-gray-500 hover:text-blue-400"
                        title="Enrich"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8" />
                          <path d="M21 21l-4.35-4.35" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onDelete(p.id)}
                        className="p-1 text-gray-500 hover:text-red-400"
                        title="Delete"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="text-center py-8 text-gray-600 text-xs">
                  No prospects
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * OPPORTUNITIES PANEL
 *
 * Collapsible panel showing opportunities in table or kanban view
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

export default function OpportunitiesPanel({ workspaceId, isOpen, onClose, onEnrich }) {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('table'); // 'table' | 'kanban'
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    if (isOpen && workspaceId) {
      fetchOpportunities();
    }
  }, [isOpen, workspaceId, sortBy, sortOrder]);

  const fetchOpportunities = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/opportunities?workspace_id=${workspaceId}&sort_by=${sortBy}&sort_order=${sortOrder}`
      );
      const data = await res.json();
      setOpportunities(data.opportunities || []);
    } catch (error) {
      console.error('Failed to fetch opportunities:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, newStatus) => {
    try {
      await fetch('/api/opportunities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus })
      });
      setOpportunities(prev =>
        prev.map(p => (p.id === id ? { ...p, status: newStatus } : p))
      );
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const deleteOpportunity = async (id) => {
    if (!confirm('Delete this opportunity?')) return;
    try {
      await fetch(`/api/opportunities?id=${id}`, { method: 'DELETE' });
      setOpportunities(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-gray-900 border-l border-gray-700 shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white">Opportunities</h2>
          <span className="text-sm text-gray-400">({opportunities.length})</span>
        </div>

        <div className="flex items-center gap-2">
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

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-400">Loading...</div>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <p>No opportunities yet</p>
            <p className="text-sm mt-1">Create leads through chat</p>
          </div>
        ) : view === 'table' ? (
          <TableView
            opportunities={opportunities}
            onUpdateStatus={updateStatus}
            onDelete={deleteOpportunity}
            onEnrich={onEnrich}
          />
        ) : (
          <KanbanView
            opportunities={opportunities}
            onUpdateStatus={updateStatus}
            onDelete={deleteOpportunity}
            onEnrich={onEnrich}
          />
        )}
      </div>
    </div>
  );
}

function TableView({ opportunities, onUpdateStatus, onDelete, onEnrich }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-400 border-b border-gray-700">
          <th className="pb-2">Company</th>
          <th className="pb-2">Contact</th>
          <th className="pb-2">Score</th>
          <th className="pb-2">Status</th>
          <th className="pb-2"></th>
        </tr>
      </thead>
      <tbody>
        {opportunities.map((p) => (
          <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/50">
            <td className="py-3">
              <div className="font-medium text-white">{p.company_name}</div>
              {p.industry && (
                <div className="text-xs text-gray-500">{p.industry}</div>
              )}
            </td>
            <td className="py-3">
              <div className="text-gray-300">{p.contact_name || '-'}</div>
              {p.contact_title && (
                <div className="text-xs text-gray-500">{p.contact_title}</div>
              )}
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
                className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[p.status]} text-white border-0`}
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
                  className="p-1 text-gray-400 hover:text-blue-400"
                  title="Enrich"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                </button>
                <button
                  onClick={() => onDelete(p.id)}
                  className="p-1 text-gray-400 hover:text-red-400"
                  title="Delete"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function KanbanView({ opportunities, onUpdateStatus, onDelete, onEnrich }) {
  const columns = STATUS_OPTIONS.slice(0, 4); // Show first 4 statuses

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map(status => {
        const items = opportunities.filter(p => p.status === status);
        return (
          <div key={status} className="flex-shrink-0 w-56">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[status]}`} />
              <span className="text-sm font-medium text-gray-300 capitalize">{status}</span>
              <span className="text-xs text-gray-500">({items.length})</span>
            </div>

            <div className="space-y-2">
              {items.map(p => (
                <div
                  key={p.id}
                  className="bg-gray-800 rounded-lg p-3 border border-gray-700"
                >
                  <div className="font-medium text-white text-sm">{p.company_name}</div>
                  {p.contact_name && (
                    <div className="text-xs text-gray-400 mt-1">{p.contact_name}</div>
                  )}
                  <div className="flex items-center justify-between mt-2">
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
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8" />
                          <path d="M21 21l-4.35-4.35" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { useState } from 'react';

export default function ListPreview({
  items = [],
  onSave,
  onEnrich,
  onRefine,
  loading = false,
  criteria = null
}) {
  const [selectedIds, setSelectedIds] = useState(new Set(items.map(i => i.id)));
  const [listName, setListName] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);

  const toggleSelect = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.id)));
    }
  };

  const handleSave = () => {
    if (!listName.trim()) {
      setShowNameInput(true);
      return;
    }
    onSave?.(Array.from(selectedIds), listName);
    setShowNameInput(false);
  };

  const handleEnrich = () => {
    const selectedItems = items.filter(i => selectedIds.has(i.id));
    const companyNames = selectedItems.map(i => i.doc_id || i.company);
    onEnrich?.(companyNames);
  };

  if (items.length === 0) {
    return (
      <div className="list-preview-empty p-6 text-center text-gray-500">
        No matches found. Try adjusting your search criteria.
      </div>
    );
  }

  return (
    <div className="list-preview bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="list-preview-header p-4 border-b border-gray-700 flex justify-between items-center">
        <div>
          <span className="text-white font-medium">{items.length} matches</span>
          <span className="text-gray-400 ml-2">
            ({selectedIds.size} selected)
          </span>
        </div>
        <button
          onClick={toggleAll}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          {selectedIds.size === items.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      {/* Criteria summary */}
      {criteria && criteria.summary && (
        <div className="p-3 bg-gray-800 border-b border-gray-700 text-sm">
          <span className="text-gray-400">Matching: </span>
          <span className="text-green-400">{criteria.summary}</span>
        </div>
      )}

      {/* Items */}
      <div className="list-preview-items max-h-64 overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => toggleSelect(item.id)}
            className={`
              list-preview-item p-3 border-b border-gray-800 cursor-pointer
              hover:bg-gray-800 transition-colors
              ${selectedIds.has(item.id) ? 'bg-gray-800' : ''}
            `}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => toggleSelect(item.id)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">
                    {item.doc_id || item.company || 'Unknown'}
                  </span>
                  {item.similarity && (
                    <span className="text-xs px-2 py-0.5 rounded bg-green-900 text-green-300">
                      {item.similarity}% match
                    </span>
                  )}
                  {item.source && (
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                      {item.source}
                    </span>
                  )}
                </div>
                {item.match_reason && (
                  <p className="text-gray-400 text-sm mt-1 truncate">
                    {item.match_reason}
                  </p>
                )}
                {item.industry && (
                  <p className="text-gray-500 text-xs mt-1">
                    {item.industry}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="list-preview-actions p-4 border-t border-gray-700 space-y-3">
        {showNameInput && (
          <div className="flex gap-2">
            <input
              type="text"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="Name this list..."
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm"
              autoFocus
            />
            <button
              onClick={handleSave}
              disabled={!listName.trim() || loading}
              className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setShowNameInput(false)}
              className="px-4 py-2 bg-gray-700 text-white rounded text-sm hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        )}

        {!showNameInput && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowNameInput(true)}
              disabled={selectedIds.size === 0 || loading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Save List ({selectedIds.size})
            </button>
            <button
              onClick={handleEnrich}
              disabled={selectedIds.size === 0 || loading}
              className="flex-1 px-4 py-2 bg-orange-600 text-white rounded font-medium hover:bg-orange-700 disabled:opacity-50"
            >
              Enrich ({selectedIds.size})
            </button>
          </div>
        )}

        {onRefine && (
          <button
            onClick={onRefine}
            disabled={loading}
            className="w-full px-4 py-2 bg-gray-700 text-gray-300 rounded text-sm hover:bg-gray-600 disabled:opacity-50"
          >
            Refine Search
          </button>
        )}
      </div>
    </div>
  );
}

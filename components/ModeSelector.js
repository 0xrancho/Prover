import { useEffect } from 'react';

const MODES = [
  {
    id: 'ask',
    label: 'Ask',
    shortcut: '1',
    description: 'Query your knowledge base',
    color: 'blue',
    icon: '?',
    placeholder: 'Ask about prospects, proof points, ICP fit...'
  },
  {
    id: 'build',
    label: 'Build',
    shortcut: '2',
    description: 'Create prospect lists',
    color: 'green',
    icon: '+',
    placeholder: 'Build a list of companies like SimpleIT...'
  },
  {
    id: 'enrich',
    label: 'Enrich',
    shortcut: '3',
    description: 'Add external data',
    color: 'orange',
    icon: '↑',
    placeholder: 'Enrich Acme Corp with contact data...'
  }
];

export default function ModeSelector({ activeMode, onModeChange, disabled = false }) {
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (disabled) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const mode = MODES.find(m => m.shortcut === e.key);
      if (mode) {
        e.preventDefault();
        onModeChange(mode.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, onModeChange]);

  return (
    <div className="mode-selector flex gap-2">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          onClick={() => onModeChange(mode.id)}
          disabled={disabled}
          className={`
            mode-btn px-4 py-2 rounded-lg font-medium transition-all
            ${activeMode === mode.id
              ? `mode-${mode.color}-active`
              : 'mode-inactive'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          title={`${mode.description} (Press ${mode.shortcut})`}
        >
          <span className="mode-icon mr-1">{mode.icon}</span>
          <span>{mode.label}</span>
          <span className="mode-shortcut ml-2 text-xs opacity-60">{mode.shortcut}</span>
        </button>
      ))}
    </div>
  );
}

export function getModeConfig(modeId) {
  return MODES.find(m => m.id === modeId) || MODES[0];
}

export { MODES };

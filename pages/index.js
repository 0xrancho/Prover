import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import ListPreview from '../components/ListPreview';
import OpportunitiesView from '../components/OpportunitiesView';
import { useAuth } from '../lib/AuthContext';

const MODES = {
  ask: { label: 'Ask', description: 'Search your knowledge base' },
  build: { label: 'Build', description: 'Create leads and lists' },
  enrich: { label: 'Enrich', description: 'Add external data' }
};

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, workspace, workspaces, selectWorkspace, signOut } = useAuth();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('ask');
  const [buildPreview, setBuildPreview] = useState(null);
  const [pendingLead, setPendingLead] = useState(null);
  const [activeView, setActiveView] = useState('chat'); // 'chat' | 'opportunities'
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);


  const sendMessage = async () => {
    if (!input.trim()) return;

    if (!workspace) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Please set up a workspace first. Go to Setup to create one and upload your data.',
        isError: true
      }]);
      return;
    }

    const userInput = input.trim();
    const userMessage = { role: 'user', content: userInput };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Check if this is a confirmation for a pending lead
      if (pendingLead) {
        const confirmWords = ['save', 'yes', 'confirm', 'ok', 'ready', 'do it', 'go ahead'];
        const cancelWords = ['cancel', 'no', 'nevermind', 'stop'];
        const inputLower = userInput.toLowerCase();

        if (confirmWords.some(w => inputLower.includes(w))) {
          // Save the lead
          await savePendingLead(pendingLead);
          return;
        } else if (cancelWords.some(w => inputLower.includes(w))) {
          setPendingLead(null);
          setMessages(prev => [...prev, { role: 'assistant', content: 'Cancelled. What else can I help with?' }]);
          setLoading(false);
          return;
        } else {
          // Treat as additional notes
          const updatedLead = { ...pendingLead, notes: userInput };
          setPendingLead(updatedLead);
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Added notes. Ready to save ${updatedLead.company_name}?`
          }]);
          setLoading(false);
          return;
        }
      }

      setBuildPreview(null);

      // All messages go through unified /api/chat
      // Mode is passed as a hint to bias LLM function selection
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userInput,
          mode: mode,  // 'ask' | 'build' | 'enrich' - biases function selection
          workspace_id: workspace.id,
          conversation_history: messages.slice(-6).map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Unified response handling
      const aiMessage = {
        role: 'assistant',
        content: data.response,
        commandType: data.command_type
      };
      setMessages(prev => [...prev, aiMessage]);

    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}`,
        isError: true
      }]);
    } finally {
      setLoading(false);
    }
  };

  // Save a pending lead to CRM (used by confirmation flow)
  const savePendingLead = async (leadData) => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Save the lead: ${leadData.company_name}`,
          mode: 'build',
          workspace_id: workspace.id,
          conversation_history: messages.slice(-6).map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      const data = await response.json();
      setPendingLead(null);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || `Saved ${leadData.company_name} to CRM.`
      }]);
    } catch (error) {
      console.error('Save error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Failed to save: ${error.message}`,
        isError: true
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSaveList = async (selectedIds, listName) => {
    if (!workspace) return;
    setLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Save these prospects as list "${listName}": ${selectedIds.join(', ')}`,
          mode: 'build',
          workspace_id: workspace.id,
          conversation_history: messages.slice(-6).map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });
      const data = await response.json();

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || `List "${listName}" saved.`
      }]);
      setBuildPreview(null);
    } catch (e) {
      console.error('Save error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleEnrichFromPreview = async (companyNames) => {
    if (!workspace) return;
    setMode('enrich');
    setLoading(true);
    setBuildPreview(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Enrich these companies: ${companyNames.join(', ')}`,
          mode: 'enrich',
          workspace_id: workspace.id,
          conversation_history: messages.slice(-6).map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });
      const data = await response.json();

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || `Enriched ${companyNames.length} prospect(s).`
      }]);
    } catch (e) {
      console.error('Enrich error:', e);
    } finally {
      setLoading(false);
    }
  };

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
        <title>Prover</title>
      </Head>

      <div className={`mx-auto p-4 pt-8 ${activeView === 'opportunities' ? 'max-w-6xl' : 'max-w-3xl'}`}>
        {/* Header */}
        <header className="mb-6 flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-black font-jetbrains">
                Prover
              </h1>
              <p className="text-gray-600 text-sm mt-1">
                {workspace ? workspace.name : 'No workspace selected'}
              </p>
            </div>
            {/* View Toggle */}
            {workspace && (
              <div className="flex bg-gray-800 rounded-lg p-1">
                <button
                  onClick={() => setActiveView('chat')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    activeView === 'chat'
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Chat
                </button>
                <button
                  onClick={() => setActiveView('opportunities')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    activeView === 'opportunities'
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M9 21V9" />
                  </svg>
                  Opportunities
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            {/* Workspace Selector */}
            {workspaces.length > 1 && (
              <select
                value={workspace?.id || ''}
                onChange={(e) => {
                  const ws = workspaces.find(w => w.id === e.target.value);
                  if (ws) selectWorkspace(ws);
                }}
                className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none"
              >
                {workspaces.map(ws => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            )}
            <div className="text-right">
              <a
                href="/setup"
                className="text-sm text-gray-600 hover:text-black"
              >
                {workspace ? 'Setup' : 'Create Workspace →'}
              </a>
              <button
                onClick={signOut}
                className="block text-xs text-gray-500 hover:text-gray-700 mt-1"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area - Chat or Prospects */}
        {activeView === 'chat' ? (
          <>
            {/* Messages */}
            <div className="space-y-4 mb-4 min-h-[50vh] max-h-[60vh] overflow-y-auto border border-gray-700 rounded-2xl p-4 bg-gray-900">
              {messages.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-gray-500 mb-2">Ask about your prospects, build lists, or enrich companies</p>
                  <p className="text-gray-600 text-sm">
                    Try: "What proof points do I have for MSP prospects?"
                  </p>
                </div>
              )}

              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`
                      max-w-xl px-4 py-3 rounded-2xl
                      ${message.role === 'user'
                        ? 'bg-gray-700 text-white'
                        : message.isError
                          ? 'bg-red-900/50 text-red-200'
                          : 'bg-gray-800 text-gray-100'
                      }
                    `}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {message.content}
                    </p>
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-gray-400">
                        Sources: {message.sources.map(s => s.doc_id).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-800 text-gray-400 px-4 py-3 rounded-2xl">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* BUILD mode preview */}
            {buildPreview && (
              <div className="mb-4">
                <ListPreview
                  items={buildPreview.items}
                  criteria={buildPreview.criteria}
                  onSave={handleSaveList}
                  onEnrich={handleEnrichFromPreview}
                  loading={loading}
                />
              </div>
            )}

            {/* Input Area */}
            <div className="bg-gray-800 rounded-2xl border border-gray-600 overflow-hidden">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={workspace ? "Ask anything..." : "Create a workspace to get started..."}
                className="w-full bg-transparent text-white px-4 py-3 resize-none focus:outline-none text-sm"
                rows={2}
                disabled={loading || !workspace}
              />

              {/* Bottom toolbar with mode icons */}
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  {Object.entries(MODES).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setMode(key)}
                      disabled={loading}
                      className={`
                        px-3 py-1.5 rounded-lg text-xs font-medium
                        border transition-all duration-150
                        ${mode === key
                          ? 'border-blue-500 text-blue-500'
                          : 'border-gray-600 text-gray-500 hover:text-gray-400 hover:border-gray-500'
                        }
                      `}
                      title={cfg.description}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim() || !workspace}
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center
                    transition-all duration-150
                    ${input.trim() && !loading && workspace
                      ? 'bg-blue-600 text-white hover:bg-blue-500'
                      : 'bg-gray-700 text-gray-500'
                    }
                  `}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Opportunities View */
          <OpportunitiesView
            workspaceId={workspace?.id}
            onEnrich={(companyName) => {
              setActiveView('chat');
              setMode('enrich');
              setInput(`enrich ${companyName}`);
              setTimeout(() => inputRef.current?.focus(), 100);
            }}
          />
        )}
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import FloatingBlocks from '../components/FloatingBlocks';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: input,
          conversation_history: messages
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      const aiMessage = { role: 'assistant', content: data.response };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = { 
        role: 'assistant', 
        content: `Error: ${error.message}` 
      };
      setMessages(prev => [...prev, errorMessage]);
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

  return (
    <>
      {/* 8-bit background and floating blocks containers */}
      <div className="bg-green-gradient">
        <FloatingBlocks />
      </div>
      {/* Main content stays above the background */}
      <div className="min-h-screen" style={{ position: 'relative', zIndex: 1 }}>
        <Head>
          <title>Prover Demo</title>
        </Head>

        <div className="max-w-4xl mx-auto p-6">
          <header className="mb-8">
            <h1 className="text-5xl font-bold text-gray-900 mb-2 font-jetbrains">
              Prover
            </h1>
            <p className="text-gray-600 text-lg">
              Conversational Business Intelligence.
            </p>
            <div className="text-gray-500 text-base mt-1">(demo version v.2)</div>
          </header>

          <div className="bg-white rounded-lg shadow-sm border chat-demo-window flex flex-col">
            <div className="chat-demo-messages p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-gray-500 text-center py-8">
                  Start a conversation or try: "enrich Tesla Inc"
                </div>
              )}
              
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={
                      message.role === 'user'
                        ? 'user-message max-w-xs lg:max-w-md px-4 py-2 rounded-lg font-inter'
                        : 'bot-bubble max-w-xs lg:max-w-md px-4 py-2 rounded-lg font-inter'
                    }
                    style={message.role === 'user' ? { boxShadow: 'none' } : {}}
                  >
                    {message.role === 'assistant' ? (
                      <pre className="whitespace-pre-wrap font-sans text-base" dangerouslySetInnerHTML={{ __html: stylizeYaml(message.content) }} />
                    ) : (
                      <pre className="whitespace-pre-wrap font-sans text-base">{message.content}</pre>
                    )}
                  </div>
                </div>
              ))}
              
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full"></div>
                      <span>Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t p-4">
              <div className="flex space-x-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message or try 'enrich [company]...'"
                  className="flex-1 border border-gray-300 roundeType a messd-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-inter"
                  rows={2}
                  disabled={loading}
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="send-btn px-6 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-500">
            <strong>Commands:</strong> search | enrich | strategize | save
          </div>
        </div>
      </div>
    </>
  );
}

function stylizeYaml(text) {
  // Simple YAML-like highlighting: key: value\n
  // Regex: match lines like 'key: value' (not indented list items)
  return text.replace(/^(\s*)([\w\- \/]+):(.*)$/gm, (match, indent, key, value) => {
    return `${indent}<span class="yaml-header">${key}:</span><span class="yaml-value">${value}</span>`;
  });
}
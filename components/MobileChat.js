import React, { useState, useRef, useEffect } from 'react';

export default function MobileChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages([...messages, { text: input, from: 'user' }]);
    setInput('');
    // Simulate bot reply
    setTimeout(() => {
      setMessages(msgs => [...msgs, { text: 'Bot reply!', from: 'bot' }]);
    }, 1000);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#f7fafc'
    }}>
      <header style={{
        padding: '1rem',
        background: '#2F2F2F',
        color: '#fff',
        fontWeight: 'bold',
        fontSize: '1.25rem',
        textAlign: 'center'
      }}>
        Mobile Chat
      </header>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem'
      }}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: msg.from === 'user' ? 'flex-end' : 'flex-start',
              background: msg.from === 'user' ? '#87c3ff' : '#2F2F2F',
              color: msg.from === 'user' ? '#171717' : '#fff',
              borderRadius: 16,
              padding: '0.75rem 1rem',
              maxWidth: '80%',
              fontSize: '1rem'
            }}
          >
            {msg.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <footer style={{
        padding: '0.5rem',
        background: '#fff',
        borderTop: '1px solid #eee',
        display: 'flex',
        gap: '0.5rem'
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
          placeholder="Type a message..."
          style={{
            flex: 1,
            padding: '0.75rem',
            borderRadius: 16,
            border: '1px solid #ccc',
            fontSize: '1rem'
          }}
        />
        <button
          onClick={sendMessage}
          style={{
            padding: '0.75rem 1.25rem',
            borderRadius: 16,
            background: '#87c3ff',
            color: '#171717',
            fontWeight: 'bold',
            border: 'none',
            fontSize: '1rem'
          }}
        >
          Send
        </button>
      </footer>
    </div>
  );
} 
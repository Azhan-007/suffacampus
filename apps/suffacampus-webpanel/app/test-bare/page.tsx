'use client';

import { useState } from 'react';

// ZERO external imports - tests if React hydration works at all
export default function TestBarePage() {
  const [count, setCount] = useState(0);
  const [msg, setMsg] = useState('Page loaded. Click the button below.');

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif', maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Bare Hydration Test</h1>
      <p style={{ marginBottom: 16, color: '#666' }}>
        If you can click the button and see the count change, React hydration is working.
      </p>
      <button
        type="button"
        onClick={() => {
          setCount(c => c + 1);
          setMsg(`Button clicked ${count + 1} time(s)!`);
        }}
        style={{
          padding: '14px 28px',
          fontSize: 18,
          backgroundColor: '#10b981',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          marginBottom: 20,
        }}
      >
        Click Me: {count}
      </button>
      <div
        style={{
          backgroundColor: '#f0f0f0',
          padding: 20,
          borderRadius: 8,
          fontSize: 16,
        }}
      >
        {msg}
      </div>
    </div>
  );
}

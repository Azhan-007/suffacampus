'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { PUBLIC_API_URL } from '@/lib/runtime-config';

const DEBUG_ROUTES_ENABLED = process.env.NODE_ENV !== 'production';

export default function TestLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [log, setLog] = useState<string[]>(['Ready. Click the button to test login.']);

  const addLog = (msg: string) => {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleTest = async () => {
    if (!email || !password) {
      addLog('ERROR: Enter email and password to run this test.');
      return;
    }
    
    addLog('Step 1: Calling signInWithEmailAndPassword...');
    
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      addLog(`Step 1 OK: uid=${cred.user.uid}, email=${cred.user.email}`);
      
      addLog('Step 2: Getting ID token...');
      const token = await cred.user.getIdToken();
      addLog(`Step 2 OK: token=${token.substring(0, 30)}...`);
      
      addLog('Step 3: Calling backend POST /auth/login...');
      const res = await fetch(`${PUBLIC_API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      
      addLog(`Step 3 response: status=${res.status}`);
      const data = await res.json();
      addLog(`Step 3 body: ${JSON.stringify(data).substring(0, 200)}`);
      
      if (data.success && data.data) {
        addLog(`SUCCESS! role=${data.data.role}, displayName=${data.data.displayName}`);
        addLog('Login flow works. The issue is in the login page code, not the API.');
      } else {
        addLog(`FAILED: ${JSON.stringify(data)}`);
      }
    } catch (err: any) {
      addLog(`ERROR: ${err.message || err}`);
      addLog(`Error type: ${err.constructor?.name}`);
      if (err.code) addLog(`Firebase error code: ${err.code}`);
    }
  };

  if (!DEBUG_ROUTES_ENABLED) {
    return (
      <div style={{ padding: 40, fontFamily: 'monospace', maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Debug Route Disabled</h1>
        <p style={{ color: '#475569', lineHeight: 1.6 }}>
          This route is disabled in production builds and only available in non-production environments.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, fontFamily: 'monospace', maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Login Debug Test</h1>
      <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            fontSize: 14,
          }}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            fontSize: 14,
          }}
        />
      </div>
      <button
        onClick={handleTest}
        style={{
          padding: '12px 24px',
          fontSize: 16,
          backgroundColor: '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          marginBottom: 20,
        }}
      >
        Test Login Flow
      </button>
      <div
        style={{
          backgroundColor: '#1e293b',
          color: '#e2e8f0',
          padding: 20,
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.8,
          whiteSpace: 'pre-wrap',
          maxHeight: 500,
          overflow: 'auto',
        }}
      >
        {log.map((line, i) => (
          <div key={i} style={{ color: line.includes('ERROR') ? '#f87171' : line.includes('OK') || line.includes('SUCCESS') ? '#4ade80' : '#e2e8f0' }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

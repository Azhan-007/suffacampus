'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function TestLoginPage() {
  const [log, setLog] = useState<string[]>(['Ready. Click the button to test login.']);

  const addLog = (msg: string) => {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleTest = async () => {
    const email = 'developeraz07@gmail.com';
    const password = 'Azhan@SuperAdmin';
    
    addLog('Step 1: Calling signInWithEmailAndPassword...');
    
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      addLog(`Step 1 OK: uid=${cred.user.uid}, email=${cred.user.email}`);
      
      addLog('Step 2: Getting ID token...');
      const token = await cred.user.getIdToken();
      addLog(`Step 2 OK: token=${token.substring(0, 30)}...`);
      
      addLog('Step 3: Calling backend POST /auth/login...');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
      const res = await fetch(`${apiUrl}/auth/login`, {
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

  return (
    <div style={{ padding: 40, fontFamily: 'monospace', maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Login Debug Test</h1>
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

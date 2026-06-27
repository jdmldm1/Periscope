import React, { useState } from 'react';
import { Eye, EyeOff, Copy, Check, Search } from 'lucide-react';

interface SecretDecoderPanelProps {
  secretJson: any;
}

const safeBase64Decode = (str: string) => {
  if (!str) return '';
  try {
    // Correctly handle UTF-8 characters
    return decodeURIComponent(escape(window.atob(str)));
  } catch (e) {
    try {
      return window.atob(str);
    } catch (err) {
      return '[Binary / Undecodable Data]';
    }
  }
};

export const SecretDecoderPanel: React.FC<SecretDecoderPanelProps> = ({ secretJson }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [copiedKeys, setCopiedKeys] = useState<Record<string, boolean>>({});

  const secretData = secretJson?.data || {};
  const dataKeys = Object.keys(secretData);

  const toggleReveal = (key: string) => {
    setRevealedKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopy = (key: string, base64Value: string) => {
    const plainText = safeBase64Decode(base64Value);
    navigator.clipboard.writeText(plainText).then(() => {
      setCopiedKeys(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopiedKeys(prev => ({ ...prev, [key]: false }));
      }, 2000);
    });
  };

  const filteredKeys = dataKeys.filter(k => 
    k.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px 24px', boxSizing: 'border-box', overflow: 'hidden', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>Secret Keys Decoder</h4>
          <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Showing base64 decoded secrets securely. Click toggle to reveal.
          </p>
        </div>
        <div className="search-box" style={{ width: 260, padding: '4px 10px', height: 32 }}>
          <Search size={14} />
          <input 
            type="text" 
            placeholder="Search keys..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ fontSize: '0.8rem' }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6, background: 'rgba(0,0,0,0.2)' }}>
        {filteredKeys.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
            {dataKeys.length === 0 ? 'This Secret has no data key-value pairs.' : 'No matching keys found.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)' }}>
                <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>Key</th>
                <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>Value</th>
                <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600, width: 100, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredKeys.map(key => {
                const b64Val = secretData[key];
                const decodedVal = safeBase64Decode(b64Val);
                const isRevealed = !!revealedKeys[key];
                const isCopied = !!copiedKeys[key];
                const sizeBytes = b64Val ? Math.round((b64Val.length * 3) / 4) : 0;

                return (
                  <tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }} className="secret-tr-hover">
                    <td style={{ padding: '12px 14px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', wordBreak: 'break-all' }}>
                      {key}
                      <div style={{ fontSize: '0.68rem', fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>{sizeBytes} bytes</div>
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', position: 'relative' }}>
                      <div style={{ 
                        background: '#040711', 
                        border: '1px solid rgba(255,255,255,0.04)', 
                        borderRadius: 4, 
                        padding: '6px 12px',
                        color: isRevealed ? '#79c0ff' : 'var(--text-muted)', 
                        minHeight: 28,
                        boxSizing: 'border-box',
                        display: 'flex',
                        alignItems: 'center',
                        wordBreak: 'break-all',
                        whiteSpace: 'pre-wrap'
                      }}>
                        {isRevealed ? decodedVal : '••••••••••••••••'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'center' }}>
                        <button 
                          className="btn btn-icon btn-sm"
                          onClick={() => toggleReveal(key)}
                          title={isRevealed ? "Hide Value" : "Reveal Value"}
                          style={{ padding: 4 }}
                        >
                          {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button 
                          className="btn btn-icon btn-sm"
                          onClick={() => handleCopy(key, b64Val)}
                          disabled={!b64Val || decodedVal === '[Binary / Undecodable Data]'}
                          title="Copy Decoded Plaintext"
                          style={{ padding: 4, color: isCopied ? 'var(--accent-success)' : 'inherit' }}
                        >
                          {isCopied ? <Check size={13} /> : <Copy size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

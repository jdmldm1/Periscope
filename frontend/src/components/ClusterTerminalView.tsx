import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { Terminal as TerminalIcon, RotateCcw, Trash2, Cpu, CheckCircle, AlertTriangle } from 'lucide-react';
import 'xterm/css/xterm.css';

export const ClusterTerminalView: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<Terminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const initTerminal = () => {
    if (!terminalRef.current) return;
    setStatus('connecting');
    setErrorMsg(null);

    // Initialize xterm
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Fira Code, Consolas, Monaco, monospace',
      theme: {
        background: '#0a0d1a',
        foreground: '#ededed',
        cursor: '#00ffcc',
        black: '#0a0d1a',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
      },
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    termInstanceRef.current = term;
    fitAddonRef.current = fitAddon;

    term.open(terminalRef.current);
    
    // Fit layout
    setTimeout(() => {
      try {
        fitAddon.fit();
      } catch (e) {
        console.warn('Failed to fit terminal:', e);
      }
    }, 200);

    // Setup WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/cluster-terminal/ws`;

    const socket = new WebSocket(wsUrl);
    // Decode output synchronously and in order (see InteractiveTerminal): a
    // FileReader resolves asynchronously and reorders chunks, which scrambles
    // the escape sequences emitted by progress bars and TUIs.
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;

    const decoder = new TextDecoder();

    // Fit the terminal and tell the backend the new size so the host PTY
    // (and any TUI running inside it) renders at the correct dimensions.
    const sendResize = () => {
      try {
        fitAddon.fit();
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      } catch (err) {
        console.warn('Terminal resize error:', err);
      }
    };

    socket.onopen = () => {
      setStatus('connected');
      term.write('\r\n\x1b[1;36m=== Terminal ===\x1b[0m\r\n');
      sendResize();
     };

    socket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        term.write(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        term.write(decoder.decode(event.data, { stream: true }));
      }
    };

    socket.onerror = (err) => {
      console.error('Cluster terminal WebSocket error:', err);
      setErrorMsg('Failed to connect to cluster terminal backend.');
      setStatus('disconnected');
    };

    socket.onclose = (e) => {
      setStatus('disconnected');
      term.write(`\r\n\x1b[1;31m[Connection Closed: code=${e.code} reason=${e.reason || 'None'}]\x1b[0m\r\n`);
    };

    // Forward terminal inputs (keystrokes and pastes) to WebSocket
    const dataDisposable = term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    });

    // Handle standard browser paste (Ctrl+V)
    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text');
      if (text && socket.readyState === WebSocket.OPEN) {
        // Send the pasted text to the shell
        socket.send(text);
      }
    };
    terminalRef.current?.addEventListener('paste', handlePaste);

    // Re-fit on container/window size changes, debounced to coalesce bursts.
    let resizeTimer: ReturnType<typeof setTimeout>;
    const scheduleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sendResize, 80);
    };
    const resizeObserver = new ResizeObserver(scheduleResize);
    if (terminalRef.current) resizeObserver.observe(terminalRef.current);
    window.addEventListener('resize', scheduleResize);

    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', scheduleResize);
      resizeObserver.disconnect();
      terminalRef.current?.removeEventListener('paste', handlePaste);
      dataDisposable.dispose();
      term.dispose();
      socket.close();
    };
  };

  useEffect(() => {
    const cleanup = initTerminal();
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  const handleClear = () => {
    if (termInstanceRef.current) {
      termInstanceRef.current.clear();
      termInstanceRef.current.focus();
    }
  };

  const handleReconnect = () => {
    if (socketRef.current) {
      socketRef.current.close();
    }
    if (termInstanceRef.current) {
      termInstanceRef.current.dispose();
    }
    initTerminal();
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)', gap: 16 }}>
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          background: 'rgba(255,255,255,0.03)', 
          backdropFilter: 'blur(10px)', 
          border: '1px solid var(--border-color)', 
          borderRadius: 8, 
          padding: '12px 20px' 
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <TerminalIcon size={18} style={{ color: 'var(--accent-cyan)' }} />
          <h2 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 600 }}>Cluster Operator Console</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', padding: '2px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', marginLeft: 8 }}>
            <Cpu size={12} style={{ color: 'var(--text-muted)' }} />
            <span style={{ color: 'var(--text-muted)' }}>Alpine Host Environment</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
            {status === 'connected' ? (
              <>
                <CheckCircle size={14} style={{ color: '#10b981' }} />
                <span style={{ color: '#10b981', fontWeight: 500 }}>Online</span>
              </>
            ) : status === 'connecting' ? (
              <>
                <div className="spinner-border spinner-border-sm" role="status" style={{ width: 12, height: 12, border: '2px solid var(--accent-cyan)', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <span style={{ color: 'var(--text-muted)' }}>Connecting...</span>
              </>
            ) : (
              <>
                <AlertTriangle size={14} style={{ color: '#ef4444' }} />
                <span style={{ color: '#ef4444', fontWeight: 500 }}>Offline</span>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={handleClear} disabled={status !== 'connected'} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: '0.8rem' }}>
              <Trash2 size={12} /> Clear
            </button>
            <button className="btn btn-primary" onClick={handleReconnect} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: '0.8rem' }}>
              <RotateCcw size={12} /> Reconnect
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '10px 16px', borderRadius: 8, fontSize: '0.85rem' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      <div 
        style={{ 
          flex: 1, 
          background: '#0a0d1a', 
          border: '1px solid var(--border-color)', 
          borderRadius: 8, 
          padding: 12, 
          boxSizing: 'border-box',
          overflow: 'hidden',
          boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
          position: 'relative'
        }}
      >
        <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
};

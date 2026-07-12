import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { Terminal as TerminalIcon, RotateCcw, Trash2, Cpu, CheckCircle, AlertTriangle } from 'lucide-react';
import 'xterm/css/xterm.css';

interface ClusterTerminalViewProps {
  wsPath?: string;
  title?: string;
  subtitle?: string;
  stripReports?: boolean;
  awaitTui?: boolean;
  bootLabel?: string;
}


const TERMINAL_REPORT_RE = /\x1b\[[0-9;]*R/g;
const ALT_SCREEN_RE = /\x1b\[\?(?:1049|1047|47)h/;

export const ClusterTerminalView: React.FC<ClusterTerminalViewProps> = ({
  wsPath = '/api/cluster-terminal/ws',
  title = 'Cluster Operator Console',
  subtitle = 'Alpine Host Environment',
  stripReports = false,
  awaitTui = false,
  bootLabel = 'Starting…',
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<Terminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [booting, setBooting] = useState<boolean>(awaitTui);
  const bootingRef = useRef<boolean>(awaitTui);
  const bootTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setBootingState = (v: boolean) => { bootingRef.current = v; setBooting(v); };

  const initTerminal = () => {
    if (!terminalRef.current) return;
    setStatus('connecting');
    setErrorMsg(null);
    if (awaitTui) setBootingState(true);

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
    
    setTimeout(() => {
      try {
        fitAddon.fit();
      } catch (e) {
        console.warn('Failed to fit terminal:', e);
      }
    }, 200);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}${wsPath}`;

    const socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;

    const decoder = new TextDecoder();

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
      if (!awaitTui) term.write('\r\n\x1b[1;36m=== Terminal ===\x1b[0m\r\n');
      sendResize();
      if (awaitTui) {
        if (bootTimerRef.current) clearTimeout(bootTimerRef.current);
        bootTimerRef.current = setTimeout(() => setBootingState(false), 25000);
      }
     };

    socket.onmessage = (event) => {
      let text: string;
      if (typeof event.data === 'string') text = event.data;
      else if (event.data instanceof ArrayBuffer) text = decoder.decode(event.data, { stream: true });
      else return;
      term.write(text);
      if (bootingRef.current && ALT_SCREEN_RE.test(text)) setBootingState(false);
    };

    socket.onerror = (err) => {
      console.error('Cluster terminal WebSocket error:', err);
      setErrorMsg('Failed to connect to cluster terminal backend.');
      setStatus('disconnected');
      setBootingState(false);
    };

    socket.onclose = (e) => {
      setStatus('disconnected');
      setBootingState(false);
      term.write(`\r\n\x1b[1;31m[Connection Closed: code=${e.code} reason=${e.reason || 'None'}]\x1b[0m\r\n`);
    };

    const dataDisposable = term.onData((data) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (stripReports) {
        const cleaned = data.replace(TERMINAL_REPORT_RE, '');
        if (cleaned) socket.send(cleaned);
        return;
      }
      socket.send(data);
    });

    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text');
      if (text && socket.readyState === WebSocket.OPEN) {
        socket.send(text);
      }
    };
    terminalRef.current?.addEventListener('paste', handlePaste);

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
      if (bootTimerRef.current) clearTimeout(bootTimerRef.current);
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
          <h2 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 600 }}>{title}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', padding: '2px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', marginLeft: 8 }}>
            <Cpu size={12} style={{ color: 'var(--text-muted)' }} />
            <span style={{ color: 'var(--text-muted)' }}>{subtitle}</span>
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
        {booting && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,13,26,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 5, borderRadius: 8 }}>
            <div style={{ width: 46, height: 46, border: '3px solid rgba(0,188,212,0.15)', borderTopColor: 'var(--accent-cyan)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <div style={{ color: 'var(--text-main)', fontWeight: 600, fontSize: '1rem' }}>{bootLabel}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Launching the cluster TUI — this takes a few seconds.</div>
          </div>
        )}
      </div>
    </div>
  );
};

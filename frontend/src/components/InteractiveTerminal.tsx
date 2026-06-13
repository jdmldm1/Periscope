import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface InteractiveTerminalProps {
  namespace: string;
  podName: string;
  containerName: string;
}

export const InteractiveTerminal: React.FC<InteractiveTerminalProps> = ({
  namespace,
  podName,
  containerName,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<Terminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: '#040711',
        foreground: '#ededed',
        cursor: '#39ff14',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    termInstanceRef.current = term;

    // Open terminal inside container ref
    term.open(terminalRef.current);
    
    // Fit terminal layout
    setTimeout(() => {
      try {
        fitAddon.fit();
      } catch (e) {
        console.warn('Failed to fit terminal initially:', e);
      }
    }, 100);

    // Setup WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/terminal/ws?namespace=${encodeURIComponent(namespace)}&pod=${encodeURIComponent(podName)}&container=${encodeURIComponent(containerName)}`;

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      term.write('\r\n# Connected to pod shell container. Starting session...\r\n');
      // Send initial size resize command to backend
      socket.send(
        JSON.stringify({
          type: 'resize',
          cols: term.cols,
          rows: term.rows,
        })
      );
    };

    socket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        term.write(event.data);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            term.write(reader.result);
          }
        };
        reader.readAsText(event.data);
      }
    };

    socket.onerror = (err) => {
      console.error('Terminal websocket error:', err);
      term.write('\r\n\x1b[31m[Connection Error: Failed to connect to container terminal]\x1b[0m\r\n');
    };

    socket.onclose = (e) => {
      term.write(`\r\n\x1b[33m[Connection Closed: code=${e.code} reason=${e.reason || 'None'}]\x1b[0m\r\n`);
    };

    // Forward terminal keystrokes to WS socket
    const dataDisposable = term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    });

    // Resize listener
    const handleResize = () => {
      try {
        fitAddon.fit();
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'resize',
              cols: term.cols,
              rows: term.rows,
            })
          );
        }
      } catch (err) {
        console.warn('Resize error:', err);
      }
    };
    window.addEventListener('resize', handleResize);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      dataDisposable.dispose();
      term.dispose();
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, [namespace, podName, containerName]);

  return (
    <div 
      style={{ 
        width: '100%', 
        height: '420px', 
        background: '#040711', 
        border: '1px solid var(--border-color)', 
        borderRadius: 6,
        padding: 8,
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

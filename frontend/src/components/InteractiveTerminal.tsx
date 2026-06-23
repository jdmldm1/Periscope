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
      scrollback: 5000,
      allowProposedApi: true,
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
    // Receive output as ArrayBuffers and decode synchronously below. Reading
    // Blobs with FileReader resolves asynchronously and can reorder chunks,
    // which scrambles the escape sequences used by progress bars and TUIs.
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;

    // A single streaming decoder keeps multi-byte UTF-8 characters intact even
    // when they are split across two WebSocket frames.
    const decoder = new TextDecoder();

    // Fit the terminal and tell the backend the new dimensions so PTY programs
    // (k9s, ollama pull, etc.) render at the correct size instead of flickering.
    const sendResize = () => {
      try {
        fitAddon.fit();
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      } catch (err) {
        console.warn('Resize error:', err);
      }
    };

    socket.onopen = () => {
      term.write('\r\n# Connected to pod shell container. Starting session...\r\n');
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

    // Handle standard browser paste (Ctrl+V)
    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text');
      if (text && socket.readyState === WebSocket.OPEN) {
        socket.send(text);
      }
    };
    terminalRef.current?.addEventListener('paste', handlePaste);

    // Re-fit whenever the container changes size (the modal opening/animating
    // in, the window resizing). Debounced so a burst of layout changes results
    // in a single resize message.
    let resizeTimer: ReturnType<typeof setTimeout>;
    const scheduleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sendResize, 80);
    };
    const resizeObserver = new ResizeObserver(scheduleResize);
    if (terminalRef.current) resizeObserver.observe(terminalRef.current);
    window.addEventListener('resize', scheduleResize);

    // Cleanup on unmount
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', scheduleResize);
      resizeObserver.disconnect();
      terminalRef.current?.removeEventListener('paste', handlePaste);
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

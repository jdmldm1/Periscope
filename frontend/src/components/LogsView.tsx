import React, { useState, useEffect, useRef } from 'react';
import { Terminal, RefreshCw, Search, Download, AlertTriangle, Check, Info } from 'lucide-react';

interface LogsViewProps {
  namespaces: string[];
  initialNamespace: string;
}

interface LogLine {
  id: number;
  text: string;
  level: 'error' | 'warning' | 'info' | 'success';
  timestamp?: string;
}

export const LogsView: React.FC<LogsViewProps> = ({ namespaces, initialNamespace }) => {
  // Navigation / Mode
  const [logSource, setLogSource] = useState<'pods' | 'events'>('pods');
  
  // Selectors
  const activeNamespaces = namespaces.filter(ns => ns !== 'all');
  const [selectedNs, setSelectedNs] = useState<string>(
    initialNamespace && initialNamespace !== 'all' ? initialNamespace : (activeNamespaces[0] || 'default')
  );
  const [pods, setPods] = useState<any[]>([]);
  const [selectedPod, setSelectedPod] = useState<string>('');
  const [containers, setContainers] = useState<string[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<string>('');
  
  // Logs data
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showErrors, setShowErrors] = useState<boolean>(true);
  const [showWarnings, setShowWarnings] = useState<boolean>(true);
  const [showInfos, setShowInfos] = useState<boolean>(true);
  const [showSuccesses, setShowSuccesses] = useState<boolean>(true);

  // Controls
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [refreshInterval, setRefreshInterval] = useState<number>(0); // 0 = disabled

  // Refs
  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<any | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [reconnectCount, setReconnectCount] = useState<number>(0);

  // Fetch pods when namespace changes
  useEffect(() => {
    if (logSource !== 'pods') return;
    
    let isMounted = true;
    const fetchPods = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);
        const res = await fetch(`/api/resource/pods?namespace=${selectedNs}`);
        if (!res.ok) throw new Error(`Failed to fetch pods: ${res.statusText}`);
        const data = await res.json();
        
        if (isMounted) {
          setPods(data);
          if (data.length > 0) {
            setSelectedPod(data[0].metadata.name);
          } else {
            setSelectedPod('');
            setContainers([]);
            setSelectedContainer('');
            setLogLines([]);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMsg(err.message);
          setPods([]);
          setSelectedPod('');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPods();
    return () => { isMounted = false; };
  }, [selectedNs, logSource]);

  // Extract containers when pod changes
  useEffect(() => {
    if (logSource !== 'pods' || !selectedPod) return;
    
    const podObj = pods.find(p => p.metadata.name === selectedPod);
    if (podObj) {
      const list: string[] = [];
      if (podObj.spec?.initContainers) {
        podObj.spec.initContainers.forEach((c: any) => list.push(c.name));
      }
      if (podObj.spec?.containers) {
        podObj.spec.containers.forEach((c: any) => list.push(c.name));
      }
      if (podObj.spec?.ephemeralContainers) {
        podObj.spec.ephemeralContainers.forEach((c: any) => list.push(c.name));
      }
      setContainers(list);
      setSelectedContainer(list[0] || '');
    } else {
      setContainers([]);
      setSelectedContainer('');
    }
  }, [selectedPod, pods, logSource]);

  // Fetch logs function
  const fetchLogs = async () => {
    if (logSource === 'pods') {
      if (!selectedNs || !selectedPod) return;
      try {
        setLoading(true);
        setErrorMsg(null);
        let url = `/api/logs/${selectedNs}/${selectedPod}`;
        if (selectedContainer) {
          url += `?container=${selectedContainer}`;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error(await res.text() || 'Failed to fetch pod logs');
        const text = await res.text();
        
        const rawLines = text.split('\n');
        // Filter out final empty line if present
        if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
          rawLines.pop();
        }

        const parsed: LogLine[] = rawLines.map((textLine, idx) => {
          let level: LogLine['level'] = 'info';
          const lower = textLine.toLowerCase();
          
          if (
            lower.includes('err') || 
            lower.includes('fail') || 
            lower.includes('exception') || 
            lower.includes('emerg') || 
            lower.includes('alert') || 
            lower.includes('fatal') || 
            lower.includes('critical') ||
            lower.includes('stderr')
          ) {
            level = 'error';
          } else if (
            lower.includes('warn') || 
            lower.includes('wrn') || 
            lower.includes('warning')
          ) {
            level = 'warning';
          } else if (
            lower.includes('success') || 
            lower.includes('succeeded') || 
            lower.includes(' ok ') || 
            lower.includes('"ok"')
          ) {
            level = 'success';
          }
          
          return {
            id: idx,
            text: textLine,
            level
          };
        });
        
        setLogLines(parsed);
      } catch (err: any) {
        setErrorMsg(err.message || 'Error fetching pod logs');
        setLogLines([]);
      } finally {
        setLoading(false);
      }
    } else {
      // Cluster Events logs
      try {
        setLoading(true);
        setErrorMsg(null);
        const nsQuery = selectedNs === 'all' ? 'all' : selectedNs;
        const res = await fetch(`/api/resource/events?namespace=${nsQuery}`);
        if (!res.ok) throw new Error(`Failed to fetch events: ${res.statusText}`);
        const data = await res.json();
        
        // Sort events chronologically
        const eventsList = Array.isArray(data) ? data : [];
        eventsList.sort((a: any, b: any) => {
          const tA = new Date(a.lastTimestamp || a.metadata?.creationTimestamp || 0).getTime();
          const tB = new Date(b.lastTimestamp || b.metadata?.creationTimestamp || 0).getTime();
          return tA - tB;
        });
        
        const parsed: LogLine[] = eventsList.map((e: any, idx: number) => {
          const timestamp = e.lastTimestamp || e.metadata?.creationTimestamp || new Date().toISOString();
          const type = e.type || 'Normal';
          const reason = e.reason || 'Unknown';
          const message = e.message || '';
          const kind = e.involvedObject?.kind || 'Object';
          const name = e.involvedObject?.name || 'unknown';
          const namespace = e.involvedObject?.namespace || '';

          const textLine = `[${timestamp}] [${type}] [${kind}/${name}${namespace ? ` in ns ${namespace}` : ''}] ${reason}: ${message}`;
          
          let level: LogLine['level'] = 'info';
          if (type === 'Warning' || reason.toLowerCase().includes('fail') || reason.toLowerCase().includes('backoff')) {
            level = 'warning';
          } else if (type === 'Error') {
            level = 'error';
          } else if (reason.toLowerCase().includes('started') || reason.toLowerCase().includes('success') || reason.toLowerCase().includes('pulled')) {
            level = 'success';
          }

          return {
            id: idx,
            text: textLine,
            level,
            timestamp
          };
        });

        setLogLines(parsed);
      } catch (err: any) {
        setErrorMsg(err.message || 'Error fetching event logs');
        setLogLines([]);
      } finally {
        setLoading(false);
      }
    }
  };

  // WebSockets for Pod logs, HTTP polling for events
  useEffect(() => {
    // Clean up any existing WebSocket connection
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch (e) {
        console.warn('Error closing websocket:', e);
      }
      socketRef.current = null;
    }

    if (logSource !== 'pods') {
      // If we are in 'events' mode, fetch events using the existing function
      fetchLogs();
      return;
    }

    if (!selectedNs || !selectedPod) {
      setLogLines([]);
      return;
    }

    // Prevent race conditions: wait until selectedContainer aligns with the chosen pod
    const podObj = pods.find(p => p.metadata?.name === selectedPod);
    const podContainers: string[] = [];
    if (podObj) {
      if (podObj.spec?.initContainers) podObj.spec.initContainers.forEach((c: any) => podContainers.push(c.name));
      if (podObj.spec?.containers) podObj.spec.containers.forEach((c: any) => podContainers.push(c.name));
      if (podObj.spec?.ephemeralContainers) podObj.spec.ephemeralContainers.forEach((c: any) => podContainers.push(c.name));
    }
    if (podContainers.length > 0 && !podContainers.includes(selectedContainer)) {
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setLogLines([]);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/logs/ws?namespace=${encodeURIComponent(selectedNs)}&pod=${encodeURIComponent(selectedPod)}&container=${encodeURIComponent(selectedContainer)}`;

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    let buffer = '';
    socket.onopen = () => {
      // socket connected successfully
    };

    socket.onmessage = async (event) => {
      setLoading(false);
      try {
        let text = '';
        if (typeof event.data === 'string') {
          text = event.data;
        } else if (event.data instanceof Blob) {
          text = await event.data.text();
        } else if (event.data instanceof ArrayBuffer) {
          text = new TextDecoder().decode(event.data);
        } else {
          return;
        }

        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep the last partial line in buffer

        if (lines.length > 0) {
        setLogLines(prev => {
          const nextLines = [...prev];
          lines.forEach(lineText => {
            let level: LogLine['level'] = 'info';
            const lower = lineText.toLowerCase();
            if (
              lower.includes('err') || 
              lower.includes('fail') || 
              lower.includes('exception') || 
              lower.includes('emerg') || 
              lower.includes('alert') || 
              lower.includes('fatal') || 
              lower.includes('critical') ||
              lower.includes('stderr')
            ) {
              level = 'error';
            } else if (
              lower.includes('warn') || 
              lower.includes('wrn') || 
              lower.includes('warning')
            ) {
              level = 'warning';
            } else if (
              lower.includes('success') || 
              lower.includes('succeeded') || 
              lower.includes(' ok ') || 
              lower.includes('"ok"')
            ) {
              level = 'success';
            }

            nextLines.push({
              id: nextLines.length,
              text: lineText,
              level
            });
          });

          // Limit lines to 2000 to prevent performance degradation
          if (nextLines.length > 2000) {
            return nextLines.slice(nextLines.length - 2000);
          }
          return nextLines;
        });
      }
      } catch (err) {
        console.error('Error handling socket message:', err);
      }
    };

    socket.onerror = (err) => {
      console.error('Logs WebSockets error:', err);
      setErrorMsg('Log streaming connection error');
      setLoading(false);
    };

    socket.onclose = (e) => {
      setLoading(false);
      if (e.code !== 1000 && e.code !== 1005) {
        setErrorMsg(`Log stream closed: ${e.reason || 'code ' + e.code}`);
      }
    };

    return () => {
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch (e) {
          // ignore
        }
        socketRef.current = null;
      }
    };
  }, [selectedNs, selectedPod, selectedContainer, logSource, reconnectCount]);

  // Set up auto-refresh timer for cluster events (only)
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (refreshInterval > 0 && logSource === 'events') {
      timerRef.current = setInterval(() => {
        fetchLogs();
      }, refreshInterval * 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [refreshInterval, selectedNs, logSource]);

  // Scroll to bottom on updates
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logLines, autoScroll]);

  // Handle Download Logs
  const handleDownload = () => {
    const content = filteredLines.map(l => l.text).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = logSource === 'pods'
      ? `${selectedNs}_${selectedPod}_${selectedContainer || 'logs'}.log`
      : `${selectedNs}_cluster_events.log`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Perform filtering
  const filteredLines = logLines.filter(line => {
    // Search filter
    if (searchQuery) {
      try {
        const regex = new RegExp(searchQuery, 'i');
        if (!regex.test(line.text)) return false;
      } catch (e) {
        // Fallback to substring matching if regex fails to parse
        if (!line.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      }
    }
    
    // Level filter
    if (line.level === 'error' && !showErrors) return false;
    if (line.level === 'warning' && !showWarnings) return false;
    if (line.level === 'info' && !showInfos) return false;
    if (line.level === 'success' && !showSuccesses) return false;

    return true;
  });

  return (
    <div className="logs-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 170px)', gap: 16 }}>
      
      {/* Controls Card */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          {/* Left Side: selectors */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Log Source Tabs */}
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 2 }}>
              <button
                onClick={() => setLogSource('pods')}
                style={{
                  padding: '6px 12px',
                  background: logSource === 'pods' ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: 'none',
                  color: logSource === 'pods' ? '#fff' : 'var(--text-muted)',
                  fontWeight: logSource === 'pods' ? 600 : 400,
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Terminal size={14} /> Pod Logs
              </button>
              <button
                onClick={() => setLogSource('events')}
                style={{
                  padding: '6px 12px',
                  background: logSource === 'events' ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: 'none',
                  color: logSource === 'events' ? '#fff' : 'var(--text-muted)',
                  fontWeight: logSource === 'events' ? 600 : 400,
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <RefreshCw size={14} /> Cluster Events
              </button>
            </div>

            {/* Namespace selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Namespace</span>
              <select
                value={selectedNs}
                onChange={e => setSelectedNs(e.target.value)}
                className="select-ns"
                style={{ padding: '5px 10px', fontSize: '0.8rem' }}
              >
                {logSource === 'events' && <option value="all">All Namespaces</option>}
                {activeNamespaces.map(ns => <option key={ns} value={ns}>{ns}</option>)}
              </select>
            </div>

            {/* Pod selector (Pods Mode only) */}
            {logSource === 'pods' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Pod</span>
                  <select
                    value={selectedPod}
                    onChange={e => setSelectedPod(e.target.value)}
                    className="select-ns"
                    style={{ padding: '5px 10px', fontSize: '0.8rem', maxWidth: 200 }}
                    disabled={pods.length === 0}
                  >
                    {pods.length === 0 && <option value="">No pods found</option>}
                    {pods.map(p => (
                      <option key={p.metadata.name} value={p.metadata.name}>
                        {p.metadata.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Container</span>
                  <select
                    value={selectedContainer}
                    onChange={e => setSelectedContainer(e.target.value)}
                    className="select-ns"
                    style={{ padding: '5px 10px', fontSize: '0.8rem', maxWidth: 150 }}
                    disabled={containers.length === 0}
                  >
                    {containers.length === 0 && <option value="">No containers</option>}
                    {containers.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Right Side: Refresh / Download Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Auto refresh dropdown or Live indicator */}
            {logSource === 'events' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Auto-Refresh</span>
                <select
                  value={refreshInterval}
                  onChange={e => setRefreshInterval(Number(e.target.value))}
                  className="select-ns"
                  style={{ padding: '5px 10px', fontSize: '0.8rem' }}
                >
                  <option value={0}>Disabled</option>
                  <option value={5}>Every 5s</option>
                  <option value={10}>Every 10s</option>
                  <option value={30}>Every 30s</option>
                </select>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--accent-success)', fontWeight: 600 }}>
                <span 
                  style={{ 
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--accent-success)',
                    boxShadow: '0 0 8px var(--accent-success)',
                    animation: 'pulse 1.5s infinite'
                  }} 
                />
                Live
              </div>
            )}

            {/* Auto scroll checkbox */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={e => setAutoScroll(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Auto-Scroll
            </label>

            {/* Refresh button */}
            <button
              className="btn btn-icon"
              onClick={() => {
                if (logSource === 'pods') {
                  setReconnectCount(c => c + 1);
                } else {
                  fetchLogs();
                }
              }}
              title={logSource === 'pods' ? "Reconnect Stream" : "Manual Reload"}
              disabled={loading}
              style={{ padding: '6px 10px' }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>

            {/* Download button */}
            <button
              className="btn btn-icon"
              onClick={handleDownload}
              title="Download filtered log file"
              disabled={filteredLines.length === 0}
              style={{ padding: '6px 10px', color: 'var(--accent-cyan)' }}
            >
              <Download size={14} />
            </button>
          </div>
        </div>

        {/* Filters Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: 12, flexWrap: 'wrap', gap: 12 }}>
          {/* Regex Filter Search */}
          <div className="search-box" style={{ width: 320, padding: '4px 10px', height: 32 }}>
            <Search size={14} />
            <input
              type="text"
              placeholder="Filter by keyword or regex..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ fontSize: '0.8rem' }}
            />
          </div>

          {/* Level Toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginRight: 4 }}>Log Levels:</span>
            
            <button
              onClick={() => setShowErrors(!showErrors)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid',
                borderColor: showErrors ? 'rgba(238, 0, 0, 0.4)' : 'var(--border-color)',
                background: showErrors ? 'rgba(238, 0, 0, 0.08)' : 'transparent',
                color: showErrors ? 'var(--accent-error)' : 'var(--text-muted)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: showErrors ? 600 : 400
              }}
            >
              <AlertTriangle size={12} /> Errors
            </button>

            <button
              onClick={() => setShowWarnings(!showWarnings)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid',
                borderColor: showWarnings ? 'rgba(255, 184, 0, 0.4)' : 'var(--border-color)',
                background: showWarnings ? 'rgba(255, 184, 0, 0.08)' : 'transparent',
                color: showWarnings ? 'var(--accent-warning)' : 'var(--text-muted)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: showWarnings ? 600 : 400
              }}
            >
              <AlertTriangle size={12} /> Warnings
            </button>

            <button
              onClick={() => setShowInfos(!showInfos)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid',
                borderColor: showInfos ? 'rgba(96, 165, 250, 0.4)' : 'var(--border-color)',
                background: showInfos ? 'rgba(96, 165, 250, 0.08)' : 'transparent',
                color: showInfos ? 'var(--accent-cyan)' : 'var(--text-muted)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: showInfos ? 600 : 400
              }}
            >
              <Info size={12} /> Info
            </button>

            <button
              onClick={() => setShowSuccesses(!showSuccesses)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid',
                borderColor: showSuccesses ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-color)',
                background: showSuccesses ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                color: showSuccesses ? 'var(--accent-success)' : 'var(--text-muted)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: showSuccesses ? 600 : 400
              }}
            >
              <Check size={12} /> Success
            </button>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Showing <strong>{filteredLines.length}</strong> of {logLines.length} lines
          </div>
        </div>
      </div>

      {/* Terminal Display */}
      <div 
        className="terminal-container" 
        style={{
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-card)',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: 0
        }}
      >
        {/* Terminal Header */}
        <div style={{
          background: '#080808',
          borderBottom: '1px solid var(--border-color)',
          padding: '8px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-muted)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
            <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)' }}>
              {logSource === 'pods'
                ? `pod_stream: ${selectedNs}/${selectedPod}/${selectedContainer || 'logs'}`
                : `cluster_events_stream: ${selectedNs}`}
            </span>
          </div>
          {refreshInterval > 0 && (
            <span style={{ color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="spin" style={{ display: 'inline-block' }}><RefreshCw size={10} /></span>
              Live auto-refresh: {refreshInterval}s
            </span>
          )}
        </div>

        {/* Console output stream */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85rem',
          lineHeight: '1.5',
          background: '#000000',
          color: '#ffffff',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }}>
          {errorMsg && (
            <div style={{ color: 'var(--accent-error)', padding: '10px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} /> {errorMsg}
            </div>
          )}
          
          {filteredLines.length === 0 && !errorMsg ? (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '40px 0' }}>
              {loading ? 'Streaming log output lines...' : 'No matching log entries found.'}
            </div>
          ) : (
            filteredLines.map((line) => {
              let color = '#ededed'; // Default light gray text
              if (line.level === 'error') {
                color = '#ff6b6b'; // Muted error red
              } else if (line.level === 'warning') {
                color = '#ffd43b'; // Warning yellow
              } else if (line.level === 'success') {
                color = '#51cf66'; // Success green
              } else {
                color = '#a5d6ff'; // Soft cyan/blue for info
              }
              
              return (
                <div 
                  key={line.id} 
                  style={{ 
                    color, 
                    padding: '2px 0', 
                    borderBottom: '1px solid rgba(255,255,255,0.01)'
                  }}
                >
                  {line.text}
                </div>
              );
            })
          )}

          {/* Anchor for Auto-Scroll */}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
};

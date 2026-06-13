

import React, { useEffect, useState, useRef } from 'react';
import { 
  Globe, Zap, Server, Network, 
  Search, PlayCircle, StopCircle, Trash2, Eye, Cpu, Radio,
  Info
} from 'lucide-react';

interface TrafficInspectorViewProps {
  selectedNs: string;
}

interface Packet {
  timestamp: string;
  srcIp: string;
  srcPort: number;
  srcRes: { type: string; name: string; namespace?: string };
  destIp: string;
  destPort: number;
  destRes: { type: string; name: string; namespace?: string };
  protocol: string;
  length: number;
  info: string;
}

interface GraphNode {
  id: string;
  res: { type: string; name: string; namespace?: string };
  ip: string;
  role: 'source' | 'destination' | 'external';
  activity: number;
  x: number;
  y: number;
}

interface GraphEdge {
  id: string;
  source: GraphNode;
  target: GraphNode;
  protocol: string;
  weight: number;
}

interface FlyingPacket {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
}

export const TrafficInspectorView: React.FC<TrafficInspectorViewProps> = () => {
  // Sniffer State
  const [capturing, setCapturing] = useState<boolean>(false);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [selectedPacket, setSelectedPacket] = useState<Packet | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const socketRef = useRef<WebSocket | null>(null);

  // Graph states
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [flyingPackets, setFlyingPackets] = useState<FlyingPacket[]>([]);

  // Reference lists for coordinates lookup in the event listener
  const latestNodesRef = useRef<GraphNode[]>([]);
  const packetsRef = useRef<Packet[]>([]);
  const lastGraphUpdateRef = useRef<number>(0);
  const graphUpdatePendingRef = useRef<boolean>(false);

  const requestGraphUpdate = () => {
    const now = Date.now();
    const timeSinceLast = now - lastGraphUpdateRef.current;
    
    if (timeSinceLast >= 1000) {
      updateGraphLayout(packetsRef.current);
      lastGraphUpdateRef.current = now;
    } else if (!graphUpdatePendingRef.current) {
      graphUpdatePendingRef.current = true;
      setTimeout(() => {
        updateGraphLayout(packetsRef.current);
        lastGraphUpdateRef.current = Date.now();
        graphUpdatePendingRef.current = false;
      }, 1000 - timeSinceLast);
    }
  };

  const getProtocolColor = (proto: string) => {
    switch (proto) {
      case 'HTTP':
      case 'HTTPS':
        return { bg: 'rgba(16, 185, 129, 0.12)', text: '#10b981', border: 'rgba(16, 185, 129, 0.2)' };
      case 'DNS':
        return { bg: 'rgba(56, 189, 248, 0.12)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.2)' };
      case 'TCP':
        return { bg: 'rgba(168, 85, 247, 0.12)', text: '#a855f7', border: 'rgba(168, 85, 247, 0.2)' };
      case 'UDP':
        return { bg: 'rgba(234, 179, 8, 0.12)', text: '#eab308', border: 'rgba(234, 179, 8, 0.2)' };
      default:
        return { bg: 'rgba(255, 255, 255, 0.05)', text: '#ededed', border: 'rgba(255, 255, 255, 0.1)' };
    }
  };

  // Re-calculate node positions based on active packets
  const updateGraphLayout = (packetsList: Packet[]) => {
    const nodeMap = new Map<string, GraphNode>();

    // 1. Extract nodes and count activities
    packetsList.forEach(p => {
      const srcId = p.srcRes.name;
      const destId = p.destRes.name;

      if (!nodeMap.has(srcId)) {
        nodeMap.set(srcId, { 
          id: srcId, 
          res: p.srcRes, 
          ip: p.srcIp, 
          role: 'source', 
          activity: 1, 
          x: 0, 
          y: 0 
        });
      } else {
        const node = nodeMap.get(srcId)!;
        node.activity += 1;
      }

      if (!nodeMap.has(destId)) {
        nodeMap.set(destId, { 
          id: destId, 
          res: p.destRes, 
          ip: p.destIp, 
          role: p.destRes.type === 'external' ? 'external' : 'destination', 
          activity: 1, 
          x: 0, 
          y: 0 
        });
      } else {
        const node = nodeMap.get(destId)!;
        node.activity += 1;
        // If it was marked as source but acts as target Service/Pod, give middle column priority
        if (node.role === 'source' && p.destRes.type !== 'external') {
          node.role = 'destination';
        }
      }
    });

    const allNodes = Array.from(nodeMap.values());

    // Filter to top active nodes to prevent overlap clutter
    const sources = allNodes.filter(n => n.role === 'source').sort((a,b) => b.activity - a.activity).slice(0, 5);
    const destinations = allNodes.filter(n => n.role === 'destination').sort((a,b) => b.activity - a.activity).slice(0, 5);
    const externals = allNodes.filter(n => n.role === 'external').sort((a,b) => b.activity - a.activity).slice(0, 5);

    const layoutNodesList: GraphNode[] = [];
    const height = 280;

    sources.forEach((n, i) => {
      n.x = 120;
      n.y = ((i + 0.5) / sources.length) * (height - 60) + 30;
      layoutNodesList.push(n);
    });

    destinations.forEach((n, i) => {
      n.x = 400;
      n.y = ((i + 0.5) / destinations.length) * (height - 60) + 30;
      layoutNodesList.push(n);
    });

    externals.forEach((n, i) => {
      n.x = 680;
      n.y = ((i + 0.5) / externals.length) * (height - 60) + 30;
      layoutNodesList.push(n);
    });

    // 2. Extract active edges
    const edgeMap = new Map<string, GraphEdge>();
    packetsList.forEach(p => {
      const srcNode = layoutNodesList.find(n => n.id === p.srcRes.name);
      const destNode = layoutNodesList.find(n => n.id === p.destRes.name);

      if (srcNode && destNode) {
        const edgeId = `${srcNode.id}->${destNode.id}`;
        if (!edgeMap.has(edgeId)) {
          edgeMap.set(edgeId, {
            id: edgeId,
            source: srcNode,
            target: destNode,
            protocol: p.protocol,
            weight: 1
          });
        } else {
          edgeMap.get(edgeId)!.weight += 1;
        }
      }
    });

    setNodes(layoutNodesList);
    latestNodesRef.current = layoutNodesList;
    setEdges(Array.from(edgeMap.values()));
  };

  const handleNewPacket = (packet: Packet) => {
    setPackets(prev => {
      const newPackets = [packet, ...prev].slice(0, 500);
      packetsRef.current = newPackets;
      requestGraphUpdate();
      return newPackets;
    });

    // Trigger packet flow animation if coordinates exist
    const srcNode = latestNodesRef.current.find(n => n.id === packet.srcRes.name);
    const destNode = latestNodesRef.current.find(n => n.id === packet.destRes.name);

    if (srcNode && destNode) {
      const flightId = `${Date.now()}-${Math.random()}`;
      const newFlight: FlyingPacket = {
        id: flightId,
        fromX: srcNode.x,
        fromY: srcNode.y,
        toX: destNode.x,
        toY: destNode.y,
        color: getProtocolColor(packet.protocol).text
      };

      setFlyingPackets(prev => [...prev.slice(-15), newFlight]);

      // Prune flight packet after animation finishes
      setTimeout(() => {
        setFlyingPackets(prev => prev.filter(fp => fp.id !== flightId));
      }, 800);
    }
  };

  const startCapture = () => {
    if (capturing) return;
    setCapturing(true);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/network/sniff/ws`;

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      try {
        const packet: Packet = JSON.parse(event.data);
        handleNewPacket(packet);
      } catch (e) {
        console.error('Failed to parse sniffed packet:', e);
      }
    };

    socket.onerror = (err) => {
      console.error('Sniffer WebSocket error:', err);
      setCapturing(false);
    };

    socket.onclose = () => {
      setCapturing(false);
    };
  };

  const stopCapture = () => {
    if (socketRef.current) {
      socketRef.current.close();
    }
    setCapturing(false);
  };

  const clearPackets = () => {
    packetsRef.current = [];
    lastGraphUpdateRef.current = 0;
    graphUpdatePendingRef.current = false;
    setPackets([]);
    setNodes([]);
    setEdges([]);
    setFlyingPackets([]);
    setSelectedPacket(null);
  };

  // Cleanup capturing on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const renderResourceLabel = (res: { type: string; name: string; namespace?: string }) => {
    if (res.type === 'pod') {
      return (
        <span style={{ color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Server size={12} />
          {res.namespace ? `${res.namespace}/${res.name}` : res.name}
        </span>
      );
    }
    if (res.type === 'service') {
      return (
        <span style={{ color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Globe size={12} />
          {res.namespace ? `${res.namespace}/${res.name}` : res.name}
        </span>
      );
    }
    return <span style={{ color: 'var(--text-muted)' }}>{res.name}</span>;
  };

  const filteredPackets = packets.filter(p => {
    if (!searchFilter) return true;
    const filter = searchFilter.toLowerCase();
    return (
      p.srcIp.toLowerCase().includes(filter) ||
      p.destIp.toLowerCase().includes(filter) ||
      p.srcRes.name.toLowerCase().includes(filter) ||
      p.destRes.name.toLowerCase().includes(filter) ||
      p.protocol.toLowerCase().includes(filter) ||
      p.info.toLowerCase().includes(filter)
    );
  });

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top Controls Bar */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Radio size={18} style={{ color: 'var(--accent-cyan)', animation: capturing ? 'pulse 2s infinite' : 'none' }} />
          <h2 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 600 }}>Live Cluster Packet Sniffer</h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', padding: '2px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.05)' }}>
            <Cpu size={12} style={{ color: 'var(--text-muted)' }} />
            <span style={{ color: 'var(--text-muted)' }}>tcpdump active on eth0</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {capturing ? (
              <button className="btn" onClick={stopCapture} style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: '0.8rem' }}>
                <StopCircle size={14} /> Stop
              </button>
            ) : (
              <button className="btn btn-primary" onClick={startCapture} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: '0.8rem' }}>
                <PlayCircle size={14} /> Start Capture
              </button>
            )}
            <button className="btn" onClick={clearPackets} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: '0.8rem' }}>
              <Trash2 size={12} /> Clear
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Network Traffic Node Graph Panel */}
      <div 
        style={{ 
          background: 'rgba(255,255,255,0.02)', 
          border: '1px solid var(--border-color)', 
          borderRadius: 8, 
          padding: '16px 20px',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Network size={16} style={{ color: 'var(--accent-cyan)' }} />
            <h3 style={{ fontSize: '0.92rem', margin: 0, fontWeight: 600 }}>Active Traffic Topography</h3>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Columns: <span style={{ color: 'var(--accent-cyan)' }}>Sources</span> ➔ <span style={{ color: '#a78bfa' }}>Targets (Services/Pods)</span> ➔ <span style={{ color: 'var(--text-muted)' }}>Externals</span>
          </div>
        </div>

        {/* SVG Live Node Graph */}
        <div 
          style={{ 
            height: '280px', 
            background: 'rgba(0,0,0,0.25)', 
            border: '1px solid var(--border-color)', 
            borderRadius: 6,
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {nodes.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: 'var(--text-muted)', fontSize: '0.82rem', fontStyle: 'italic' }}>
              <Zap size={24} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
              {capturing ? 'Sniffing cluster channels... Send some requests to plot the topography!' : 'Start the sniffer to generate the live network graph.'}
            </div>
          ) : (
            <svg width="100%" height="100%" viewBox="0 0 800 280" style={{ overflow: 'visible' }}>
              <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Draw Static Connection Edges */}
              {edges.map(edge => {
                const styleInfo = getProtocolColor(edge.protocol);
                return (
                  <path 
                    key={edge.id}
                    d={`M ${edge.source.x} ${edge.source.y} L ${edge.target.x} ${edge.target.y}`} 
                    stroke={styleInfo.text} 
                    strokeWidth={Math.min(5, 1 + edge.weight * 0.15)} 
                    strokeOpacity="0.25"
                    fill="none"
                  />
                );
              })}

              {/* Draw Flying Real-time Packets */}
              {flyingPackets.map(pkt => (
                <circle key={pkt.id} r="5" fill={pkt.color} filter="url(#glow)">
                  <animateMotion 
                    dur="0.8s" 
                    fill="freeze" 
                    path={`M ${pkt.fromX} ${pkt.fromY} L ${pkt.toX} ${pkt.toY}`} 
                  />
                </circle>
              ))}

              {/* Draw Graph Nodes */}
              {nodes.map(node => {
                let borderStroke = 'var(--text-muted)';
                let fillBg = 'rgba(255,255,255,0.05)';
                let iconColor = 'var(--text-muted)';
                let IconComponent = Globe;

                if (node.res.type === 'pod') {
                  borderStroke = 'var(--accent-cyan)';
                  fillBg = 'rgba(6, 182, 212, 0.15)';
                  iconColor = 'var(--accent-cyan)';
                  IconComponent = Server;
                } else if (node.res.type === 'service') {
                  borderStroke = '#a78bfa';
                  fillBg = 'rgba(139, 92, 246, 0.15)';
                  iconColor = '#a78bfa';
                  IconComponent = Globe;
                }

                return (
                  <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                    <circle r="22" fill={fillBg} stroke={borderStroke} strokeWidth="2" filter="url(#glow)" />
                    <foreignObject x="-14" y="-14" width="28" height="28">
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: iconColor }}>
                        <IconComponent size={16} />
                      </div>
                    </foreignObject>
                    
                    {/* Node Text labels */}
                    <text y="36" textAnchor="middle" fill="#ededed" fontSize="9" fontWeight="600" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                      {node.id.length > 15 ? node.id.substring(0, 12) + '...' : node.id}
                    </text>
                    <text y="46" textAnchor="middle" fill="var(--text-muted)" fontSize="7" style={{ fontFamily: 'var(--font-mono)' }}>
                      {node.ip}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>

      {/* Main Wireshark Console Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Live Sniff info panel */}
        <div 
          style={{ 
            background: 'rgba(56, 189, 248, 0.05)', 
            border: '1px solid rgba(56, 189, 248, 0.15)', 
            borderRadius: 8, 
            padding: '12px 16px', 
            fontSize: '0.85rem', 
            color: '#bae6fd',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}
        >
          <Info size={18} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
          <div>
            <strong>Cluster Connection Sniffer:</strong> Capturing live host-bridge packets. Packets are parsed on the fly, matching raw IP addresses back to running Pods and Services.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
          {/* Packet table listing */}
          <div 
            style={{ 
              background: 'rgba(255,255,255,0.02)', 
              border: '1px solid var(--border-color)', 
              borderRadius: 8, 
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
          >
            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  placeholder="Filter packets by IP, Pod/Service name, protocol, info..." 
                  className="form-control"
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px 8px 32px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: 4, fontSize: '0.85rem' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Captured: <strong>{packets.length}</strong> (showing {filteredPackets.length})
              </div>
            </div>

            {/* Table layout */}
            <div 
              style={{ 
                maxHeight: '380px', 
                overflowY: 'auto', 
                border: '1px solid var(--border-color)', 
                borderRadius: 6,
                background: '#040711'
              }}
            >
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#0a0d1a', borderBottom: '1px solid var(--border-color)', zIndex: 1 }}>
                  <tr style={{ color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 10px', width: 40 }}>No</th>
                    <th style={{ padding: '8px 10px', width: 80 }}>Time</th>
                    <th style={{ padding: '8px 10px' }}>Source</th>
                    <th style={{ padding: '8px 10px', width: 50 }}>Port</th>
                    <th style={{ padding: '8px 10px' }}>Destination</th>
                    <th style={{ padding: '8px 10px', width: 50 }}>Port</th>
                    <th style={{ padding: '8px 10px', width: 60 }}>Protocol</th>
                    <th style={{ padding: '8px 10px', width: 50 }}>Length</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPackets.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        {capturing ? 'Waiting for traffic...' : 'Capture is stopped. Click "Start Capture" to begin capturing network frames.'}
                      </td>
                    </tr>
                  ) : (
                    filteredPackets.map((pkt, idx) => {
                      const styleInfo = getProtocolColor(pkt.protocol);
                      const isSelected = selectedPacket === pkt;
                      return (
                        <tr 
                          key={idx} 
                          onClick={() => setSelectedPacket(pkt)}
                          style={{ 
                            background: isSelected ? 'rgba(0, 255, 204, 0.15)' : styleInfo.bg,
                            borderBottom: '1px solid rgba(255,255,255,0.02)',
                            cursor: 'pointer',
                            color: styleInfo.text,
                            fontWeight: isSelected ? 'bold' : 'normal'
                          }}
                        >
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>{filteredPackets.length - idx}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>{pkt.timestamp}</td>
                          <td style={{ padding: '8px 10px' }}>{renderResourceLabel(pkt.srcRes)}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>{pkt.srcPort}</td>
                          <td style={{ padding: '8px 10px' }}>{renderResourceLabel(pkt.destRes)}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>{pkt.destPort}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span 
                              style={{ 
                                display: 'inline-block',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: '0.7rem',
                                fontWeight: 'bold',
                                background: 'rgba(0,0,0,0.3)',
                                border: `1px solid ${styleInfo.border}`
                              }}
                            >
                              {pkt.protocol}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>{pkt.length} B</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Details Inspector column */}
          <div 
            style={{ 
              background: 'rgba(255,255,255,0.02)', 
              border: '1px solid var(--border-color)', 
              borderRadius: 8, 
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
          >
            <h4 style={{ fontSize: '0.9rem', margin: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Eye size={14} style={{ color: 'var(--accent-cyan)' }} /> Packet Details Inspector
            </h4>

            {selectedPacket ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
                {/* Facts card */}
                <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-color)', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Timestamp:</span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{selectedPacket.timestamp}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Source:</span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{selectedPacket.srcIp}:{selectedPacket.srcPort}</strong>
                    <div style={{ paddingLeft: 10, fontSize: '0.75rem' }}>{renderResourceLabel(selectedPacket.srcRes)}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Destination:</span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{selectedPacket.destIp}:{selectedPacket.destPort}</strong>
                    <div style={{ paddingLeft: 10, fontSize: '0.75rem' }}>{renderResourceLabel(selectedPacket.destRes)}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Length:</span> <strong>{selectedPacket.length} bytes</strong>
                  </div>
                </div>

                {/* Packet payload body info */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Raw tcpdump Payload Info:</span>
                  <div 
                    style={{ 
                      flex: 1, 
                      background: '#040711', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: 6, 
                      padding: 10, 
                      fontFamily: 'var(--font-mono)', 
                      fontSize: '0.75rem', 
                      color: 'var(--text-main)', 
                      overflowY: 'auto',
                      wordBreak: 'break-all',
                      boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8)',
                      maxHeight: '200px'
                    }}
                  >
                    {selectedPacket.info}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic', textAlign: 'center', padding: '40px 10px' }}>
                Select a network frame from the table to inspect its properties.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

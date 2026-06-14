import { useRef, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  search: string;
  setSearch: (s: string) => void;
  namespaces: string[];
  setSelectedNs: (ns: string) => void;
  contexts: any[];
  handleContextChange: (ctx: string) => void;
  setActiveTab: (tab: any) => void;
  fetchResources: () => void;
  fetchRunningImagesAndScan: () => void;
}

export const CommandPalette = ({
  isOpen, setIsOpen, search, setSearch,
  namespaces, setSelectedNs, contexts, handleContextChange,
  setActiveTab, fetchResources, fetchRunningImagesAndScan
}: CommandPaletteProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setActivePaletteIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setActivePaletteIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const items = [
    { name: 'Topology Map', category: 'Views', action: () => { setActiveTab('topology'); setIsOpen(false); } },
    { name: 'Node Status', category: 'Views', action: () => { setActiveTab('nodes'); setIsOpen(false); } },
    { name: 'Cluster Events Feed', category: 'Views', action: () => { setActiveTab('events'); setIsOpen(false); } },
    { name: 'Cluster & Pod Logs Console', category: 'Views', action: () => { setActiveTab('logs'); setIsOpen(false); } },
    { name: 'Pods List', category: 'Views', action: () => { setActiveTab('pods'); setIsOpen(false); } },
    { name: 'Deployments Scale & Restart', category: 'Views', action: () => { setActiveTab('deployments'); setIsOpen(false); } },
    { name: 'Services Network', category: 'Views', action: () => { setActiveTab('services'); setIsOpen(false); } },
    ...namespaces.map(ns => ({ name: `Switch Namespace: ${ns === 'all' ? 'All Namespaces' : ns}`, category: 'Namespaces', action: () => { setSelectedNs(ns); setIsOpen(false); } })),
    ...contexts.map(c => ({ name: `Switch Context: ${c.name}`, category: 'Contexts', action: () => { handleContextChange(c.name); setIsOpen(false); } })),
    { name: 'Scan All Running Images', category: 'Security', action: () => { fetchRunningImagesAndScan(); setIsOpen(false); } },
    { name: 'Refresh View', category: 'Commands', action: () => { fetchResources(); setIsOpen(false); } },
  ];

  const filtered = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.category.toLowerCase().includes(search.toLowerCase())
  );

  const groups: Record<string, any[]> = {};
  filtered.forEach(item => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });

  return (
    <div className="modal-overlay" onClick={() => setIsOpen(false)} style={{ zIndex: 2000 }}>
      <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 550, maxHeight: '400px', display: 'flex', flexDirection: 'column', background: 'rgba(10, 10, 10, 0.85)', backdropFilter: 'blur(20px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px' }}>
          <Search size={18} style={{ color: 'var(--accent-green)' }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search views, namespaces, contexts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-main)', width: '100%', fontSize: '1rem' }}
          />
          <button className="btn btn-icon" onClick={() => setIsOpen(false)}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(groups).map(([cat, catItems]) => (
            <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--accent-green)', fontWeight: 600 }}>{cat}</div>
              {catItems.map((item, idx) => (
                <div key={idx} onClick={item.action} className="nav-item" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

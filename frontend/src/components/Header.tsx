import { Search, Command, RefreshCw, Plus, Shield } from 'lucide-react';

interface HeaderProps {
  search: string;
  setSearch: (s: string) => void;
  setIsCmdPaletteOpen: (open: boolean) => void;
  contexts: any[];
  currentContext: string;
  handleContextChange: (ctx: string) => void;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  selectedNs: string;
  setSelectedNs: (ns: string) => void;
  namespaces: string[];
  fetchResources: () => void;
  setIsDeployZarfModalOpen?: (open: boolean) => void;
  setIsDeployHelmModalOpen?: (open: boolean) => void;
}

export const Header = ({
  search, setSearch, setIsCmdPaletteOpen,
  contexts, currentContext, handleContextChange,
  activeTab, setActiveTab, selectedNs, setSelectedNs, namespaces,
  fetchResources, setIsDeployZarfModalOpen, setIsDeployHelmModalOpen
}: HeaderProps) => {
  return (
    <div className="topbar">
      <div className="search-box">
        <Search size={16} />
        <input
          type="text"
          placeholder="Search resources..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button
          onClick={() => setIsCmdPaletteOpen(true)}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            color: 'var(--text-muted)',
            padding: '2px 6px',
            fontSize: '0.7rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            marginLeft: '8px'
          }}
          title="Open Command Palette (Ctrl+K)"
        >
          <Command size={10} /> K
        </button>
      </div>
      <div className="controls-bar">
        {contexts.length > 0 && (
          <select
            className="select-ns"
            style={{
              marginRight: 4,
              background: 'rgba(96, 165, 250, 0.08)',
              color: '#60a5fa',
              borderColor: 'rgba(96, 165, 250, 0.25)',
              fontWeight: 500
            }}
            value={currentContext}
            onChange={e => handleContextChange(e.target.value)}
            title="Kubernetes Context"
          >
            {contexts.map(c => <option key={c.name} value={c.name} style={{ background: '#0a0a0a', color: '#fff' }}>{c.name}</option>)}
          </select>
        )}
        {activeTab !== 'nodes' && activeTab !== 'persistentvolumes' && (
          <select className="select-ns" value={selectedNs} onChange={e => setSelectedNs(e.target.value)}>
            {namespaces.map(ns => <option key={ns} value={ns}>{ns === 'all' ? 'All Namespaces' : ns}</option>)}
          </select>
        )}
        <button className="btn" onClick={fetchResources} title="Force Refresh">
          <RefreshCw size={16} />
        </button>

        {activeTab === 'helm' && setIsDeployHelmModalOpen && (
          <button className="btn btn-primary" onClick={() => setIsDeployHelmModalOpen(true)}>
            <Plus size={16} /> Deploy Chart
          </button>
        )}

        {(activeTab === 'zarf' || activeTab === 'zarf-registry') && setIsDeployZarfModalOpen && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="tab-group" style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: 2, border: '1px solid var(--border-color)' }}>
              <button 
                className={`btn btn-sm ${activeTab === 'zarf' ? 'btn-primary' : ''}`} 
                style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: 4, border: 'none' }}
                onClick={() => setActiveTab('zarf')}
              >
                Packages
              </button>
              <button 
                className={`btn btn-sm ${activeTab === 'zarf-registry' ? 'btn-primary' : ''}`}
                style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: 4, border: 'none' }}
                onClick={() => setActiveTab('zarf-registry')}
              >
                Registry
              </button>
            </div>
            <button className="btn btn-primary" onClick={() => setIsDeployZarfModalOpen(true)}>
              <Shield size={16} /> Deploy Package
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

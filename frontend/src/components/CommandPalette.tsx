import { useRef, useEffect, useState } from 'react';
import { X } from 'lucide-react';

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
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setActiveIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  if (!isOpen) return null;

  // k9s command items list with shortcut aliases
  const items = [
    { name: 'Topology Map (:topology)', aliases: ['topology', 'top', 'map'], category: 'Views', action: () => { setActiveTab('topology'); setIsOpen(false); } },
    { name: 'Node Status (:nodes, :node, :no)', aliases: ['nodes', 'node', 'no'], category: 'Views', action: () => { setActiveTab('nodes'); setIsOpen(false); } },
    { name: 'Cluster Events Feed (:events, :ev)', aliases: ['events', 'event', 'ev'], category: 'Views', action: () => { setActiveTab('events'); setIsOpen(false); } },
    { name: 'Cluster & Pod Logs Console (:logs, :log)', aliases: ['logs', 'log'], category: 'Views', action: () => { setActiveTab('logs'); setIsOpen(false); } },
    { name: 'Pods List (:pods, :pod, :po)', aliases: ['pods', 'pod', 'po'], category: 'Views', action: () => { setActiveTab('pods'); setIsOpen(false); } },
    { name: 'Deployments (:deployments, :deployment, :deploy, :dep)', aliases: ['deployments', 'deployment', 'deploy', 'dep'], category: 'Views', action: () => { setActiveTab('deployments'); setIsOpen(false); } },
    { name: 'StatefulSets (:statefulsets, :statefulset, :sts)', aliases: ['statefulsets', 'statefulset', 'sts'], category: 'Views', action: () => { setActiveTab('statefulsets'); setIsOpen(false); } },
    { name: 'DaemonSets (:daemonsets, :daemonset, :ds)', aliases: ['daemonsets', 'daemonset', 'ds'], category: 'Views', action: () => { setActiveTab('daemonsets'); setIsOpen(false); } },
    { name: 'Jobs (:jobs, :job)', aliases: ['jobs', 'job'], category: 'Views', action: () => { setActiveTab('jobs'); setIsOpen(false); } },
    { name: 'CronJobs (:cronjobs, :cronjob, :cj)', aliases: ['cronjobs', 'cronjob', 'cj'], category: 'Views', action: () => { setActiveTab('cronjobs'); setIsOpen(false); } },
    { name: 'Services (:services, :service, :svc)', aliases: ['services', 'service', 'svc'], category: 'Views', action: () => { setActiveTab('services'); setIsOpen(false); } },
    { name: 'Ingresses (:ingresses, :ingress, :ing)', aliases: ['ingresses', 'ingress', 'ing'], category: 'Views', action: () => { setActiveTab('ingresses'); setIsOpen(false); } },
    { name: 'ConfigMaps (:configmaps, :configmap, :cm)', aliases: ['configmaps', 'configmap', 'cm'], category: 'Views', action: () => { setActiveTab('configmaps'); setIsOpen(false); } },
    { name: 'Secrets (:secrets, :secret)', aliases: ['secrets', 'secret'], category: 'Views', action: () => { setActiveTab('secrets'); setIsOpen(false); } },
    { name: 'PersistentVolumeClaims (:persistentvolumeclaims, :persistentvolumeclaim, :pvc)', aliases: ['persistentvolumeclaims', 'persistentvolumeclaim', 'pvc'], category: 'Views', action: () => { setActiveTab('persistentvolumeclaims'); setIsOpen(false); } },
    { name: 'PersistentVolumes (:persistentvolumes, :persistentvolume, :pv)', aliases: ['persistentvolumes', 'persistentvolume', 'pv'], category: 'Views', action: () => { setActiveTab('persistentvolumes'); setIsOpen(false); } },
    { name: 'Cluster Terminal (:terminal, :term)', aliases: ['terminal', 'term', 'cluster-terminal'], category: 'Views', action: () => { setActiveTab('cluster-terminal'); setIsOpen(false); } },
    { name: 'Traffic Inspector (:traffic, :network)', aliases: ['traffic', 'network', 'traffic-inspector'], category: 'Views', action: () => { setActiveTab('traffic'); setIsOpen(false); } },
    { name: 'Helm Releases (:helm)', aliases: ['helm', 'helm-releases'], category: 'Views', action: () => { setActiveTab('helm'); setIsOpen(false); } },
    { name: 'Zarf Packages (:zarf)', aliases: ['zarf', 'zarf-packages'], category: 'Views', action: () => { setActiveTab('zarf'); setIsOpen(false); } },
    { name: 'Image SBOM Scanner (:scanner)', aliases: ['scanner', 'image-scanner'], category: 'Views', action: () => { setActiveTab('image-scanner'); setIsOpen(false); } },
    { name: 'Kubescape Compliance Audit (:security)', aliases: ['security', 'kubescape'], category: 'Views', action: () => { setActiveTab('kubescape'); setIsOpen(false); } },
    { name: 'Gitea Git Server (:gitea)', aliases: ['gitea'], category: 'Views', action: () => { setActiveTab('gitea'); setIsOpen(false); } },
    ...(namespaces || []).filter(ns => typeof ns === 'string' && ns.trim() !== '').map(ns => ({ name: `Switch Namespace: ${ns === 'all' ? 'All Namespaces' : ns}`, aliases: [ns, ns === 'all' ? 'all' : ''], category: 'Namespaces', action: () => { setSelectedNs(ns); setIsOpen(false); } })),
    ...(contexts || []).filter(c => c && typeof c.name === 'string' && c.name.trim() !== '').map(c => ({ name: `Switch Context: ${c.name}`, aliases: [c.name], category: 'Contexts', action: () => { handleContextChange(c.name); setIsOpen(false); } })),
    { name: 'Scan All Running Images', aliases: ['scan-images', 'scan-all'], category: 'Security', action: () => { fetchRunningImagesAndScan(); setIsOpen(false); } },
    { name: 'Refresh View', aliases: ['refresh', 'reload'], category: 'Commands', action: () => { fetchResources(); setIsOpen(false); } },
  ];

  // Clean the colon prefix from search query
  const queryClean = search.trim().startsWith(':') ? search.trim().slice(1).toLowerCase() : search.trim().toLowerCase();

  const filtered = items.filter(item => 
    item.name.toLowerCase().includes(queryClean) ||
    item.category.toLowerCase().includes(queryClean) ||
    (item.aliases && item.aliases.some(alias => typeof alias === 'string' && (alias.toLowerCase() === queryClean || alias.toLowerCase().includes(queryClean))))
  );

  // Boost items that exact match the alias
  const sortedFiltered = [...filtered].sort((a, b) => {
    const aExact = a.aliases?.some(al => typeof al === 'string' && al.toLowerCase() === queryClean);
    const bExact = b.aliases?.some(al => typeof al === 'string' && al.toLowerCase() === queryClean);
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return 0;
  });

  // Handle keydown navigation inside search input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => Math.min(prev + 1, sortedFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sortedFiltered[activeIndex]) {
        sortedFiltered[activeIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };



  // Group sortedFiltered items by category
  const groups: Record<string, any[]> = {};
  sortedFiltered.forEach(item => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });

  return (
    <div className="modal-overlay" onClick={() => setIsOpen(false)} style={{ zIndex: 2000 }}>
      <div 
        className="modal-content animate-fade-in" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          maxWidth: 550, 
          maxHeight: '450px', 
          display: 'flex', 
          flexDirection: 'column', 
          background: 'rgba(10, 10, 10, 0.9)', 
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--accent-green)',
          boxShadow: '0 0 20px rgba(16, 185, 129, 0.15)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px' }}>
          <span style={{ color: 'var(--accent-green)', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '1.2rem' }}>:</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search views, namespaces, contexts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-main)', width: '100%', fontSize: '1rem', fontFamily: 'monospace' }}
          />
          <button className="btn btn-icon" onClick={() => setIsOpen(false)}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {sortedFiltered.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20, fontStyle: 'italic', fontSize: '0.85rem' }}>
              No matching commands or shortcuts found.
            </div>
          ) : (
            Object.entries(groups).map(([cat, catItems]) => (
              <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--accent-green)', fontWeight: 600, letterSpacing: '0.5px' }}>{cat}</div>
                {catItems.map((item) => {
                  const flatIdx = sortedFiltered.indexOf(item);
                  const isActive = flatIdx === activeIndex;
                  return (
                    <div 
                      key={flatIdx} 
                      onClick={item.action} 
                      className="nav-item" 
                      style={{ 
                        padding: '8px 12px', 
                        background: isActive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.02)', 
                        borderLeft: isActive ? '3px solid var(--accent-green)' : '3px solid transparent',
                        borderRadius: '4px', 
                        cursor: 'pointer', 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span style={{ color: isActive ? '#fff' : 'var(--text-main)', fontWeight: isActive ? 600 : 400, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {item.name}
                      </span>
                      {isActive && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-green)', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: 4 }}>
                          ↵ Enter
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

import { SlidersHorizontal, Activity, Server, List, Terminal, Code, Box, Layers, HardDriveDownload, Database, Shield, Microscope, ShieldAlert, Package, Network, Radio, Key, FileText, GitCommit, Trash2, Bell, TrendingUp, HardDrive, Clock } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  setSearch: (s: string) => void;
  collapsedSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  setCustomCrd: (crd: any) => void;
  isOpen?: boolean;
  onNavigate?: () => void;
}

export const Sidebar = ({ activeTab, setActiveTab, setSearch, collapsedSections, toggleSection, setCustomCrd, isOpen, onNavigate }: SidebarProps) => {
  const NavItem = ({ id, icon: Icon, label, color, onClick }: { id: string, icon: any, label: string, color?: string, onClick?: () => void }) => (
    <a
      className={`nav-item ${activeTab === id ? 'active' : ''}`}
      onClick={() => {
        if (onClick) onClick();
        else {
          setActiveTab(id);
          setSearch('');
        }
        // Collapse the drawer after a selection on mobile.
        onNavigate?.();
      }}
    >
      <Icon size={16} style={color ? { color } : {}} /> {label}
    </a>
  );

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="brand">
        <img src="/logo.png" className="brand-logo" alt="logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>Periscope</span>
          <span style={{
            fontSize: '0.62rem',
            color: '#60a5fa',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: '4px',
            letterSpacing: '0.5px',
            textTransform: 'uppercase'
          }}>
            <svg viewBox="0 0 256 250" width="11" height="11" style={{ display: 'inline-block', flexShrink: 0 }}>
              <path d="M128 0L239.53 53.64V178.6L128 250L16.47 178.6V53.64L128 0Z" fill="#326CE5"/>
              <path d="M128 35.12L208.57 73.84V163.66L128 215.12L47.43 163.66V73.84L128 35.12Z" fill="white"/>
              <path d="M128 53.68V95.73M128 153.27V195.32M74.96 158.73L104.7 128.99M181.04 90.27L151.3 120.01M53.68 128H95.73M153.27 128H195.32M74.96 97.27L104.7 127.01M181.04 151.73L151.3 121.99" stroke="#326CE5" strokeWidth="18" strokeLinecap="round"/>
              <circle cx="128" cy="128" r="28" fill="#326CE5"/>
            </svg>
            Kubernetes
          </span>
        </div>
      </div>

      <div style={{ padding: '0 12px', marginBottom: 20 }}>
        <NavItem id="dashboard" icon={SlidersHorizontal} label="Dashboard" />
      </div>

      <div className="nav-section">
        <div className="nav-section-title" onClick={() => toggleSection('cluster')}>
          <span>Cluster</span>
          <span style={{ display: 'inline-block', fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['cluster'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
        </div>
        {!collapsedSections['cluster'] && (
          <nav className="nav-menu">
            <NavItem id="topology" icon={Activity} label="Topology" />
            <NavItem id="nodes" icon={Server} label="Nodes" />
            <NavItem id="events" icon={List} label="Events" />
            <NavItem id="logs" icon={Terminal} label="Logs" />
            <NavItem id="cluster-terminal" icon={Code} label="Cluster Terminal" color="var(--accent-cyan)" />
            <NavItem id="crds" icon={Code} label="CRD Explorer" />
          </nav>
        )}
      </div>

      <div className="nav-section">
        <div className="nav-section-title" onClick={() => toggleSection('workloads')}>
          <span>Workloads</span>
          <span style={{ display: 'inline-block', fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['workloads'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
        </div>
        {!collapsedSections['workloads'] && (
          <nav className="nav-menu">
            <NavItem id="pods" icon={Box} label="Pods" />
            <NavItem id="deployments" icon={Layers} label="Deployments" />
            <NavItem id="statefulsets" icon={Layers} label="StatefulSets" />
            <NavItem id="daemonsets" icon={Layers} label="DaemonSets" />
            <NavItem id="jobs" icon={Activity} label="Jobs" />
            <NavItem id="cronjobs" icon={Activity} label="CronJobs" />
          </nav>
        )}
      </div>

      <div className="nav-section">
        <div className="nav-section-title" onClick={() => toggleSection('network')}>
          <span>Networking</span>
          <span style={{ display: 'inline-block', fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['network'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
        </div>
        {!collapsedSections['network'] && (
          <nav className="nav-menu">
            <NavItem id="services" icon={GitCommit} label="Services" />
            <NavItem id="ingresses" icon={Shield} label="Ingresses" />
            <NavItem id="traffic" icon={Radio} label="Traffic Inspector" color="var(--accent-cyan)" />
          </nav>
        )}
      </div>

      <div className="nav-section">
        <div className="nav-section-title" onClick={() => toggleSection('config')}>
          <span>Configuration</span>
          <span style={{ display: 'inline-block', fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['config'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
        </div>
        {!collapsedSections['config'] && (
          <nav className="nav-menu">
            <NavItem id="configmaps" icon={FileText} label="ConfigMaps" />
            <NavItem id="secrets" icon={Key} label="Secrets" />
            <NavItem id="persistentvolumes" icon={Database} label="PVs" />
            <NavItem id="persistentvolumeclaims" icon={HardDriveDownload} label="PVCs" />
          </nav>
        )}
      </div>

      <div className="nav-section">
        <div className="nav-section-title" onClick={() => toggleSection('helm')}>
          <span>Packaging</span>
          <span style={{ display: 'inline-block', fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['helm'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
        </div>
        {!collapsedSections['helm'] && (
          <nav className="nav-menu">
            <NavItem id="helm" icon={Package} label="Helm Releases" />
            <NavItem id="helm-repos" icon={Database} label="Repo Manager" />
            <NavItem id="zarf" icon={Package} label="Zarf Packages" />
            <NavItem id="zarf-registry" icon={Database} label="Zarf Registry" />
            <NavItem 
              id="custom" 
              icon={Code} 
              label="K3s HelmCharts" 
              onClick={() => {
                setCustomCrd({ group: 'helm.cattle.io', version: 'v1', plural: 'helmcharts', name: 'helmcharts.helm.cattle.io' });
                setActiveTab('custom');
                setSearch('');
              }}
            />
            <NavItem 
              id="custom" 
              icon={Code} 
              label="K3s ChartConfigs" 
              onClick={() => {
                setCustomCrd({ group: 'helm.cattle.io', version: 'v1', plural: 'helmchartconfigs', name: 'helmchartconfigs.helm.cattle.io' });
                setActiveTab('custom');
                setSearch('');
              }}
            />
          </nav>
        )}
      </div>

      <div className="nav-section">
        <div className="nav-section-title" onClick={() => toggleSection('security')}>
          <span>Security</span>
          <span style={{ display: 'inline-block', fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['security'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
        </div>
        {!collapsedSections['security'] && (
          <nav className="nav-menu">
            <NavItem id="image-scanner" icon={Microscope} label="Image SBOM (Grype)" />
            <NavItem id="kubescape" icon={ShieldAlert} label="Kubescape Audit" />
            <NavItem id="networkpolicies" icon={Network} label="Network Policies" />
          </nav>
        )}
      </div>

      <div className="nav-section">
        <div className="nav-section-title" onClick={() => toggleSection('operations')}>
          <span>Operations</span>
          <span style={{ display: 'inline-block', fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['operations'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
        </div>
        {!collapsedSections['operations'] && (
          <nav className="nav-menu">
            <NavItem id="cluster-pruner" icon={Trash2} label="Cluster Pruner" color="var(--accent-warning)" />
            <NavItem id="alert-settings" icon={Bell} label="Event Alerts" color="var(--accent-cyan)" />
            <NavItem id="autoscale-manager" icon={TrendingUp} label="Autoscale Manager" color="var(--accent-blue)" />
            <NavItem id="backup-restore" icon={HardDrive} label="Backup & Restore" color="var(--accent-success)" />
            <NavItem id="cronjob-manager" icon={Clock} label="CronJob Manager" color="var(--accent-cyan)" />
          </nav>
        )}
      </div>
    </aside>
  );
};

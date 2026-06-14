import { Server, Box, Layers, Activity, SlidersHorizontal } from 'lucide-react';
import { parseCpu, parseMem } from '../utils/helpers';

interface StatsGridProps {
  stats: { nodes: number; pods: number; deployments: number };
  nodeMetrics: any[];
  getNodeCapacity: (name: string, metric: any) => { cpu: number; memory: number };
  setActiveTab: (tab: any) => void;
}

export const StatsGrid = ({ stats, nodeMetrics, getNodeCapacity, setActiveTab }: StatsGridProps) => {
  let totalCpuUse = 0;
  let totalCpuCap = 0;
  let totalMemUse = 0;
  let totalMemCap = 0;

  nodeMetrics.forEach(nm => {
    const { cpu, memory } = getNodeCapacity(nm.metadata.name, nm);
    totalCpuCap += cpu;
    totalMemCap += memory;
    totalCpuUse += parseCpu(nm.usage?.cpu || '0');
    totalMemUse += parseMem(nm.usage?.memory || '0');
  });

  const cpuPercent = totalCpuCap > 0 ? Math.min(100, Math.round((totalCpuUse / totalCpuCap) * 100)) : 0;
  const memPercent = totalMemCap > 0 ? Math.min(100, Math.round((totalMemUse / totalMemCap) * 100)) : 0;

  return (
    <div className="stats-grid">
      <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('nodes')}>
        <div className="stat-icon"><Server size={24}/></div>
        <div className="stat-info">
          <span className="stat-value">{stats.nodes}</span>
          <span className="stat-label">Total Nodes</span>
        </div>
      </div>
      <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('pods')}>
        <div className="stat-icon"><Box size={24}/></div>
        <div className="stat-info">
          <span className="stat-value">{stats.pods}</span>
          <span className="stat-label">Active Pods</span>
        </div>
      </div>
      <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('deployments')}>
        <div className="stat-icon"><Layers size={24}/></div>
        <div className="stat-info">
          <span className="stat-value">{stats.deployments}</span>
          <span className="stat-label">Deployments</span>
        </div>
      </div>
      {nodeMetrics.length > 0 && (
        <>
          <div className="stat-card animate-fade-in">
            <div className="stat-icon" style={{ background: 'rgba(0, 240, 255, 0.1)', color: 'var(--accent-cyan)' }}><Activity size={24}/></div>
            <div className="stat-info" style={{ flex: 1 }}>
              <span className="stat-value">{cpuPercent}%</span>
              <span className="stat-label">Cluster CPU</span>
              <div className="metric-bar-wrapper" style={{ marginTop: 4 }}>
                <div className={`metric-bar-fill ${cpuPercent > 80 ? 'critical' : cpuPercent > 60 ? 'warning' : 'normal'}`} style={{ width: `${cpuPercent}%` }}></div>
              </div>
            </div>
          </div>
          <div className="stat-card animate-fade-in">
            <div className="stat-icon" style={{ background: 'rgba(248, 30, 229, 0.1)', color: 'var(--accent-purple)' }}><SlidersHorizontal size={24}/></div>
            <div className="stat-info" style={{ flex: 1 }}>
              <span className="stat-value">{memPercent}%</span>
              <span className="stat-label">Cluster RAM</span>
              <div className="metric-bar-wrapper" style={{ marginTop: 4 }}>
                <div className={`metric-bar-fill ${memPercent > 80 ? 'critical' : memPercent > 60 ? 'warning' : 'normal'}`} style={{ width: `${memPercent}%` }}></div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

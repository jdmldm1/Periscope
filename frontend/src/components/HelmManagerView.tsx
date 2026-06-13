import React from 'react';
import { Search, RefreshCw, Trash2, X, Package } from 'lucide-react';

interface HelmManagerViewProps {
  resources: any[];
  selectedNs: string;
  search: string;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  setModal: (modal: any) => void;
  handleDelete: (resource: any) => void;
  isInstallModalOpen: boolean;
  setIsInstallModalOpen: (open: boolean) => void;
  
  // Releases Inspect States
  selectedHelmRelease: { name: string; namespace: string } | null;
  setSelectedHelmRelease: (release: { name: string; namespace: string } | null) => void;
  fetchHelmInspect: (namespace: string, releaseName: string, tabType: 'values' | 'manifest' | 'notes') => void;
  helmInspectTab: 'values' | 'manifest' | 'notes';
  setHelmInspectTab: (tab: 'values' | 'manifest' | 'notes') => void;
  isFetchingHelmInspect: boolean;
  helmInspectData: string;
  
  // Upgrade release states
  helmUpgradeChartRef: string;
  setHelmUpgradeChartRef: (ref: string) => void;
  isUpgradingHelm: boolean;
  handleHelmUpgrade: (releaseName: string, namespace: string) => void;
  helmUpgradeValues: string;
  setHelmUpgradeValues: (val: string) => void;
  
  // Custom Install states
  helmCustomInstall: {
    releaseName: string;
    repo: string;
    chartName: string;
    version: string;
    namespace: string;
    valuesYaml: string;
  };
  setHelmCustomInstall: React.Dispatch<React.SetStateAction<{
    releaseName: string;
    repo: string;
    chartName: string;
    version: string;
    namespace: string;
    valuesYaml: string;
  }>>;
  handleCustomHelmInstall: (e: React.FormEvent) => void;
  isSubmittingHelmDeploy: boolean;
  
  // Repo Manager states
  helmRepos: any[];
  newHelmRepo: { name: string; url: string };
  setNewHelmRepo: React.Dispatch<React.SetStateAction<{ name: string; url: string }>>;
  isSubmittingHelmRepo: boolean;
  handleAddHelmRepo: (e: React.FormEvent) => void;
  handleRemoveHelmRepo: (name: string) => void;
  handleUpdateHelmRepos: () => void;
  
  // Repo Search states
  helmSearchQuery: string;
  setHelmSearchQuery: (query: string) => void;
  helmSearchResults: any[];
  isSearchingHelm: boolean;
  handleSearchHelmRepo: (e: React.FormEvent) => void;
}

// Helper functions for Helm values.schema.json Form Generator
const getNestedValue = (obj: any, path: string[]): any => {
  return path.reduce((xs, x) => (xs && xs[x] !== undefined) ? xs[x] : undefined, obj);
};

const setNestedValue = (obj: any, path: string[], value: any): any => {
  const [head, ...tail] = path;
  const newObj = { ...obj };
  if (tail.length === 0) {
    newObj[head] = value;
    return newObj;
  }
  if (!newObj[head] || typeof newObj[head] !== 'object') {
    newObj[head] = {};
  }
  newObj[head] = setNestedValue(newObj[head], tail, value);
  return newObj;
};

const objToYaml = (obj: any, indent = 0): string => {
  if (obj === null || obj === undefined) return '';
  let yaml = '';
  const spaces = ' '.repeat(indent);
  
  if (typeof obj !== 'object') {
    return String(obj);
  }
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return ' []';
    let arrYaml = '';
    obj.forEach(val => {
      if (typeof val === 'object') {
        arrYaml += `\n${spaces}- ${objToYaml(val, indent + 2).trimStart()}`;
      } else {
        arrYaml += `\n${spaces}- ${val}`;
      }
    });
    return arrYaml;
  }
  
  Object.entries(obj).forEach(([key, val]) => {
    if (val === null || val === undefined) return;
    if (typeof val === 'object') {
      const sub = objToYaml(val, indent + 2);
      if (sub.trim() === '[]' || sub.trim() === '{}' || sub === '') {
        yaml += `${spaces}${key}:${sub}\n`;
      } else {
        yaml += `${spaces}${key}:\n${sub}`;
      }
    } else {
      const valStr = String(val);
      if (valStr.includes('\n')) {
        yaml += `${spaces}${key}: |-\n${valStr.split('\n').map(l => ' '.repeat(indent + 2) + l).join('\n')}\n`;
      } else {
        yaml += `${spaces}${key}: ${val}\n`;
      }
    }
  });
  return yaml;
};

const extractSchemaDefaults = (schemaObj: any): Record<string, any> => {
  const defaults: Record<string, any> = {};
  if (!schemaObj || !schemaObj.properties) return defaults;
  
  const parseDefaults = (properties: any, currentObj: any) => {
    Object.entries(properties).forEach(([key, propValue]) => {
      const prop = propValue as any;
      if (prop.type === 'object' && prop.properties) {
        currentObj[key] = {};
        parseDefaults(prop.properties, currentObj[key]);
        if (Object.keys(currentObj[key]).length === 0) {
          delete currentObj[key];
        }
      } else if (prop.default !== undefined) {
        currentObj[key] = prop.default;
      }
    });
  };
  
  parseDefaults(schemaObj.properties, defaults);
  return defaults;
};

export const HelmManagerView: React.FC<HelmManagerViewProps> = ({
  resources,
  search,
  activeTab,
  setActiveTab,
  setModal,
  handleDelete,
  isInstallModalOpen,
  setIsInstallModalOpen,
  selectedHelmRelease,
  setSelectedHelmRelease,
  fetchHelmInspect,
  helmInspectTab,
  setHelmInspectTab,
  isFetchingHelmInspect,
  helmInspectData,
  helmUpgradeChartRef,
  setHelmUpgradeChartRef,
  isUpgradingHelm,
  handleHelmUpgrade,
  helmUpgradeValues,
  setHelmUpgradeValues,
  helmCustomInstall,
  setHelmCustomInstall,
  handleCustomHelmInstall,
  isSubmittingHelmDeploy,
  helmRepos,
  newHelmRepo,
  setNewHelmRepo,
  isSubmittingHelmRepo,
  handleAddHelmRepo,
  handleRemoveHelmRepo,
  handleUpdateHelmRepos,
  helmSearchQuery,
  setHelmSearchQuery,
  helmSearchResults,
  isSearchingHelm,
  handleSearchHelmRepo,
}) => {
  const [schema, setSchema] = React.useState<any | null>(null);
  const [isFetchingSchema, setIsFetchingSchema] = React.useState<boolean>(false);
  const [schemaError, setSchemaError] = React.useState<string | null>(null);

  // Prevent TS unused warning
  if (false) {
    setActiveTab(null);
  }
  const [activeFormTab, setActiveFormTab] = React.useState<'yaml' | 'form'>('yaml');
  const [formValues, setFormValues] = React.useState<Record<string, any>>({});

  const handleLoadSchema = async () => {
    if (!helmCustomInstall.repo || !helmCustomInstall.chartName) {
      setSchemaError('Repository and Chart Name are required to fetch schema');
      return;
    }
    setIsFetchingSchema(true);
    setSchemaError(null);
    setSchema(null);
    try {
      const res = await fetch(`/api/helm/schema?chartName=${encodeURIComponent(helmCustomInstall.repo)}/${encodeURIComponent(helmCustomInstall.chartName)}&version=${encodeURIComponent(helmCustomInstall.version)}`);
      if (!res.ok) {
        throw new Error(await res.text() || 'Chart values.schema.json not found');
      }
      const data = await res.json();
      setSchema(data);
      const defaults = extractSchemaDefaults(data);
      setFormValues(defaults);
      const yamlStr = objToYaml(defaults);
      setHelmCustomInstall(prev => ({ ...prev, valuesYaml: yamlStr }));
      setActiveFormTab('form');
    } catch (err: any) {
      console.error(err);
      setSchemaError(err.message || 'Failed to fetch Helm values schema');
    } finally {
      setIsFetchingSchema(false);
    }
  };

  const renderSchemaProperties = (properties: any, currentPath: string[] = []): React.ReactNode => {
    if (!properties) return null;
    
    return Object.entries(properties).map(([key, propValue]) => {
      const prop = propValue as any;
      const path = [...currentPath, key];
      const pathStr = path.join('.');
      const title = prop.title || key;
      const type = prop.type;
      const description = prop.description || '';
      
      if (type === 'object' && prop.properties) {
        return (
          <details key={pathStr} open style={{ border: '1px solid rgba(255,255,255,0.04)', borderRadius: 6, padding: '10px 14px', marginBottom: 12, background: 'rgba(0,0,0,0.1)' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)', userSelect: 'none' }}>
              📁 {title} {description && <span style={{ fontWeight: 400, fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 8 }}>({description})</span>}
            </summary>
            <div style={{ marginTop: 12, paddingLeft: 12, borderLeft: '1px dashed var(--border-color)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {renderSchemaProperties(prop.properties, path)}
            </div>
          </details>
        );
      }
      
      const value = getNestedValue(formValues, path) ?? prop.default ?? '';
      
      const handleChange = (val: any) => {
        const updated = setNestedValue({ ...formValues }, path, val);
        setFormValues(updated);
        const yamlStr = objToYaml(updated);
        setHelmCustomInstall(prev => ({ ...prev, valuesYaml: yamlStr }));
      };

      if (type === 'boolean') {
        return (
          <div key={pathStr} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0' }}>
            <input 
              type="checkbox" 
              id={pathStr}
              checked={!!value}
              onChange={e => handleChange(e.target.checked)}
              style={{ cursor: 'pointer', marginTop: 3 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label htmlFor={pathStr} style={{ fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', color: 'var(--text-main)' }}>
                {title}
              </label>
              {description && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{description}</span>}
            </div>
          </div>
        );
      }
      
      if (type === 'integer' || type === 'number') {
        return (
          <div key={pathStr} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
              {title} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(number)</span>
            </label>
            <input 
              type="number"
              className="exec-input"
              style={{ padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)', width: '200px' }}
              value={value}
              onChange={e => handleChange(Number(e.target.value))}
              placeholder={String(prop.default ?? '')}
            />
            {description && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{description}</span>}
          </div>
        );
      }
      
      if (type === 'string') {
        const enumList = prop.enum;
        if (enumList && Array.isArray(enumList)) {
          return (
            <div key={pathStr} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                {title}
              </label>
              <select
                className="select-ns"
                style={{ padding: '6px 10px', width: '200px' }}
                value={value}
                onChange={e => handleChange(e.target.value)}
              >
                {enumList.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              {description && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{description}</span>}
            </div>
          );
        }
        
        return (
          <div key={pathStr} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
              {title}
            </label>
            <input 
              type="text"
              className="exec-input"
              style={{ padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)' }}
              value={value}
              onChange={e => handleChange(e.target.value)}
              placeholder={String(prop.default ?? '')}
            />
            {description && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{description}</span>}
          </div>
        );
      }
      
      return null;
    });
  };

  const filteredResources = resources.filter(r => {
    const term = search.toLowerCase();
    if (!term) return true;
    return (r.metadata?.name || '').toLowerCase().includes(term);
  });

  const renderHelmReleasesView = () => {
    return (
      <div className="helm-releases-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Active Releases ({filteredResources.length})</h3>
          <button className="btn btn-primary" onClick={() => setIsInstallModalOpen(true)}>
            <Package size={14} /> Install Chart
          </button>
        </div>
        {filteredResources.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', padding: '20px 0', border: '1px dashed var(--border-color)', borderRadius: 8, textAlign: 'center' }}>
            No Helm releases found in this namespace/cluster.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredResources.filter((res: any) => res && res.metadata && res.metadata.uid?.startsWith('helm-')).map((res: any) => {
              const name = res.metadata.name;
              const ns = res.metadata.namespace;
              const status = res.status?.phase || 'unknown';
              const isSelected = selectedHelmRelease?.name === name && selectedHelmRelease?.namespace === ns;
              
              return (
                <div 
                  key={res.metadata.uid}
                  className={`resource-row ${isSelected ? 'active' : ''}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    padding: '16px 20px',
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isSelected ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                    borderRadius: 8,
                    alignItems: 'stretch'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-main)' }}>{name}</span>
                        <span className={`badge ${status.toLowerCase() === 'deployed' ? 'ready' : 'error'}`}>{status}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Chart: <span style={{ color: 'var(--text-main)', marginRight: 12 }}>{res.chart}</span>
                        Rev: <span style={{ color: 'var(--text-main)', marginRight: 12 }}>{res.revision}</span>
                        App Version: <span style={{ color: 'var(--text-main)', marginRight: 12 }}>{res.appVersion || 'N/A'}</span>
                        NS: <span style={{ color: 'var(--text-main)' }}>{ns}</span>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button 
                        className="btn"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedHelmRelease(null);
                          } else {
                            setSelectedHelmRelease({ name, namespace: ns });
                            fetchHelmInspect(ns, name, helmInspectTab);
                          }
                        }}
                      >
                        <Search size={14} /> {isSelected ? 'Close Details' : 'Inspect'}
                      </button>
                      <button 
                        className="btn"
                        onClick={() => setModal({ type: 'history', name, namespace: ns, kind: 'helm', uid: res.metadata.uid })}
                      >
                        <RefreshCw size={14} /> History
                      </button>
                      <button 
                        className="btn btn-danger"
                        onClick={() => handleDelete(res)}
                      >
                        <Trash2 size={14} /> Uninstall
                      </button>
                    </div>
                  </div>

                  {/* Release Inspect Panel */}
                  {isSelected && (
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* Inspect tabs */}
                      <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                        {(['values', 'manifest', 'notes'] as const).map((t) => (
                          <button 
                            key={t}
                            className={`btn ${helmInspectTab === t ? 'btn-primary' : ''}`}
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            onClick={() => {
                              setHelmInspectTab(t);
                              fetchHelmInspect(ns, name, t);
                            }}
                          >
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </button>
                        ))}
                      </div>

                      {/* Inspector output */}
                      {isFetchingHelmInspect ? (
                        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Fetching release details...</div>
                      ) : helmInspectTab === 'values' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Upgrade Chart Reference (e.g. bitnami/nginx or chart name)</label>
                              <input
                                type="text"
                                className="exec-input"
                                style={{ padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: '0.85rem', color: 'var(--text-main)' }}
                                value={helmUpgradeChartRef}
                                onChange={e => setHelmUpgradeChartRef(e.target.value)}
                                placeholder="e.g. bitnami/nginx"
                              />
                            </div>
                            <button
                              className="btn btn-primary"
                              onClick={() => handleHelmUpgrade(name, ns)}
                              disabled={isUpgradingHelm}
                              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                            >
                              {isUpgradingHelm ? 'Upgrading...' : 'Upgrade Release'}
                            </button>
                          </div>
                          <textarea
                            style={{
                              padding: '12px 16px',
                              background: 'var(--bg-main)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 6,
                              height: 250,
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.85rem',
                              color: 'var(--text-main)',
                              resize: 'vertical'
                            }}
                            value={helmUpgradeValues}
                            onChange={e => setHelmUpgradeValues(e.target.value)}
                            placeholder="# Enter values overrides here"
                          />
                        </div>
                      ) : (
                        <pre 
                          className="code-block"
                          style={{
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 6,
                            padding: '12px 16px',
                            fontSize: '0.85rem',
                            maxHeight: 300,
                            overflowY: 'auto',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-main)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all'
                          }}
                        >
                          {helmInspectData || 'No data returned.'}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderHelmInstallView = () => {
    return (
      <div className="helm-install-view" style={{ padding: '0 20px 20px' }}>
        <form onSubmit={handleCustomHelmInstall} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Release Name</label>
              <input 
                type="text"
                className="exec-input"
                style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)' }}
                value={helmCustomInstall.releaseName}
                onChange={e => setHelmCustomInstall(prev => ({ ...prev, releaseName: e.target.value }))}
                placeholder="e.g. my-nginx"
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Namespace</label>
              <input 
                type="text"
                className="exec-input"
                style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)' }}
                value={helmCustomInstall.namespace}
                onChange={e => setHelmCustomInstall(prev => ({ ...prev, namespace: e.target.value }))}
                placeholder="e.g. default"
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Chart Repository</label>
              <input 
                type="text"
                className="exec-input"
                style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)' }}
                value={helmCustomInstall.repo}
                onChange={e => setHelmCustomInstall(prev => ({ ...prev, repo: e.target.value }))}
                placeholder="e.g. bitnami"
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Chart Name</label>
              <input 
                type="text"
                className="exec-input"
                style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)' }}
                value={helmCustomInstall.chartName}
                onChange={e => setHelmCustomInstall(prev => ({ ...prev, chartName: e.target.value }))}
                placeholder="e.g. nginx"
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Version (Optional)</label>
              <input 
                type="text"
                className="exec-input"
                style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)' }}
                value={helmCustomInstall.version}
                onChange={e => setHelmCustomInstall(prev => ({ ...prev, version: e.target.value }))}
                placeholder="e.g. 15.2.3"
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--border-color)', borderRadius: 8, padding: 16, background: 'rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 10 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  className={`btn ${activeFormTab === 'yaml' ? 'btn-primary' : ''}`}
                  onClick={() => setActiveFormTab('yaml')}
                  style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                >
                  📝 Raw YAML Editor
                </button>
                <button
                  type="button"
                  className={`btn ${activeFormTab === 'form' ? 'btn-primary' : ''}`}
                  disabled={!schema}
                  onClick={() => setActiveFormTab('form')}
                  style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                >
                  ⚡ Interactive Form Configuration {schema ? '' : '(Schema Not Loaded)'}
                </button>
              </div>
              
              <button
                type="button"
                className="btn"
                onClick={handleLoadSchema}
                disabled={isFetchingSchema || !helmCustomInstall.repo || !helmCustomInstall.chartName}
                style={{ padding: '4px 10px', fontSize: '0.8rem', color: 'var(--accent-cyan)' }}
              >
                {isFetchingSchema ? 'Loading Schema...' : 'Load Chart Schema'}
              </button>
            </div>

            {schemaError && (
              <div style={{ color: '#ef4444', fontSize: '0.80rem', padding: '6px 0' }}>
                ⚠️ {schemaError} (Make sure the repo is added and chart exists)
              </div>
            )}

            {activeFormTab === 'yaml' ? (
              <textarea 
                style={{ 
                  padding: '12px 16px', 
                  background: 'var(--bg-main)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: 4, 
                  height: 250, 
                  fontFamily: 'var(--font-mono)', 
                  fontSize: '0.85rem',
                  color: 'var(--text-main)',
                  resize: 'vertical',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
                value={helmCustomInstall.valuesYaml}
                onChange={e => setHelmCustomInstall(prev => ({ ...prev, valuesYaml: e.target.value }))}
                placeholder="# Enter values.yaml overrides here"
              />
            ) : (
              <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 10 }}>
                {schema && schema.properties ? (
                  renderSchemaProperties(schema.properties)
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
                    No properties found in values.schema.json.
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
            <button type="button" className="btn" onClick={() => setIsInstallModalOpen(false)} disabled={isSubmittingHelmDeploy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmittingHelmDeploy}>
              {isSubmittingHelmDeploy ? 'Deploying...' : 'Deploy'}
            </button>
          </div>
        </form>
      </div>
    );
  };

  const renderHelmReposView = () => {
    return (
      <div className="helm-repos-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Configured Repositories</h3>
            <button className="btn" onClick={handleUpdateHelmRepos} disabled={isSubmittingHelmRepo}>
              <RefreshCw size={14} className={isSubmittingHelmRepo ? 'spin' : ''} /> Update Repos
            </button>
          </div>

          {helmRepos.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '16px 0' }}>No chart repositories configured.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {helmRepos.map((r: any) => (
                <div 
                  key={r.name} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '10px 14px', 
                    background: 'rgba(255,255,255,0.02)', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: 6 
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{r.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.url}</div>
                  </div>
                  <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => handleRemoveHelmRepo(r.name)}>
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddHelmRepo} style={{ display: 'flex', gap: 12, marginTop: 16, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
            <input 
              type="text" 
              placeholder="Repo Name (e.g. bitnami)" 
              className="exec-input" 
              style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)' }}
              value={newHelmRepo.name}
              onChange={e => setNewHelmRepo(prev => ({ ...prev, name: e.target.value }))}
              disabled={isSubmittingHelmRepo}
            />
            <input 
              type="text" 
              placeholder="URL (e.g. https://charts.bitnami.com/bitnami)" 
              className="exec-input" 
              style={{ flex: 2, padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)' }}
              value={newHelmRepo.url}
              onChange={e => setNewHelmRepo(prev => ({ ...prev, url: e.target.value }))}
              disabled={isSubmittingHelmRepo}
            />
            <button type="submit" className="btn btn-primary" disabled={isSubmittingHelmRepo}>
              Add Repo
            </button>
          </form>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: 16 }}>Search Repository Charts</h3>
          <form onSubmit={handleSearchHelmRepo} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <input 
              type="text" 
              placeholder="Search query (e.g. nginx, redis...)" 
              className="exec-input" 
              style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)' }}
              value={helmSearchQuery}
              onChange={e => setHelmSearchQuery(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={isSearchingHelm}>
              {isSearchingHelm ? 'Searching...' : 'Search'}
            </button>
          </form>

          {helmSearchResults.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>Enter a query above to search chart repositories.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
              {helmSearchResults.map((c: any) => {
                const parts = c.name.split('/');
                const repoName = parts[0];
                const chartName = parts[1] || parts[0];
                
                return (
                  <div 
                    key={c.name}
                    style={{ 
                      padding: '12px 16px', 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ flex: 1, paddingRight: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{c.name}</span>
                        <span className="badge badge-running" style={{ fontSize: '0.7rem', padding: '1px 5px', textTransform: 'none' }}>v{c.version}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{c.description}</div>
                    </div>
                    <button 
                      className="btn btn-primary"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      onClick={() => {
                        setHelmCustomInstall({
                          releaseName: chartName,
                          repo: repoName,
                          chartName: chartName,
                          version: c.version,
                          namespace: 'default',
                          valuesYaml: '# Custom values here\n'
                        });
                        setIsInstallModalOpen(true);
                      }}
                    >
                      Configure & Deploy
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {activeTab === 'helm-repos' ? renderHelmReposView() : renderHelmReleasesView()}
      
      {isInstallModalOpen && (
        <div className="modal-overlay" onClick={() => setIsInstallModalOpen(false)}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ width: '92%', maxWidth: '1300px', height: '86vh', maxHeight: '88vh' }}>
            <div className="modal-header">
              <div className="modal-title">Install Helm Chart</div>
              <button className="btn btn-icon" onClick={() => setIsInstallModalOpen(false)}><X size={16}/></button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto' }}>
              {renderHelmInstallView()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

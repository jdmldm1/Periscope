import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const useClusterActions = (fetchResources: () => void) => {
  const handleRestart = async (name: string, namespace: string) => {
    if (!window.confirm(`Restart deployment ${name}?`)) return;
    try {
      await api.put(`/resource/deployments/${namespace}/${name}/restart`);
      fetchResources();
    } catch (err) { console.error(err); }
  };

  const handleScale = async (name: string, namespace: string, current: number) => {
    const scaleTo = window.prompt(`Scale deployment ${name} to:`, current.toString());
    if (scaleTo === null || isNaN(Number(scaleTo))) return;
    try {
      await api.put(`/resource/deployments/${namespace}/${name}/scale`, { replicas: Number(scaleTo) });
      fetchResources();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (kind: string, name: string, namespace: string, customCrd?: any) => {
    if (!window.confirm(`Are you sure you want to delete ${kind} ${name}?`)) return;
    try {
      const endpoint = kind === 'helm' 
        ? `/helm/${namespace}/${name}` 
        : kind === 'custom' && customCrd
        ? `/custom/${customCrd.group}/${customCrd.version}/${customCrd.plural}/${namespace}/${name}`
        : `/resource/${kind}/${namespace}/${name}`;
      await api.delete(endpoint);
      fetchResources();
    } catch (err) { console.error(err); }
  };

  return {
    handleRestart,
    handleScale,
    handleDelete,
  };
};

import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

const errMsg = (err: unknown) => {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error || e?.message || 'Unknown error';
};

export const useClusterActions = (refresh: () => void) => {
  const handleRestart = async (name: string, namespace: string) => {
    if (!window.confirm(`Restart deployment ${name}?`)) return;
    try {
      await api.put(`/resource/deployments/${namespace}/${name}/restart`);
      refresh();
    } catch (err) {
      console.error(err);
      window.alert(`Failed to restart ${name}: ${errMsg(err)}`);
    }
  };

  const handleScale = async (name: string, namespace: string, current: number) => {
    const scaleTo = window.prompt(`Scale deployment ${name} to:`, current.toString());
    if (scaleTo === null || isNaN(Number(scaleTo))) return;
    try {
      await api.put(`/resource/deployments/${namespace}/${name}/scale`, { replicas: Number(scaleTo) });
      refresh();
    } catch (err) {
      console.error(err);
      window.alert(`Failed to scale ${name}: ${errMsg(err)}`);
    }
  };

  // Stop a deployment by scaling it to 0. The backend remembers the previous
  // replica count so handleStart can bring it back to where it was.
  const handleStop = async (name: string, namespace: string) => {
    if (!window.confirm(
      `Stop deployment ${name}?\n\nThis scales it to 0 replicas and terminates all of its pods. ` +
      `You can Start it again later to restore the previous replica count.`
    )) return;
    try {
      await api.put(`/resource/deployments/${namespace}/${name}/stop`);
      refresh();
    } catch (err) {
      console.error(err);
      window.alert(`Failed to stop ${name}: ${errMsg(err)}`);
    }
  };

  const handleStart = async (name: string, namespace: string) => {
    try {
      await api.put(`/resource/deployments/${namespace}/${name}/start`);
      refresh();
    } catch (err) {
      console.error(err);
      window.alert(`Failed to start ${name}: ${errMsg(err)}`);
    }
  };

  const handleDelete = async (kind: string, name: string, namespace: string, customCrd?: any) => {
    const confirmMsg = kind === 'pods'
      ? `Delete pod ${name}?\n\nThe pod will be terminated immediately. If it is managed by a ` +
        `Deployment, StatefulSet, or other controller, a replacement pod will be created ` +
        `automatically — to keep the workload stopped, Stop the controlling Deployment instead.`
      : `Are you sure you want to delete ${kind} ${name}?`;
    if (!window.confirm(confirmMsg)) return;
    try {
      const endpoint = kind === 'helm'
        ? `/helm/${namespace}/${name}`
        : kind === 'custom' && customCrd
        ? `/custom/${customCrd.group}/${customCrd.version}/${customCrd.plural}/${namespace}/${name}`
        : `/resource/${kind}/${namespace}/${name}`;
      await api.delete(endpoint);
      refresh();
    } catch (err) {
      console.error(err);
      window.alert(`Failed to delete ${name}: ${errMsg(err)}`);
    }
  };

  return {
    handleRestart,
    handleScale,
    handleStop,
    handleStart,
    handleDelete,
  };
};

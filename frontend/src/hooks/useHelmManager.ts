import { useState, useEffect } from 'react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const api = axios.create({ baseURL: '/api/helm' });

export const useHelmManager = () => {
  const queryClient = useQueryClient();
  const [helmRepos, setHelmRepos] = useState<any[]>([]);
  const [helmSearchQuery, setHelmSearchQuery] = useState('');
  const [helmSearchResults, setHelmSearchResults] = useState<any[]>([]);
  const [isSearchingHelm, setIsSearchingHelm] = useState(false);
  const [newHelmRepo, setNewHelmRepo] = useState({ name: '', url: '' });

  const { data: reposData } = useQuery({
    queryKey: ['helm-repos'],
    queryFn: async () => {
      const { data } = await api.get('/repos');
      return data;
    },
  });

  useEffect(() => {
    if (reposData) setHelmRepos(reposData);
  }, [reposData]);

  const addRepoMutation = useMutation({
    mutationFn: async (repo: { name: string; url: string }) => {
      const { data } = await api.post('/repos', repo);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helm-repos'] });
      setNewHelmRepo({ name: '', url: '' });
    },
  });

  const removeRepoMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.delete(`/repos/${name}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helm-repos'] });
    },
  });

  const updateReposMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/repos/update');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helm-repos'] });
    },
  });

  const searchRepos = async (q: string) => {
    setIsSearchingHelm(true);
    try {
      const { data } = await api.get('/search', { params: { q } });
      setHelmSearchResults(data);
    } catch (err) {
      setHelmSearchResults([]);
    } finally {
      setIsSearchingHelm(false);
    }
  };

  return {
    helmRepos,
    helmSearchQuery,
    setHelmSearchQuery,
    helmSearchResults,
    isSearchingHelm,
    searchRepos,
    addRepo: addRepoMutation.mutateAsync,
    removeRepo: removeRepoMutation.mutateAsync,
    updateRepos: updateReposMutation.mutateAsync,
    newHelmRepo,
    setNewHelmRepo
  };
};

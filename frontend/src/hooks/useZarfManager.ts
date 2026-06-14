import { useState, useEffect } from 'react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const api = axios.create({ baseURL: '/api/zarf' });

export const useZarfManager = () => {
  const queryClient = useQueryClient();
  const [zarfPackages, setZarfPackages] = useState<any[]>([]);
  const [registryImages, setRegistryImages] = useState<any[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);

  const { data: packagesData } = useQuery({
    queryKey: ['zarf-packages'],
    queryFn: async () => {
      const { data } = await api.get('/packages');
      return data;
    },
    refetchInterval: 15000,
  });

  const { data: imagesData } = useQuery({
    queryKey: ['zarf-images'],
    queryFn: async () => {
      const { data } = await api.get('/registry/all-images');
      return data;
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (packagesData) setZarfPackages(packagesData);
  }, [packagesData]);

  useEffect(() => {
    if (imagesData) setRegistryImages(imagesData);
  }, [imagesData]);

  const deployPackageMutation = useMutation({
    mutationFn: async ({ packagePath, configPath }: { packagePath: string; configPath?: string }) => {
      setIsDeploying(true);
      try {
        const { data } = await api.post('/deploy', { packagePath, configPath });
        return data;
      } finally {
        setIsDeploying(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zarf-packages'] });
    },
  });

  const removePackageMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.delete(`/packages/${name}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zarf-packages'] });
    },
  });

  return {
    zarfPackages,
    registryImages,
    isDeploying,
    deployPackage: deployPackageMutation.mutateAsync,
    removePackage: removePackageMutation.mutateAsync,
  };
};

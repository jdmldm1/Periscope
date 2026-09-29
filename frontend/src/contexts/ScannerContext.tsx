import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSbomScans, useGrypeDbStatus, useKubescapeStatus } from '../utils/kubeHooks';
import { useAppContext } from './AppContext';
import axios from 'axios';
const api = axios.create({ baseURL: '/api' });
interface ScannerContextType {
    enableAutoScan: boolean;
    handleToggleAutoScan: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
    scanSingleImage: (img: string) => Promise<void>;
    fetchRunningImagesAndScan: () => Promise<void>;
    isScanningAllRunningImages: boolean;
    runningImagesScanResults: Record<string, any>;
    sbomScansData: any;
    grypeDbStatus: any;
    kubescapeStatusData: any;
    triggerKubescapeScan: () => Promise<void>;
}
const ScannerContext = createContext<ScannerContextType | null>(null);
export function useScannerContext() {
    const ctx = useContext(ScannerContext);
    if (!ctx)
        throw new Error('useScannerContext must be used within ScannerProvider');
    return ctx;
}
export function ScannerProvider({ children }: {
    children: ReactNode;
}) {
    const { scanningEnabled } = useAppContext();
    const queryClient = useQueryClient();
    const { data: sbomScansData } = useSbomScans(scanningEnabled);
    const { data: grypeDbStatus } = useGrypeDbStatus(scanningEnabled);
    const { data: kubescapeStatusData } = useKubescapeStatus(scanningEnabled);
    const [enableAutoScan, setEnableAutoScan] = useState(false);
    const [localScanningImages, setLocalScanningImages] = useState<Set<string>>(new Set());
    const [isScanningAllRunningImages, setIsScanningAllRunningImages] = useState(false);
    useEffect(() => {
        if (!scanningEnabled) return;
        const fetchScannerConfig = async () => {
            try {
                const { data } = await api.get('/zarf/scanner/config');
                setEnableAutoScan(data.enableAutoScan);
            }
            catch (err) {
                console.error('Failed to fetch scanner config', err);
            }
        };
        fetchScannerConfig();
    }, [scanningEnabled]);
    const handleToggleAutoScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!scanningEnabled) return;
        const newVal = e.target.checked;
        setEnableAutoScan(newVal);
        try {
            await api.post('/zarf/scanner/config', { enableAutoScan: newVal });
        }
        catch (err) {
            console.error('Failed to toggle auto scan', err);
            setEnableAutoScan(!newVal);
        }
    };
    const scanSingleImage = async (img: string) => {
        if (!scanningEnabled) return;
        setLocalScanningImages(prev => {
            const next = new Set(prev);
            next.add(img);
            return next;
        });
        try {
            await api.post('/zarf/scanner/sbom/scan', { imageRef: img, rescan: true });
            await api.post('/zarf/scanner/sbom/vulnerabilities', { imageRef: img });
            queryClient.invalidateQueries({ queryKey: ['sbom-scans'] });
        }
        catch (err: any) {
            console.error(err);
            alert('Failed to scan image: ' + (err.response?.data?.error || err.message));
        }
        finally {
            setLocalScanningImages(prev => {
                const next = new Set(prev);
                next.delete(img);
                return next;
            });
        }
    };
    const fetchRunningImagesAndScan = async () => {
        if (!scanningEnabled) return;
        try {
            setIsScanningAllRunningImages(true);
            const { data: images } = await api.get('/zarf/scanner/running-images');
            for (const img of images) {
                await api.post('/zarf/scanner/sbom/scan', { imageRef: img });
                await api.post('/zarf/scanner/sbom/vulnerabilities', { imageRef: img });
            }
        }
        catch (err) {
            console.error(err);
        }
        finally {
            setIsScanningAllRunningImages(false);
        }
    };
    const triggerKubescapeScan = async () => {
        if (!scanningEnabled) return;
        try {
            await api.post('/security/kubescape/scan');
            queryClient.invalidateQueries({ queryKey: ['kubescape-status'] });
        }
        catch (err) {
            console.error(err);
        }
    };
    const runningImagesScanResults = React.useMemo(() => {
        if (!sbomScansData)
            return {};
        const merged = { ...sbomScansData };
        localScanningImages.forEach(img => {
            if (merged[img]) {
                merged[img] = { ...merged[img], status: 'scanning' };
            }
            else {
                merged[img] = { status: 'scanning' };
            }
        });
        return merged;
    }, [sbomScansData, localScanningImages]);
    return (<ScannerContext.Provider value={{
            enableAutoScan, handleToggleAutoScan,
            scanSingleImage, fetchRunningImagesAndScan,
            isScanningAllRunningImages, runningImagesScanResults,
            sbomScansData, grypeDbStatus,
            kubescapeStatusData, triggerKubescapeScan,
        }}>
      {children}
    </ScannerContext.Provider>);
}

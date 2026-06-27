import { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { useModalContext } from '../contexts/ModalContext';
import type { ResourceKind } from '../contexts/AppContext';

type NavFrame = { tab: ResourceKind; search: string; ns: string; focusedRow: number | null };

interface Options {
  // Opens the command palette pre-seeded with the given query (":" for command
  // mode, "" for plain search). Owned by App because the palette's search box is
  // local to it.
  openCommandPalette: (initialQuery: string) => void;
}

// Wires up the app's global keyboard shortcuts (command palette, vim-style row
// navigation, drill-down, and the Escape "back" stack). Kept as a hook so
// App.tsx doesn't carry ~115 lines of event-handler wiring. The drill-down
// "back" history lives here because nothing else needs it.
export const useKeyboardNavigation = ({ openCommandPalette }: Options) => {
  const {
    activeTab, setActiveTab,
    search, setSearch,
    selectedNs, setSelectedNs,
    filteredResources,
    isCmdPaletteOpen,
    focusedRowIndex, setFocusedRowIndex,
    handleDrillDownToPods,
  } = useAppContext();

  const {
    modal, setModal, setModalData,
    setSelectedRevisionValues,
    setIsEditingYaml,
    setSelectedContainer,
  } = useModalContext();

  const [navigationStack, setNavigationStack] = useState<NavFrame[]>([]);
  const isDrillDownRef = useRef(false);

  // Clear the navigation stack when the user explicitly switches tabs (not from
  // our own drill-down, which sets the ref just before changing the tab).
  useEffect(() => {
    if (isDrillDownRef.current) {
      isDrillDownRef.current = false;
    } else {
      setNavigationStack([]);
    }
  }, [activeTab]);

  useEffect(() => {
    const openYamlModal = (res: any, editing: boolean) => {
      setIsEditingYaml(editing);
      setModal({ type: 'yaml', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid });
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCommandPalette('');
        return;
      }

      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key === ':') {
        e.preventDefault();
        openCommandPalette(':');
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (modal) {
          setModal(null);
          setModalData(null);
          setSelectedRevisionValues(null);
        } else if (navigationStack.length > 0) {
          const prev = navigationStack[navigationStack.length - 1];
          setNavigationStack(s => s.slice(0, -1));
          setActiveTab(prev.tab);
          setSearch(prev.search);
          setSelectedNs(prev.ns);
          setFocusedRowIndex(prev.focusedRow);
        }
        return;
      }

      if (modal || isCmdPaletteOpen || filteredResources.length === 0) return;

      const numResources = filteredResources.length;
      const focused = focusedRowIndex !== null ? filteredResources[focusedRowIndex] : null;

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        setFocusedRowIndex(prev => {
          const nextIdx = prev === null ? 0 : Math.min(prev + 1, numResources - 1);
          document.querySelector(`[data-row-index="${nextIdx}"]`)?.scrollIntoView({ block: 'nearest' });
          return nextIdx;
        });
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        setFocusedRowIndex(prev => {
          const nextIdx = prev === null ? 0 : Math.max(prev - 1, 0);
          document.querySelector(`[data-row-index="${nextIdx}"]`)?.scrollIntoView({ block: 'nearest' });
          return nextIdx;
        });
      } else if (e.key === 'd' && focused) {
        openYamlModal(focused, false);
      } else if (e.key === 'e' && focused) {
        openYamlModal(focused, true);
      } else if (e.key === 'Enter' && focused) {
        if (activeTab === 'pods') {
          setSelectedContainer(focused.spec?.containers?.[0]?.name || '');
          setModal({ type: 'logs', name: focused.metadata.name, namespace: focused.metadata.namespace, kind: activeTab, uid: focused.metadata.uid });
        } else if (['deployments', 'statefulsets', 'daemonsets', 'jobs'].includes(activeTab)) {
          isDrillDownRef.current = true;
          setNavigationStack(s => [...s, { tab: activeTab, search, ns: selectedNs, focusedRow: focusedRowIndex }]);
          handleDrillDownToPods(focused);
          setFocusedRowIndex(null);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [modal, isCmdPaletteOpen, filteredResources, focusedRowIndex, activeTab, navigationStack, search, selectedNs]);
};

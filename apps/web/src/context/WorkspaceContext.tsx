import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Workspace } from '@ecp/shared-types';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

const SELECTED_WORKSPACE_KEY = 'ecp.selectedWorkspaceId';

interface WorkspaceContextValue {
  workspaces: Workspace[];
  loading: boolean;
  selectedWorkspaceId: string | null;
  selectedWorkspace: Workspace | null;
  selectWorkspace: (id: string) => void;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(() =>
    localStorage.getItem(SELECTED_WORKSPACE_KEY),
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.workspaces.list();
      setWorkspaces(list);
      setSelectedWorkspaceId((current) => {
        if (current && list.some((ws) => ws.id === current)) {
          return current;
        }
        return list[0]?.id ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      refresh();
    } else {
      setWorkspaces([]);
      setLoading(false);
    }
  }, [user, refresh]);

  const selectWorkspace = (id: string) => {
    setSelectedWorkspaceId(id);
    localStorage.setItem(SELECTED_WORKSPACE_KEY, id);
  };

  const selectedWorkspace = workspaces.find((ws) => ws.id === selectedWorkspaceId) ?? null;

  return (
    <WorkspaceContext.Provider
      value={{ workspaces, loading, selectedWorkspaceId, selectedWorkspace, selectWorkspace, refresh }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaces(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspaces must be used within a WorkspaceProvider');
  }
  return ctx;
}

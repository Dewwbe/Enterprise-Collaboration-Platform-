import { WorkspaceRole } from '@ecp/shared-types';
import type { BadgeTone } from '../components/ui/Badge';

// Mirrors apps/api's ROLE_HIERARCHY (common/enums/workspace-role.enum.ts).
export const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  [WorkspaceRole.VIEWER]: 0,
  [WorkspaceRole.MEMBER]: 1,
  [WorkspaceRole.ADMIN]: 2,
  [WorkspaceRole.OWNER]: 3,
};

export function hasMinRole(role: WorkspaceRole | undefined, minimum: WorkspaceRole): boolean {
  if (!role) return false;
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimum];
}

export const ROLE_TONE: Record<WorkspaceRole, BadgeTone> = {
  [WorkspaceRole.OWNER]: 'blue',
  [WorkspaceRole.ADMIN]: 'green',
  [WorkspaceRole.MEMBER]: 'neutral',
  [WorkspaceRole.VIEWER]: 'neutral',
};

export const ROLE_OPTIONS = [
  WorkspaceRole.VIEWER,
  WorkspaceRole.MEMBER,
  WorkspaceRole.ADMIN,
  WorkspaceRole.OWNER,
];

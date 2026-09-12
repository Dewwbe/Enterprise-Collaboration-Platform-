// Single source of truth for the shapes crossing the API boundary.
// The NestJS DTOs in apps/api remain the actual validation layer (class-validator
// decorators can't live here without pulling Nest into the frontend bundle) -
// this package exists so apps/web never hand-guesses a field name or an enum value.

export enum WorkspaceRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
}

export interface ApiSuccessResponse<T> {
  success: true;
  statusCode: number;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  path: string;
  timestamp: string;
  message: string | string[];
  error?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Pick<UserProfile, 'id' | 'email' | 'firstName' | 'lastName'>;
}

export interface OrganizationMemberSummary {
  userId: string;
  role: WorkspaceRole;
  user?: Pick<UserProfile, 'id' | 'email' | 'firstName' | 'lastName'>;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  members?: OrganizationMemberSummary[];
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
}

export interface WorkspaceMemberSummary {
  userId: string;
  role: WorkspaceRole;
  user?: Pick<UserProfile, 'id' | 'email' | 'firstName' | 'lastName'>;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  members?: WorkspaceMemberSummary[];
}

export interface CreateWorkspaceInput {
  organizationId: string;
  name: string;
  slug: string;
}

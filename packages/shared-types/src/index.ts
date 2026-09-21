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

// Slug is immutable after creation - see apps/api UpdateOrganizationDto.
export interface UpdateOrganizationInput {
  name?: string;
}

export interface InviteMemberInput {
  userId: string;
  role: WorkspaceRole;
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

// organizationId and slug are immutable after creation - see apps/api UpdateWorkspaceDto.
export interface UpdateWorkspaceInput {
  name?: string;
}

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  REVIEW = 'REVIEW',
  DONE = 'DONE',
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export interface DashboardTaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  projectId: string;
  updatedAt: string;
}

// Shape of GET /users/me/dashboard - see UsersService.getDashboard.
export interface UserDashboard {
  workspaceCount: number;
  projectCount: number;
  tasksByStatus: Record<TaskStatus, number>;
  overdueTaskCount: number;
  recentTasks: DashboardTaskSummary[];
}

// Shape of GET /workspaces/:id/stats - see WorkspacesService.getStats.
export interface WorkspaceStats {
  memberCount: number;
  projectCount: number;
  taskCounts: Record<TaskStatus, number>;
}

import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  AuthResponse,
  CreateOrganizationInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateWorkspaceInput,
  InviteMemberInput,
  LoginInput,
  Notification,
  Organization,
  PaginatedResult,
  Project,
  QueryNotificationsInput,
  QueryProjectsInput,
  QueryTasksInput,
  RegisterInput,
  Task,
  UpdateOrganizationInput,
  UpdateProjectInput,
  UpdateTaskInput,
  UpdateWorkspaceInput,
  UserDashboard,
  UserProfile,
  Workspace,
  WorkspaceStats,
} from '@ecp/shared-types';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

const ACCESS_TOKEN_KEY = 'ecp.accessToken';
const REFRESH_TOKEN_KEY = 'ecp.refreshToken';

export const tokenStore = {
  get accessToken() {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  get refreshToken() {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  set(tokens: { accessToken: string; refreshToken: string }) {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Thin fetch wrapper: attaches the bearer token, unwraps the API's
 * `{ success, data }` envelope, and transparently retries once after a
 * refresh-token rotation on a 401 (except for auth endpoints themselves).
 */
async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (tokenStore.accessToken) {
    headers.set('Authorization', `Bearer ${tokenStore.accessToken}`);
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (response.status === 401 && retry && tokenStore.refreshToken && !path.startsWith('/auth/')) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return request<T>(path, options, false);
    }
    tokenStore.clear();
  }

  const body = (await response.json()) as ApiSuccessResponse<T> | ApiErrorResponse;

  if (!response.ok || body.success === false) {
    const errBody = body as ApiErrorResponse;
    const message = Array.isArray(errBody.message)
      ? errBody.message.join(', ')
      : errBody.message;
    throw new ApiError(response.status, message ?? 'Request failed');
  }

  return (body as ApiSuccessResponse<T>).data;
}

function toQueryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function refreshTokens(): Promise<boolean> {
  try {
    const data = await request<AuthResponse>(
      '/auth/refresh',
      {
        method: 'POST',
        body: JSON.stringify({ refreshToken: tokenStore.refreshToken }),
      },
      false,
    );
    tokenStore.set(data);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  auth: {
    register: (input: RegisterInput) =>
      request<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    login: (input: LoginInput) =>
      request<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    logout: () =>
      request<void>('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: tokenStore.refreshToken }),
      }),
  },
  users: {
    me: () => request<UserProfile>('/users/me'),
    dashboard: () => request<UserDashboard>('/users/me/dashboard'),
    lookup: (email: string) =>
      request<UserProfile>(`/users/lookup?email=${encodeURIComponent(email)}`),
  },
  organizations: {
    list: () => request<Organization[]>('/organizations'),
    get: (id: string) => request<Organization>(`/organizations/${id}`),
    create: (input: CreateOrganizationInput) =>
      request<Organization>('/organizations', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (id: string, input: UpdateOrganizationInput) =>
      request<Organization>(`/organizations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    archive: (id: string) =>
      request<Organization>(`/organizations/${id}/archive`, { method: 'POST' }),
    remove: (id: string) => request<void>(`/organizations/${id}`, { method: 'DELETE' }),
    inviteMember: (id: string, input: InviteMemberInput) =>
      request(`/organizations/${id}/members`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  },
  workspaces: {
    list: () => request<Workspace[]>('/workspaces'),
    get: (id: string) => request<Workspace>(`/workspaces/${id}`),
    getStats: (id: string) => request<WorkspaceStats>(`/workspaces/${id}/stats`),
    create: (input: CreateWorkspaceInput) =>
      request<Workspace>('/workspaces', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (id: string, input: UpdateWorkspaceInput) =>
      request<Workspace>(`/workspaces/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    archive: (id: string) =>
      request<Workspace>(`/workspaces/${id}/archive`, { method: 'POST' }),
    remove: (id: string) => request<void>(`/workspaces/${id}`, { method: 'DELETE' }),
    inviteMember: (id: string, input: InviteMemberInput) =>
      request(`/workspaces/${id}/members`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  },
  projects: {
    list: (workspaceId: string, query: QueryProjectsInput = {}) =>
      request<PaginatedResult<Project>>(
        `/workspaces/${workspaceId}/projects${toQueryString(query)}`,
      ),
    get: (workspaceId: string, projectId: string) =>
      request<Project>(`/workspaces/${workspaceId}/projects/${projectId}`),
    create: (workspaceId: string, input: CreateProjectInput) =>
      request<Project>(`/workspaces/${workspaceId}/projects`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (workspaceId: string, projectId: string, input: UpdateProjectInput) =>
      request<Project>(`/workspaces/${workspaceId}/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    archive: (workspaceId: string, projectId: string) =>
      request<Project>(`/workspaces/${workspaceId}/projects/${projectId}/archive`, {
        method: 'POST',
      }),
    restore: (workspaceId: string, projectId: string) =>
      request<Project>(`/workspaces/${workspaceId}/projects/${projectId}/restore`, {
        method: 'POST',
      }),
    remove: (workspaceId: string, projectId: string) =>
      request<void>(`/workspaces/${workspaceId}/projects/${projectId}`, { method: 'DELETE' }),
  },
  tasks: {
    list: (projectId: string, query: QueryTasksInput = {}) =>
      request<PaginatedResult<Task>>(`/projects/${projectId}/tasks${toQueryString(query)}`),
    get: (projectId: string, taskId: string) =>
      request<Task>(`/projects/${projectId}/tasks/${taskId}`),
    create: (projectId: string, input: CreateTaskInput) =>
      request<Task>(`/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (projectId: string, taskId: string, input: UpdateTaskInput) =>
      request<Task>(`/projects/${projectId}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    remove: (projectId: string, taskId: string) =>
      request<void>(`/projects/${projectId}/tasks/${taskId}`, { method: 'DELETE' }),
    restore: (projectId: string, taskId: string) =>
      request<Task>(`/projects/${projectId}/tasks/${taskId}/restore`, { method: 'POST' }),
  },
  notifications: {
    list: (query: QueryNotificationsInput = {}) =>
      request<PaginatedResult<Notification>>(`/notifications${toQueryString(query)}`),
    markRead: (id: string) =>
      request<Notification>(`/notifications/${id}/read`, { method: 'PATCH' }),
  },
};

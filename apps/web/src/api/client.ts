import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  AuthResponse,
  CreateOrganizationInput,
  CreateWorkspaceInput,
  LoginInput,
  Organization,
  RegisterInput,
  UserProfile,
  Workspace,
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
  },
  organizations: {
    list: () => request<Organization[]>('/organizations'),
    get: (id: string) => request<Organization>(`/organizations/${id}`),
    create: (input: CreateOrganizationInput) =>
      request<Organization>('/organizations', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  },
  workspaces: {
    list: () => request<Workspace[]>('/workspaces'),
    get: (id: string) => request<Workspace>(`/workspaces/${id}`),
    create: (input: CreateWorkspaceInput) =>
      request<Workspace>('/workspaces', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  },
};

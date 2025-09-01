export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

// Auth token management
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('accessToken') || accessToken;
  }
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('accessToken', token);
    } else {
      localStorage.removeItem('accessToken');
    }
  }
}

function getAuthHeaders(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getJSON<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, API_BASE);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    cache: 'no-store',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJSON<T>(path: string, body: any): Promise<T> {
  const url = new URL(path, API_BASE);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorData.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listDatabases: () => getJSON<{ NAME: string }[]>('/snowflake/databases'),
  listSchemas: (database: string) =>
    getJSON<{ SCHEMA_NAME: string }[]>('/snowflake/schemas', { database }),
  listTables: (database: string, schema: string) =>
    getJSON<{ TABLE_NAME: string; TABLE_TYPE: string }[]>('/snowflake/tables', {
      database,
      schema,
    }),
  listColumns: (database: string, schema: string, table: string) =>
    getJSON<{ COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string }[]>(
      '/snowflake/columns',
      { database, schema, table },
    ),
  searchCatalog: (database: string, schema: string, q: string) =>
    getJSON<
      {
        table_name: string;
        table_type: string;
        table_owner: string;
        column_name?: string;
        data_type?: string;
      }[]
    >('/catalog/search', { database, schema, q }),
  catalogEntities: (database: string, schema: string) =>
    getJSON<{
      tables: {
        database_name: string;
        schema_name: string;
        table_name: string;
        table_type: string;
      }[];
      columns: {
        database_name: string;
        schema_name: string;
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: string;
      }[];
      foreignKeys: {
        database_name: string;
        schema_name: string;
        table_name: string;
        column_name: string;
        referenced_table_name: string;
        referenced_column_name: string;
        constraint_name: string;
      }[];
    }>('/catalog/entities', {
      database,
      schema,
    }),
  runEtlNow: (database: string, schema: string) =>
    postJSON<{ ok: boolean; runId: number }>('/etl/run-now', { database, schema }),

  // Auth endpoints
  login: (email: string, password: string, remember?: boolean) =>
    postJSON<{
      success: boolean;
      user: {
        id: number;
        email: string;
        name: string | null;
        email_verified: boolean;
      };
      accessToken: string;
    }>('/auth/login', { email, password, remember }),

  signup: (
    name: string,
    email: string,
    password: string,
    confirmPassword: string,
    acceptTerms: boolean,
  ) =>
    postJSON<{
      success: boolean;
      user: {
        id: number;
        email: string;
        name: string | null;
        email_verified: boolean;
      };
      accessToken: string;
    }>('/auth/signup', { name, email, password, confirmPassword, acceptTerms }),

  logout: () => postJSON<{ success: boolean }>('/auth/logout', {}),

  me: () =>
    getJSON<{
      user: {
        id: number;
        email: string;
        name: string | null;
        email_verified: boolean;
      };
    }>('/auth/me'),

  forgotPassword: (email: string) =>
    postJSON<{ success: boolean; message: string; resetToken?: string }>('/auth/forgot-password', {
      email,
    }),

  resetPassword: (token: string, password: string, confirmPassword: string) =>
    postJSON<{ success: boolean; message: string }>('/auth/reset-password', {
      token,
      password,
      confirmPassword,
    }),

  checkPasswordStrength: (password: string) =>
    postJSON<{ score: number; feedback: string[] }>('/auth/password-strength', { password }),

  // Sharing endpoints
  shareResource: (data: {
    resourceType: string;
    resourceId: string;
    shareType: string;
    shareWithId: number;
    permissions: string[];
  }) => postJSON<{ success: boolean; share: any }>('/sharing/share', data),

  getShares: (resourceType: string, resourceId: string) =>
    getJSON<{ success: boolean; shares: any[] }>(`/sharing/${resourceType}/${resourceId}`),

  updateShare: (shareId: number, permissions: string[]) =>
    postJSON<{ success: boolean; share: any }>(`/sharing/${shareId}`, { permissions }),

  revokeShare: (shareId: number) =>
    fetch(`${API_BASE}/sharing/${shareId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).then(res => res.json()),

  inviteUser: (data: {
    email: string;
    role: string;
    orgId?: number;
    departmentId?: number;
    resourceType?: string;
    resourceId?: string;
    message?: string;
  }) => postJSON<{ success: boolean; invitation: any }>('/sharing/invite', data),

  acceptInvite: (token: string) =>
    postJSON<{ success: boolean; membership: any }>('/sharing/accept-invite', { token }),

  getUsers: () => getJSON<any[]>('/rbac/users'),
  getDepartments: (orgId?: number) =>
    getJSON<any[]>(`/departments${orgId ? `?orgId=${orgId}` : ''}`),
  getOrganizations: () => getJSON<any[]>('/orgs'),
};

import { useState, useCallback } from 'react';
import { api } from './api';

// Types
export type ResourceType = 'dashboard' | 'query' | 'report' | 'dataset' | 'table';
export type ShareType = 'user' | 'department' | 'organization';
export type Permission = 'view' | 'edit' | 'admin';
export type InvitationRole = 'viewer' | 'editor' | 'admin';

export interface ResourceShare {
  id: number;
  resource_type: ResourceType;
  resource_id: string;
  share_type: ShareType;
  share_with_id: number;
  permissions: Permission[];
  created_by: number;
  created_at: string;
  recipient_name: string;
  recipient_email?: string;
}

export interface ShareInvitation {
  id: number;
  email: string;
  role: InvitationRole;
  org_id?: number;
  department_id?: number;
  token: string;
  expires_at: string;
  accepted_at?: string;
  created_by: number;
  created_at: string;
  invited_for_resource_type?: ResourceType;
  invited_for_resource_id?: string;
  invitation_message?: string;
}

export interface ShareRecipient {
  id: number;
  name: string;
  email?: string;
  type: ShareType;
}

// Extended API functions for sharing
const sharingApi = {
  shareResource: (data: {
    resourceType: ResourceType;
    resourceId: string;
    shareType: ShareType;
    shareWithId: number;
    permissions: Permission[];
  }) =>
    fetch(`${API_BASE}/sharing/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(data),
    }).then(handleResponse),

  getShares: (resourceType: ResourceType, resourceId: string) =>
    fetch(`${API_BASE}/sharing/${resourceType}/${resourceId}`, {
      headers: getAuthHeaders(),
    }).then(handleResponse),

  updateShare: (shareId: number, permissions: Permission[]) =>
    fetch(`${API_BASE}/sharing/${shareId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ permissions }),
    }).then(handleResponse),

  revokeShare: (shareId: number) =>
    fetch(`${API_BASE}/sharing/${shareId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).then(handleResponse),

  inviteUser: (data: {
    email: string;
    role: InvitationRole;
    orgId?: number;
    departmentId?: number;
    resourceType?: ResourceType;
    resourceId?: string;
    message?: string;
  }) =>
    fetch(`${API_BASE}/sharing/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(data),
    }).then(handleResponse),

  acceptInvite: (token: string) =>
    fetch(`${API_BASE}/sharing/accept-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ token }),
    }).then(handleResponse),

  // Utility endpoints for getting potential recipients
  getUsers: () =>
    fetch(`${API_BASE}/rbac/users`, {
      headers: getAuthHeaders(),
    }).then(handleResponse),

  getDepartments: (orgId?: number) =>
    fetch(`${API_BASE}/departments${orgId ? `?orgId=${orgId}` : ''}`, {
      headers: getAuthHeaders(),
    }).then(handleResponse),

  getOrganizations: () =>
    fetch(`${API_BASE}/orgs`, {
      headers: getAuthHeaders(),
    }).then(handleResponse),
};

// Helper functions
function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse(response: Response) {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorData.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

// Custom hooks
export function useShares(resourceType: ResourceType, resourceId: string) {
  const [shares, setShares] = useState<ResourceShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchShares = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await sharingApi.getShares(resourceType, resourceId);
      setShares(response.shares || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch shares');
      setShares([]);
    } finally {
      setLoading(false);
    }
  }, [resourceType, resourceId]);

  return {
    shares,
    loading,
    error,
    fetchShares,
    refetch: fetchShares,
  };
}

export function useShareResource() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareResource = useCallback(async (data: {
    resourceType: ResourceType;
    resourceId: string;
    shareType: ShareType;
    shareWithId: number;
    permissions: Permission[];
  }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await sharingApi.shareResource(data);
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to share resource';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    shareResource,
    loading,
    error,
  };
}

export function useUpdateShare() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateShare = useCallback(async (shareId: number, permissions: Permission[]) => {
    setLoading(true);
    setError(null);
    try {
      const response = await sharingApi.updateShare(shareId, permissions);
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update share';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    updateShare,
    loading,
    error,
  };
}

export function useRevokeShare() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revokeShare = useCallback(async (shareId: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await sharingApi.revokeShare(shareId);
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to revoke share';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    revokeShare,
    loading,
    error,
  };
}

export function useInviteUser() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteUser = useCallback(async (data: {
    email: string;
    role: InvitationRole;
    orgId?: number;
    departmentId?: number;
    resourceType?: ResourceType;
    resourceId?: string;
    message?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await sharingApi.inviteUser(data);
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send invitation';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    inviteUser,
    loading,
    error,
  };
}

export function useAcceptInvite() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptInvite = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await sharingApi.acceptInvite(token);
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to accept invitation';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    acceptInvite,
    loading,
    error,
  };
}

export function useRecipients() {
  const [recipients, setRecipients] = useState<ShareRecipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecipients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [users, departments, orgs] = await Promise.all([
        sharingApi.getUsers().catch(() => []),
        sharingApi.getDepartments().catch(() => []),
        sharingApi.getOrganizations().catch(() => []),
      ]);

      const allRecipients: ShareRecipient[] = [
        ...(users || []).map((user: any) => ({
          id: user.id,
          name: user.name || user.email,
          email: user.email,
          type: 'user' as ShareType,
        })),
        ...(departments || []).map((dept: any) => ({
          id: dept.id,
          name: dept.name,
          type: 'department' as ShareType,
        })),
        ...(orgs || []).map((org: any) => ({
          id: org.id,
          name: org.name,
          type: 'organization' as ShareType,
        })),
      ];

      setRecipients(allRecipients);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recipients');
      setRecipients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    recipients,
    loading,
    error,
    fetchRecipients,
  };
}

// Utility functions
export function getPermissionLabel(permission: Permission): string {
  switch (permission) {
    case 'view':
      return 'Can view';
    case 'edit':
      return 'Can edit';
    case 'admin':
      return 'Full access';
    default:
      return permission;
  }
}

export function getShareTypeIcon(shareType: ShareType): string {
  switch (shareType) {
    case 'user':
      return '👤';
    case 'department':
      return '🏢';
    case 'organization':
      return '🏛️';
    default:
      return '📁';
  }
}

export function getResourceTypeLabel(resourceType: ResourceType): string {
  switch (resourceType) {
    case 'dashboard':
      return 'Dashboard';
    case 'query':
      return 'Query';
    case 'report':
      return 'Report';
    case 'dataset':
      return 'Dataset';
    case 'table':
      return 'Table';
    default:
      return resourceType;
  }
}
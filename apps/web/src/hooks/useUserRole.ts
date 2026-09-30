"use client";

import { useEffect, useState } from 'react';
import { isAdmin, type UserWithRole } from '@/lib/roles';

interface UseUserRoleReturn {
  user: UserWithRole | null;
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useUserRole(): UseUserRoleReturn {
  const [user, setUser] = useState<UserWithRole | null>(null);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserRole = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';
      const response = await fetch(`${API}/admin/me/role`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError('Unauthorized');
          setUser(null);
          setIsAdminUser(false);
          return;
        }
        throw new Error('Failed to fetch user role');
      }

      const data = await response.json();
      setUser(data.user);
      setIsAdminUser(data.isAdmin || false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch user role';
      setError(message);
      setUser(null);
      setIsAdminUser(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserRole();
  }, []);

  return {
    user,
    isAdmin: isAdminUser,
    isLoading,
    error,
    refetch: fetchUserRole,
  };
}

export function useIsAdmin(): boolean {
  const { isAdmin: isAdminUser } = useUserRole();
  return isAdminUser;
}

interface UseManageUserRolesReturn {
  users: UserWithRole[];
  isLoading: boolean;
  error: string | null;
  updateUserRole: (userId: string, role: 'USER' | 'ADMIN') => Promise<void>;
  fetchUsers: () => Promise<void>;
}

export function useManageUserRoles(): UseManageUserRolesReturn {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/admin/users', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch users';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateUserRole = async (userId: string, role: 'USER' | 'ADMIN') => {
    try {
      setError(null);

      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ userRole: role }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update user role');
      }

      const updatedUser = await response.json();
      setUsers(users.map(u => u.id === userId ? updatedUser.user : u));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update user role';
      setError(message);
      throw err;
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return {
    users,
    isLoading,
    error,
    updateUserRole,
    fetchUsers,
  };
}

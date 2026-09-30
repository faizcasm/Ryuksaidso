/**
 * User Role Types and Utilities
 * Handles role-based access control (RBAC)
 */

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export interface UserWithRole {
  id: string;
  email: string;
  name: string;
  userRole: UserRole;
  createdAt?: string;
}

/**
 * Check if user has admin role
 */
export function isAdmin(userRole?: string | UserRole): boolean {
  return userRole === UserRole.ADMIN || userRole === 'ADMIN';
}

/**
 * Check if user is regular user
 */
export function isRegularUser(userRole?: string | UserRole): boolean {
  return userRole === UserRole.USER || userRole === 'USER';
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: UserRole | string): string {
  const roleMap: Record<string, string> = {
    [UserRole.ADMIN]: 'Administrator',
    [UserRole.USER]: 'User',
  };
  return roleMap[role] || 'Unknown';
}

/**
 * Get role badge color
 */
export function getRoleBadgeColor(role: UserRole | string): string {
  if (isAdmin(role)) return '#ef4444'; // red
  return '#60a5fa'; // blue
}

/**
 * Check if user can perform admin action
 */
export function canPerformAdminAction(userRole?: string | UserRole): boolean {
  return isAdmin(userRole);
}

/**
 * Check if user can manage other users
 */
export function canManageUsers(userRole?: string | UserRole): boolean {
  return isAdmin(userRole);
}

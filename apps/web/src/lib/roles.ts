
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

export function isAdmin(userRole?: string | UserRole): boolean {
  return userRole === UserRole.ADMIN || userRole === 'ADMIN';
}

export function isRegularUser(userRole?: string | UserRole): boolean {
  return userRole === UserRole.USER || userRole === 'USER';
}

export function getRoleDisplayName(role: UserRole | string): string {
  const roleMap: Record<string, string> = {
    [UserRole.ADMIN]: 'Administrator',
    [UserRole.USER]: 'User',
  };
  return roleMap[role] || 'Unknown';
}

export function getRoleBadgeColor(role: UserRole | string): string {
  if (isAdmin(role)) return '#ef4444';
  return '#60a5fa';
}

export function canPerformAdminAction(userRole?: string | UserRole): boolean {
  return isAdmin(userRole);
}

export function canManageUsers(userRole?: string | UserRole): boolean {
  return isAdmin(userRole);
}

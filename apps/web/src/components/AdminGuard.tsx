"use client";

import { ReactNode } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
import { ShieldAlert } from 'lucide-react';

interface AdminGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  showMessage?: boolean;
}

/**
 * Component that shows children only if user is ADMIN
 * Usage: 
 * <AdminGuard>
 *   <AdminOnlyFeature />
 * </AdminGuard>
 */
export function AdminGuard({ children, fallback, showMessage = false }: AdminGuardProps) {
  const { isAdmin, isLoading } = useUserRole();

  if (isLoading) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#9ca7b8', fontSize: '12px' }}>
        Loading...
      </div>
    );
  }

  if (!isAdmin) {
    if (showMessage) {
      return (
        <div style={{
          padding: '16px',
          border: '1px solid rgba(251, 113, 133, 0.2)',
          borderRadius: '8px',
          background: 'rgba(251, 113, 133, 0.05)',
          color: '#fda4af',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <ShieldAlert size={16} />
          <span>You don't have permission to access this. Admin role required.</span>
        </div>
      );
    }

    return fallback || null;
  }

  return <>{children}</>;
}

interface AdminMenuItemProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  title?: string;
}

/**
 * Menu item that shows only to admins
 * Usage:
 * <AdminMenuItem onClick={handleAdminAction}>
 *   Admin Settings
 * </AdminMenuItem>
 */
export function AdminMenuItem({ 
  children, 
  onClick, 
  className = '', 
  disabled = false,
  title = 'Admin only'
}: AdminMenuItemProps) {
  const { isAdmin, isLoading } = useUserRole();

  if (isLoading || !isAdmin) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      title={title}
    >
      {children}
    </button>
  );
}

interface AdminTabProps {
  label: string;
  children: ReactNode;
  adminOnly?: boolean;
}

/**
 * Tab that shows only to admins
 * Usage:
 * <Tabs>
 *   <AdminTab label="Settings" adminOnly>
 *     <AdminSettings />
 *   </AdminTab>
 * </Tabs>
 */
export function AdminTab({ label, children, adminOnly = true }: AdminTabProps) {
  const { isAdmin, isLoading } = useUserRole();

  if (adminOnly && (isLoading || !isAdmin)) {
    return null;
  }

  return (
    <>
      {/* Label rendered by parent Tabs component */}
      {children}
    </>
  );
}

interface RoleBasedVisibilityProps {
  children: ReactNode;
  allowedRoles: ('USER' | 'ADMIN')[];
  fallback?: ReactNode;
}

/**
 * Generic role-based visibility component
 * Usage:
 * <RoleBasedVisibility allowedRoles={['ADMIN']}>
 *   <AdminPanel />
 * </RoleBasedVisibility>
 */
export function RoleBasedVisibility({ 
  children, 
  allowedRoles, 
  fallback 
}: RoleBasedVisibilityProps) {
  const { user, isLoading } = useUserRole();

  if (isLoading) {
    return fallback || null;
  }

  if (!user || !allowedRoles.includes(user.userRole as any)) {
    return fallback || null;
  }

  return <>{children}</>;
}

interface AdminBadgeProps {
  userRole?: string;
  showLabel?: boolean;
}

/**
 * Badge to display user's admin status
 * Usage:
 * <AdminBadge userRole={user.userRole} showLabel />
 */
export function AdminBadge({ userRole, showLabel = true }: AdminBadgeProps) {
  const isAdminUser = userRole === 'ADMIN';

  if (!isAdminUser) {
    return null;
  }

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 8px',
      borderRadius: '6px',
      background: 'rgba(239, 68, 68, 0.15)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      color: '#ef4444',
      fontSize: '10px',
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}>
      <ShieldAlert size={12} />
      {showLabel && 'Admin'}
    </span>
  );
}

interface AdminWarningProps {
  message?: string;
}

/**
 * Warning message shown to non-admin users trying to access admin features
 */
export function AdminWarning({ 
  message = 'This feature is only available to administrators.' 
}: AdminWarningProps) {
  const { isAdmin, isLoading } = useUserRole();

  if (isLoading || isAdmin) {
    return null;
  }

  return (
    <div style={{
      padding: '16px',
      marginBottom: '16px',
      border: '1px solid rgba(245, 158, 11, 0.3)',
      borderRadius: '10px',
      background: 'rgba(245, 158, 11, 0.08)',
      color: '#fbbf24',
      fontSize: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    }}>
      <ShieldAlert size={16} />
      <div>
        <strong>Admin Access Required</strong>
        <p style={{ margin: '4px 0 0', opacity: 0.8 }}>{message}</p>
      </div>
    </div>
  );
}

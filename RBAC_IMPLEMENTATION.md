# Role-Based Access Control (RBAC) Implementation

## Overview

Ryuksaidso now includes a complete Role-Based Access Control (RBAC) system with two user roles:
- **USER** (default) - Regular users with limited access
- **ADMIN** - Administrators with full platform access

---

## Database Schema

### User Model Update
```prisma
enum UserRole {
  USER
  ADMIN
}

model User {
  id String @id @default(cuid())
  email String @unique
  name String
  passwordHash String?
  emailVerifiedAt DateTime?
  userRole UserRole @default(USER)  // NEW FIELD
  memberships Membership[]
  oauthAccounts OAuthAccount[]
  sessions Session[]
  passwordResetTokens PasswordResetToken[]
  emailVerificationTokens EmailVerificationToken[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  bio String?
  jobTitle String?
  avatarUrl String?
  timezone String?
  theme String @default("system")
}
```

### Migration
- Migration file: `apps/api/prisma/migrations/add_user_role/migration.sql`
- Automatically applied on Docker startup
- Default role for all users: `USER`

---

## Backend API

### Middleware

#### `requireAdminRole` - Check admin status
```typescript
import { requireAdminRole } from '@/middleware';

router.get('/some-endpoint', requireAuth, requireAdminRole, (req, res) => {
  // req.isAdmin = true/false
  // req.user.userRole = 'USER' | 'ADMIN'
  if (req.isAdmin) {
    // User is admin
  }
});
```

#### `requireAdmin` - Strict admin enforcement
```typescript
import { requireAdmin } from '@/middleware';

// This route only allows admins (401/403 for non-admins)
router.delete('/admin-only', requireAuth, requireAdmin, (req, res) => {
  // Only admins reach here
});
```

#### `adminOnly` - Use after requireAdminRole
```typescript
router.post('/action', requireAuth, requireAdminRole, adminOnly, (req, res) => {
  // Only admins reach here
});
```

### Admin Routes

#### Get current user's role
```bash
GET /api/admin/me/role

Response:
{
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe",
    "userRole": "ADMIN",
    "createdAt": "2026-09-21T..."
  },
  "isAdmin": true
}
```

#### List all users (admin only)
```bash
GET /api/admin/users

Response:
[
  {
    "id": "user_1",
    "email": "user1@example.com",
    "name": "User One",
    "userRole": "USER",
    "emailVerifiedAt": "2026-09-20T...",
    "createdAt": "2026-09-20T...",
    "memberships": [
      {
        "role": "VIEWER"
      }
    ]
  },
  {
    "id": "user_2",
    "email": "admin@example.com",
    "name": "Admin User",
    "userRole": "ADMIN",
    "emailVerifiedAt": "2026-09-20T...",
    "createdAt": "2026-09-20T...",
    "memberships": [
      {
        "role": "OWNER"
      }
    ]
  }
]
```

#### Update user role (admin only)
```bash
PATCH /api/admin/users/{userId}/role

Request:
{
  "userRole": "ADMIN"  // or "USER"
}

Response:
{
  "message": "User role updated to ADMIN",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe",
    "userRole": "ADMIN",
    "createdAt": "2026-09-21T..."
  }
}
```

### Error Responses

#### Unauthorized (not admin)
```json
{
  "error": "Forbidden",
  "message": "This action requires admin privileges"
}
```

#### User not found
```json
{
  "error": "NotFound",
  "message": "User not found"
}
```

#### Invalid role
```json
{
  "error": "ValidationError",
  "message": "Invalid role. Must be USER or ADMIN"
}
```

---

## Frontend Implementation

### Role Utilities
```typescript
import { 
  isAdmin, 
  isRegularUser, 
  getRoleDisplayName,
  getRoleBadgeColor,
  canPerformAdminAction,
  canManageUsers 
} from '@/lib/roles';

// Check if admin
if (isAdmin(userRole)) {
  // Show admin features
}

// Get display name
const displayName = getRoleDisplayName('ADMIN'); // "Administrator"

// Get badge color
const color = getRoleBadgeColor('USER'); // "#60a5fa"
```

### Hooks

#### useUserRole - Fetch user role
```typescript
import { useUserRole } from '@/hooks/useUserRole';

function MyComponent() {
  const { user, isAdmin, isLoading, error, refetch } = useUserRole();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <p>Email: {user?.email}</p>
      <p>Role: {user?.userRole}</p>
      {isAdmin && <p>You have admin access!</p>}
    </div>
  );
}
```

#### useIsAdmin - Simple admin check
```typescript
import { useIsAdmin } from '@/hooks/useUserRole';

function AdminFeature() {
  const isAdmin = useIsAdmin();

  if (!isAdmin) return null;
  
  return <div>Admin-only content</div>;
}
```

#### useManageUserRoles - Manage users (admin only)
```typescript
import { useManageUserRoles } from '@/hooks/useUserRole';

function UserManagement() {
  const { users, isLoading, error, updateUserRole, fetchUsers } = useManageUserRoles();

  const promoteUser = async (userId: string) => {
    try {
      await updateUserRole(userId, 'ADMIN');
      console.log('User promoted to admin');
    } catch (err) {
      console.error('Failed to promote user:', err);
    }
  };

  return (
    <div>
      {users.map(user => (
        <div key={user.id}>
          <p>{user.name} ({user.userRole})</p>
          <button onClick={() => promoteUser(user.id)}>
            Promote to Admin
          </button>
        </div>
      ))}
    </div>
  );
}
```

### Components

#### AdminGuard - Show content only to admins
```typescript
import { AdminGuard } from '@/components/AdminGuard';

function MyPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      
      <AdminGuard showMessage>
        <AdminPanel />
      </AdminGuard>

      <AdminGuard fallback={<p>Not available</p>}>
        <AdminOnlyFeature />
      </AdminGuard>
    </div>
  );
}
```

#### AdminMenuItem - Menu item for admins only
```typescript
import { AdminMenuItem } from '@/components/AdminGuard';

function Sidebar() {
  return (
    <nav>
      <a href="/dashboard">Dashboard</a>
      
      <AdminMenuItem onClick={handleAdminPanel}>
        🔧 Admin Settings
      </AdminMenuItem>
      
      <AdminMenuItem onClick={handleManageUsers}>
        👥 Manage Users
      </AdminMenuItem>
    </nav>
  );
}
```

#### AdminBadge - Display admin status
```typescript
import { AdminBadge } from '@/components/AdminGuard';

function UserCard({ user }) {
  return (
    <div>
      <h3>{user.name}</h3>
      <AdminBadge userRole={user.userRole} showLabel />
    </div>
  );
}
```

#### RoleBasedVisibility - Generic role filtering
```typescript
import { RoleBasedVisibility } from '@/components/AdminGuard';

function App() {
  return (
    <div>
      <RoleBasedVisibility 
        allowedRoles={['ADMIN']}
        fallback={<p>Admin-only feature</p>}
      >
        <AdminPanel />
      </RoleBasedVisibility>
    </div>
  );
}
```

#### AdminWarning - Show non-admin users a message
```typescript
import { AdminWarning } from '@/components/AdminGuard';

function RestrictedPage() {
  return (
    <div>
      <AdminWarning message="This page is only for administrators." />
      {/* Rest of page... */}
    </div>
  );
}
```

---

## Usage Examples

### Example 1: Show/Hide Admin Menu
```typescript
// Sidebar.tsx
function Sidebar() {
  const { isAdmin } = useUserRole();

  return (
    <nav>
      <Link href="/">Dashboard</Link>
      <Link href="/docs">Documentation</Link>
      <Link href="/architecture">Architecture</Link>
      
      {/* This entire section only shows for admins */}
      <AdminGuard>
        <div className="admin-section">
          <h3>Admin</h3>
          <Link href="/admin/users">Manage Users</Link>
          <Link href="/admin/settings">Settings</Link>
          <Link href="/admin/audit">Audit Logs</Link>
        </div>
      </AdminGuard>
    </nav>
  );
}
```

### Example 2: Conditional Navbar Button
```typescript
function Navbar() {
  const { isAdmin } = useUserRole();

  return (
    <nav>
      {/* ... other content ... */}
      
      <AdminMenuItem className="btn btn-danger" onClick={handleAdminConsole}>
        🔧 Admin Console
      </AdminMenuItem>

      {isAdmin && (
        <a href="/admin" className="btn btn-primary">
          Admin Dashboard
        </a>
      )}
    </nav>
  );
}
```

### Example 3: User Management Page
```typescript
function UserManagementPage() {
  const { users, isLoading, updateUserRole, error } = useManageUserRoles();

  if (isLoading) return <div>Loading users...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <AdminGuard showMessage>
      <div className="user-management">
        <h2>User Management</h2>
        
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>
                  <AdminBadge userRole={user.userRole} />
                </td>
                <td>
                  <button
                    onClick={() => updateUserRole(
                      user.id,
                      user.userRole === 'ADMIN' ? 'USER' : 'ADMIN'
                    )}
                  >
                    {user.userRole === 'ADMIN' ? 'Demote' : 'Promote'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminGuard>
  );
}
```

### Example 4: Protected API Routes
```typescript
// Backend: apps/api/src/routes/settings.ts
import { Router } from 'express';
import { requireAuth, requireAdmin } from '@/middleware';

const router = Router();

// Public endpoint
router.get('/settings/profile', requireAuth, async (req, res) => {
  // All authenticated users can access
  res.json({ /* ... */ });
});

// Admin-only endpoint
router.put('/settings/system', requireAuth, requireAdmin, async (req, res) => {
  // Only admins can access
  res.json({ /* ... */ });
});

export default router;
```

---

## File Structure

```
apps/api/
├── prisma/
│   ├── schema.prisma (updated with UserRole enum)
│   └── migrations/
│       └── add_user_role/
│           └── migration.sql
├── src/
│   ├── middleware.ts (requireAdminRole, requireAdmin, adminOnly)
│   └── routes/
│       └── admin.ts (admin endpoints)

apps/web/
├── src/
│   ├── lib/
│   │   └── roles.ts (role utilities)
│   ├── hooks/
│   │   └── useUserRole.ts (React hooks)
│   └── components/
│       └── AdminGuard.tsx (UI components)
```

---

## Security Considerations

1. **Always verify on backend** - Never trust frontend role checks alone
2. **Use strict middleware** - Use `requireAdmin` for sensitive operations
3. **Audit logging** - All role changes are logged via `audit()` function
4. **Self-demotion prevention** - Admins can't demote themselves
5. **Token refresh** - Sessions are revoked when role changes
6. **Database validation** - Prisma schema enforces role types

---

## Migration Guide

### For Existing Deployments

1. **Backup your database**
   ```bash
   docker compose exec postgres pg_dump -U ryuksaidso ryuksaidso > backup.sql
   ```

2. **Update and deploy**
   ```bash
   git pull
   docker compose up --build
   ```
   - Prisma automatically runs pending migrations
   - All existing users get `USER` role (default)

3. **Promote admins manually**
   ```bash
   # Via API
   PATCH /api/admin/users/{userId}/role
   { "userRole": "ADMIN" }
   ```

### Default Behavior
- All new users: `USER` role
- Existing users: `USER` role (migration sets default)
- Manual promotion required for admins

---

## Testing

### Test Admin Access
```bash
# Get user role
curl -X GET http://localhost:3001/api/admin/me/role \
  -H "Authorization: Bearer <token>"

# List users (must be admin)
curl -X GET http://localhost:3001/api/admin/users \
  -H "Authorization: Bearer <admin-token>"

# Update user role (must be admin)
curl -X PATCH http://localhost:3001/api/admin/users/<user-id>/role \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"userRole": "ADMIN"}'
```

### Test Frontend Components
```typescript
// In browser console
import { isAdmin } from '@/lib/roles';
console.log(isAdmin('ADMIN')); // true
console.log(isAdmin('USER'));  // false
```

---

## Best Practices

1. **Use AdminGuard for sensitive features**
   ```typescript
   <AdminGuard showMessage>
     <SensitiveFeature />
   </AdminGuard>
   ```

2. **Check role in hooks before rendering**
   ```typescript
   const { isAdmin } = useUserRole();
   if (!isAdmin) return null;
   ```

3. **Always enforce on backend**
   ```typescript
   router.delete('/resource', requireAuth, requireAdmin, handler);
   ```

4. **Provide clear feedback to users**
   ```typescript
   <AdminWarning message="This feature requires admin access" />
   ```

5. **Cache role in state when possible**
   ```typescript
   const { user, isAdmin } = useUserRole();
   // Use isAdmin instead of re-computing
   ```

---

## FAQ

**Q: How do I make a user admin?**
A: Use the PATCH endpoint or manually update in database:
```bash
PATCH /api/admin/users/{userId}/role
{ "userRole": "ADMIN" }
```

**Q: Can an admin demote themselves?**
A: No, this is prevented by the backend for safety.

**Q: What happens when I change a user's role?**
A: The user's sessions are revoked, they need to re-login, and the change is audited.

**Q: Can I add more roles?**
A: Yes, update the UserRole enum in schema.prisma and add new middleware as needed.

**Q: Does role affect organization membership?**
A: No, UserRole is global. Organization membership roles (Membership.role) are separate.

---

## Support

For issues or questions about RBAC:
1. Check the documentation above
2. Review the implementation files
3. Check backend logs for errors
4. Verify database migration ran: `SELECT * FROM "User" LIMIT 1;`

---

**Version**: 2.0.0  
**Last Updated**: September 21, 2026  
**Author**: Faizan Hameed (http://faizcasm.me)

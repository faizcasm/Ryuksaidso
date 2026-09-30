import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from '../lib/auth';

describe('authentication tokens', () => {
  it('round-trips a user identity', () => {
    const user = { id: 'u1', email: 'test@example.com', name: 'Test', organizationId: 'org1', role: 'OWNER' };
    expect(verifyToken(signToken(user))).toMatchObject(user);
  });

  it('rejects a malformed token', () => {
    expect(verifyToken('not-a-token')).toBeNull();
  });
});

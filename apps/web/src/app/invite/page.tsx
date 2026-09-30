'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';

const TOKEN_KEY = 'ryuksaidso_invite_token';

/**
 * /invite?token=… — entry point for the emailed invitation link.
 *
 * - Signed out: the token is parked in localStorage so the join completes
 *   automatically after sign-in or account creation (AppShell consumes it).
 * - Signed in: the invitation is accepted immediately; if it can never succeed
 *   (expired / revoked / wrong mailbox) the stored token is dropped so later
 *   sign-ins are not blocked by it.
 */
export default function InvitePage() {
  const [message, setMessage] = useState('Preparing invitation…');
  const [signedInAs, setSignedInAs] = useState('');
  const [canSignOut, setCanSignOut] = useState(false);

  useEffect(() => {
    (async () => {
      const token = new URLSearchParams(window.location.search).get('token') || '';
      if (!token) {
        setMessage('This invitation link is missing its token.');
        return;
      }
      localStorage.setItem(TOKEN_KEY, token);

      let email = '';
      try {
        const me = await api<{ user: { email: string } }>('/me');
        email = me.user.email || '';
        setSignedInAs(email);
      } catch {
        setMessage(
          'Sign in or create an account with the invited email — the invitation completes automatically once you are in.',
        );
        return;
      }

      try {
        await api('/workspace/invitations/accept', {
          method: 'POST',
          body: JSON.stringify({ token }),
        });
        localStorage.removeItem(TOKEN_KEY);
        window.location.replace('/');
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 400 || status === 403 || status === 404) {
          localStorage.removeItem(TOKEN_KEY); // this token can never succeed
        }
        if (status === 403) {
          setCanSignOut(true);
          setMessage(
            `This invitation was sent to a different email address. You are signed in as ${email} — sign out and use the invited mailbox.`,
          );
        } else if (status === 400 || status === 404) {
          setMessage(
            'This invitation is invalid or has expired. Ask a workspace admin to send a new one.',
          );
        } else {
          setMessage(
            'We could not accept the invitation right now. It is saved in this browser and will complete on the next sign-in.',
          );
        }
      }
    })();
  }, []);

  async function signOut() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* cookies may already be gone */
    }
    localStorage.removeItem(TOKEN_KEY);
    window.location.replace('/auth');
  }

  return (
    <div className="auth-shell">
      <div className="auth-card reset-card">
        <div className="auth-head">
          <span className="eyebrow">RYUKSAIDSO WORKSPACE</span>
          <h2>Workspace invitation</h2>
          <p>{message}</p>
        </div>
        <div className="oauth-row">
          {!canSignOut && (
            <Link href="/auth" className="primary large">
              Continue to sign in
            </Link>
          )}
          {!canSignOut && (
            <Link href="/auth" className="secondary large">
              Create account
            </Link>
          )}
          {canSignOut && (
            <button type="button" className="primary large" onClick={signOut}>
              Sign out and switch account
            </button>
          )}
        </div>
        {signedInAs && (
          <p className="muted" style={{ marginTop: 14, textAlign: 'center' }}>
            Signed in as {signedInAs}
          </p>
        )}
      </div>
    </div>
  );
}

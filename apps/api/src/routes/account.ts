import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db';
import { audit, hashPassword, type AuthUser } from '../lib/auth';
import { requireAuth, type AuthenticatedRequest } from '../middleware';
import { getLLMProvider, isModelAvailable } from '../services/llm';
import { sendVerificationEmail, sendWorkspaceInvitationEmail } from '../services/email';
import { logger } from '../lib/logger';
import { acceptInvitationSchema, inviteMemberSchema } from '../validation';
import { REFRESH_COOKIE, switchSessionOrganization, setSessionCookies } from '../lib/auth';

export const accountRouter = Router();
accountRouter.use(requireAuth);

function user(req: AuthenticatedRequest): AuthUser {
  if (!req.user) throw new Error('Authenticated user missing');
  return req.user;
}

function requireRole(u: AuthUser, roles: string[]) {
  if (!roles.includes(u.role)) throw Object.assign(new Error('Insufficient permissions'), { statusCode: 403 });
}

function hashSecret(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function readCookie(req: { headers: { cookie?: string } }, name: string) {
  for (const part of (req.headers.cookie ?? '').split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return decodeURIComponent(v.join('=')); }
}

accountRouter.get('/profile', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  const result = await prisma.user.findUnique({ where: { id: u.id }, select: { id: true, email: true, name: true, bio: true, jobTitle: true, avatarUrl: true, timezone: true, theme: true, emailVerifiedAt: true, createdAt: true, updatedAt: true } });
  if (!result) return res.status(404).json({ error: 'NotFound', message: 'User not found' });
  res.json(result);
});

accountRouter.patch('/profile', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 2 || name.length > 120) return res.status(400).json({ error: 'ValidationError', message: 'Name must be between 2 and 120 characters' });
    const text = (key: string, max: number) => typeof req.body?.[key] === 'string' ? req.body[key].trim().slice(0, max) : undefined;
    const theme = ['light','dark','system'].includes(String(req.body?.theme)) ? String(req.body.theme) : undefined;
    const data: any = { name, bio: text('bio', 1000), jobTitle: text('jobTitle', 120), avatarUrl: text('avatarUrl', 1000), timezone: text('timezone', 100), ...(theme ? { theme } : {}) };
    const updated = await prisma.user.update({ where: { id: u.id }, data, select: { id: true, email: true, name: true, bio: true, jobTitle: true, avatarUrl: true, timezone: true, theme: true, emailVerifiedAt: true, createdAt: true, updatedAt: true } });
    await audit(u, 'profile.updated', 'user', u.id, { fields: Object.keys(data) });
    res.json(updated);
  } catch (e) { next(e); }
});

accountRouter.post('/profile/verify-email', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    const current = await prisma.user.findUnique({ where: { id: u.id }, select: { email: true, emailVerifiedAt: true } });
    if (!current) return res.status(404).json({ error:'NotFound', message:'User not found' });
    if (current.emailVerifiedAt) return res.json({ verified: true, message: 'Email is already verified.' });
    const rawToken = crypto.randomBytes(48).toString('base64url');
    const tokenHash = hashSecret(rawToken);
    await prisma.$transaction(async tx => {
      await tx.emailVerificationToken.updateMany({ where: { userId: u.id, usedAt: null }, data: { usedAt: new Date() } });
      await tx.emailVerificationToken.create({ data: { userId: u.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
    });
    const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${encodeURIComponent(rawToken)}`;
    try {
      await sendVerificationEmail(current.email, verifyUrl);
    } catch (error) {
      logger.error('Verification email could not be sent', { event: 'verification_email_failed', email: current.email, error: error instanceof Error ? error.message : String(error) });
      if ((process.env.NODE_ENV || 'development') !== 'production') console.log(`[RYUKSAIDSO] Verification URL for ${current.email}: ${verifyUrl}`);
      return res.status(202).json({ verified: false, message: 'We could not deliver the verification email right now. Please try again in a few minutes.' });
    }
    await audit(u, 'profile.verification_requested', 'user', u.id);
    res.status(202).json({ verified: false, message: 'Verification email sent.' });
  } catch (e) { next(e); }
});

accountRouter.post('/profile/password', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest);
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');
    if (newPassword.length < 12 || newPassword.length > 128) return res.status(400).json({ error: 'ValidationError', message: 'New password must be between 12 and 128 characters' });
    const record = await prisma.user.findUnique({ where: { id: u.id }, select: { passwordHash: true } });
    if (!record?.passwordHash || !(await bcrypt.compare(currentPassword, record.passwordHash))) return res.status(400).json({ error: 'ValidationError', message: 'Current password is incorrect or this account uses OAuth only' });
    const currentRefresh = readCookie(req as any, REFRESH_COOKIE);
    const currentRefreshHash = currentRefresh ? hashSecret(currentRefresh) : null;
    await prisma.$transaction(async tx => {
      await tx.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(newPassword) } });
      await tx.session.updateMany({
        where: {
          userId: u.id,
          revokedAt: null,
          ...(currentRefreshHash ? { tokenHash: { not: currentRefreshHash } } : {}),
        },
        data: { revokedAt: new Date() },
      });
    });
    await audit(u, 'profile.password_changed', 'user', u.id, { otherSessionsRevoked: true });
    res.status(204).send();
  } catch (e) { next(e); }
});





accountRouter.get('/llm/providers', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  const organization = await prisma.organization.findUnique({ where: { id:u.organizationId }, select: { llmProvider:true, ollamaModel:true, omnirouteModel:true } });
  const results = await Promise.all((['OLLAMA','OMNIROUTE'] as const).map(async provider => {
    const model = provider === 'OLLAMA' ? organization?.ollamaModel : organization?.omnirouteModel;
    try {
      const models = await getLLMProvider(provider, model || undefined).models();
      const selectedModel = model && isModelAvailable(models, model) ? model : (models[0] || model || '');
      return { provider, configured: true, models, selectedModel };
    } catch (error) {
      return { provider, configured: false, models: [], selectedModel: model || '', error: error instanceof Error ? error.message : String(error) };
    }
  }));
  res.json({ current: organization?.llmProvider || 'OLLAMA', providers: results });
});

accountRouter.get('/llm', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  const organization = await prisma.organization.findUnique({ where: { id: u.organizationId }, select: { llmProvider:true, ollamaModel:true, omnirouteModel:true } });
  if (!organization) return res.status(404).json({ error:'NotFound', message:'Organization not found' });
  res.json(organization);
});

accountRouter.patch('/llm', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest); requireRole(u, ['OWNER','ADMIN']);
    const provider = String(req.body?.provider || '');
    const model = typeof req.body?.model === 'string' ? req.body.model.trim().slice(0,200) : '';
    if (!['OLLAMA','OMNIROUTE'].includes(provider)) return res.status(400).json({ error:'ValidationError', message:'Provider must be OLLAMA or OMNIROUTE' });
    if (!model) return res.status(400).json({ error:'ValidationError', message:'A model is required' });
    try {
      const discovered = await getLLMProvider(provider as 'OLLAMA' | 'OMNIROUTE', model).models();
      if (discovered.length && !isModelAvailable(discovered, model)) {
        return res.status(400).json({ error:'ModelUnavailable', message:`${provider} is reachable, but model "${model}" is not available. Choose a discovered model or install/configure it first.` });
      }
    } catch (error) {
      return res.status(503).json({ error:'ProviderUnavailable', message:`Could not reach ${provider}. Check its URL, API key, and model service before saving this provider.` });
    }
    const data = provider === 'OLLAMA' ? { llmProvider: provider as any, ollamaModel: model } : { llmProvider: provider as any, omnirouteModel: model };
    const organization = await prisma.organization.update({ where:{id:u.organizationId}, data, select:{llmProvider:true,ollamaModel:true,omnirouteModel:true} });
    await audit(u,'llm.preference_changed','organization',u.organizationId,{provider,model});
    res.json(organization);
  } catch(e){ next(e); }
});

accountRouter.get('/organization', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  const organization = await prisma.organization.findUnique({ where: { id: u.organizationId }, select: { id: true, name: true, createdAt: true, updatedAt: true, _count: { select: { members: true, tickets: true, agents: true, documents: true, runs: true } } } });
  if (!organization) return res.status(404).json({ error: 'NotFound', message: 'Organization not found' });
  res.json(organization);
});

accountRouter.patch('/organization', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest); requireRole(u, ['OWNER', 'ADMIN']);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 2 || name.length > 120) return res.status(400).json({ error: 'ValidationError', message: 'Workspace name must be between 2 and 120 characters' });
    const organization = await prisma.organization.update({ where: { id: u.organizationId }, data: { name } });
    await audit(u, 'organization.updated', 'organization', u.organizationId, { fields: ['name'] });
    res.json(organization);
  } catch (e) { next(e); }
});

accountRouter.get('/members', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  const members = await prisma.membership.findMany({ where: { organizationId: u.organizationId }, include: { user: { select: { id: true, email: true, name: true, emailVerifiedAt: true, createdAt: true } } }, orderBy: { user: { name: 'asc' } } });
  res.json(members);
});

accountRouter.patch('/members/:id/role', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest); requireRole(u, ['OWNER','ADMIN']);
    const role = String(req.body?.role ?? '');
    if (!['OWNER', 'ADMIN', 'AGENT', 'VIEWER'].includes(role)) return res.status(400).json({ error: 'ValidationError', message: 'Invalid role' });
    if (u.role !== 'OWNER' && role === 'OWNER') return res.status(403).json({ error: 'Forbidden', message: 'Only the workspace owner can grant the owner role' });
    const membership = await prisma.membership.findFirst({ where: { id: req.params.id, organizationId: u.organizationId }, include: { user: true } });
    if (!membership) return res.status(404).json({ error: 'NotFound', message: 'Member not found' });
    if (membership.userId === u.id && role !== 'OWNER') return res.status(400).json({ error: 'ValidationError', message: 'The organization owner cannot demote themselves' });
    if (membership.role === 'OWNER' && role !== 'OWNER') {
      const owners = await prisma.membership.count({ where: { organizationId: u.organizationId, role: 'OWNER' } });
      if (owners <= 1) return res.status(400).json({ error: 'ValidationError', message: 'An organization must retain an owner' });
    }
    const updated = await prisma.membership.update({ where: { id: membership.id }, data: { role: role as any }, include: { user: { select: { id: true, email: true, name: true } } } });
    await prisma.session.updateMany({ where: { userId: membership.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(u, 'member.role_changed', 'membership', membership.id, { targetUserId: membership.userId, role });
    res.json(updated);
  } catch (e) { next(e); }
});

accountRouter.delete('/members/:id', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest); requireRole(u, ['OWNER', 'ADMIN']);
    const membership = await prisma.membership.findFirst({ where: { id: req.params.id, organizationId: u.organizationId } });
    if (!membership) return res.status(404).json({ error: 'NotFound', message: 'Member not found' });
    if (membership.userId === u.id) return res.status(400).json({ error: 'ValidationError', message: 'You cannot remove yourself from the workspace' });
    if (membership.role === 'OWNER') return res.status(400).json({ error: 'ValidationError', message: 'Transfer ownership before removing an owner' });
    await prisma.membership.delete({ where: { id: membership.id } });
    await audit(u, 'member.removed', 'membership', membership.id, { targetUserId: membership.userId });
    res.status(204).send();
  } catch (e) { next(e); }
});

accountRouter.get('/workspaces', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  const memberships = await prisma.membership.findMany({ where: { userId: u.id }, include: { organization: { select: { id:true,name:true,createdAt:true,_count:{select:{members:true,agents:true,projects:true,runs:true}} } } }, orderBy: { organization: { name:'asc' } } });
  res.json(memberships.map(m => ({ id:m.id, role:m.role, organization:m.organization, active:m.organization.id===u.organizationId })));
});

accountRouter.post('/workspaces/:organizationId/switch', async (req, res, next) => {
  try {
    const refresh = readCookie(req as any, REFRESH_COOKIE);
    if (!refresh) return res.status(401).json({ error:'Unauthorized', message:'Refresh session missing' });
    const switched = await switchSessionOrganization(refresh, req.params.organizationId);
    if (!switched) return res.status(403).json({ error:'Forbidden', message:'You are not a member of this workspace or the session is invalid' });
    setSessionCookies(res, switched.accessToken, switched.refreshToken);
    await audit(switched.user, 'workspace.switched', 'organization', switched.user.organizationId);
    res.json({ user: switched.user });
  } catch (e) { next(e); }
});

accountRouter.get('/workspace/invitations', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  requireRole(u, ['OWNER','ADMIN']);
  // Never expose tokenHash: it is the credential that proves the invitation
  // (the accept endpoint hashes the raw link token and compares it).
  const rows = await prisma.workspaceInvitation.findMany({
    where: { organizationId: u.organizationId },
    orderBy: { createdAt:'desc' },
    take:100,
    select: { id:true, email:true, role:true, expiresAt:true, acceptedAt:true, createdAt:true, invitedBy:true },
  });
  res.json(rows);
});

accountRouter.post('/workspace/invitations', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest); requireRole(u, ['OWNER','ADMIN']);
    const body = inviteMemberSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const existing = await prisma.membership.findFirst({ where: { organizationId:u.organizationId, user:{ email } } });
    if (existing) return res.status(409).json({ error:'Conflict', message:'That user is already a member of this workspace' });
    const rawToken = crypto.randomBytes(48).toString('base64url');
    const tokenHash = hashSecret(rawToken);
    const expiresAt = new Date(Date.now()+7*86400000);
    const pending = await prisma.workspaceInvitation.findFirst({ where:{ organizationId:u.organizationId,email,acceptedAt:null } });
    const invitation = pending
      ? await prisma.workspaceInvitation.update({ where:{id:pending.id}, data:{role:body.role as any,tokenHash,invitedBy:u.id,expiresAt} })
      : await prisma.workspaceInvitation.create({ data:{ organizationId:u.organizationId,email,role:body.role as any,tokenHash,invitedBy:u.id,expiresAt } });
    const org = await prisma.organization.findUnique({ where:{id:u.organizationId}, select:{name:true} });
    const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite?token=${encodeURIComponent(rawToken)}`;
    let emailSent = true;
    try { await sendWorkspaceInvitationEmail(email, org?.name || 'Workspace', body.role, inviteUrl); }
    catch (error) { emailSent=false; if ((process.env.NODE_ENV || 'development') === 'production') console.error('[RYUKSAIDSO] Invitation email failed:', error); else console.log(`[RYUKSAIDSO] Invitation URL for ${email}: ${inviteUrl}`); }
    await audit(u,'workspace.invited','invitation',invitation.id,{email,role:body.role,emailSent});
    // The raw link is returned to the OWNER/ADMIN who created the invitation so
    // the UI can offer "copy link" (and so invites still work when email is not
    // configured). Only the invited mailbox can actually accept it.
    res.status(201).json({
      id: invitation.id,
      email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      emailSent,
      inviteUrl,
    });
  } catch(e){ next(e); }
});

accountRouter.delete('/workspace/invitations/:id', async (req,res,next)=>{
  try { const u=user(req as AuthenticatedRequest); requireRole(u,['OWNER','ADMIN']); const row=await prisma.workspaceInvitation.findFirst({where:{id:req.params.id,organizationId:u.organizationId}}); if(!row)return res.status(404).json({error:'NotFound',message:'Invitation not found'}); await prisma.workspaceInvitation.delete({where:{id:row.id}}); await audit(u,'workspace.invitation_revoked','invitation',row.id); res.status(204).send(); } catch(e){next(e);} });

accountRouter.post('/workspace/invitations/accept', async (req,res,next)=>{
  try {
    const u=user(req as AuthenticatedRequest); const body=acceptInvitationSchema.parse(req.body); const tokenHash=hashSecret(body.token);
    const invitation=await prisma.workspaceInvitation.findUnique({where:{tokenHash},include:{organization:{select:{id:true,name:true}}}});
    if(!invitation || invitation.acceptedAt || invitation.expiresAt<=new Date()) return res.status(400).json({error:'InvalidInvitation',message:'This invitation is invalid or has expired.'});
    if(invitation.email!==u.email.toLowerCase()) return res.status(403).json({error:'Forbidden',message:'This invitation was sent to a different email address.'});
    const result=await prisma.$transaction(async tx=>{
      const membership=await tx.membership.upsert({where:{userId_organizationId:{userId:u.id,organizationId:invitation.organizationId}},create:{userId:u.id,organizationId:invitation.organizationId,role:invitation.role},update:{role:invitation.role}});
      await tx.workspaceInvitation.update({where:{id:invitation.id},data:{acceptedAt:new Date()}});
      return membership;
    });
    await prisma.session.updateMany({where:{userId:u.id,organizationId:invitation.organizationId,revokedAt:null},data:{revokedAt:new Date()}});
    const refresh = readCookie(req as any, REFRESH_COOKIE);
    const switched = refresh ? await switchSessionOrganization(refresh, invitation.organizationId) : null;
    const activeUser = switched?.user ?? u;
    if (switched) setSessionCookies(res, switched.accessToken, switched.refreshToken);
    await audit(activeUser,'workspace.invitation_accepted','membership',result.id,{organizationId:invitation.organizationId,role:result.role});
    res.status(201).json({membership:result,organization:invitation.organization,user:activeUser});
  } catch(e){next(e);} });

accountRouter.get('/sessions', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  const sessions = await prisma.session.findMany({ where: { userId: u.id, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, createdAt: true, expiresAt: true }, orderBy: { createdAt: 'desc' } });
  res.json(sessions);
});

accountRouter.post('/sessions/revoke-all', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  await prisma.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(u, 'session.revoke_all', 'user', u.id);
  res.status(204).send();
});

accountRouter.get('/api-keys', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  if (!['OWNER', 'ADMIN'].includes(u.role)) return res.json([]);
  const keys = await prisma.apiKey.findMany({ where: { organizationId: u.organizationId }, select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
  res.json(keys);
});

accountRouter.post('/api-keys', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest); requireRole(u, ['OWNER', 'ADMIN']);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'ValidationError', message: 'API key name must be between 2 and 80 characters' });
    const secret = `rsk_${crypto.randomBytes(32).toString('base64url')}`;
    const prefix = secret.slice(0, 12);
    const created = await prisma.apiKey.create({ data: { organizationId: u.organizationId, name, prefix, secretHash: hashSecret(secret) } });
    await audit(u, 'api_key.created', 'api_key', created.id, { name });
    res.status(201).json({ id: created.id, name: created.name, prefix: created.prefix, secret, createdAt: created.createdAt });
  } catch (e) { next(e); }
});

accountRouter.delete('/api-keys/:id', async (req, res, next) => {
  try {
    const u = user(req as AuthenticatedRequest); requireRole(u, ['OWNER', 'ADMIN']);
    const key = await prisma.apiKey.findFirst({ where: { id: req.params.id, organizationId: u.organizationId } });
    if (!key) return res.status(404).json({ error: 'NotFound', message: 'API key not found' });
    await prisma.apiKey.delete({ where: { id: key.id } });
    await audit(u, 'api_key.revoked', 'api_key', key.id, { name: key.name });
    res.status(204).send();
  } catch (e) { next(e); }
});

accountRouter.get('/audit', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 250);
  const logs = await prisma.auditLog.findMany({ where: { organizationId: u.organizationId }, orderBy: { createdAt: 'desc' }, take: limit });
  res.json(logs);
});

accountRouter.get('/security', async (req, res) => {
  const u = user(req as AuthenticatedRequest);
  const [members, pendingApprovals, sessions, apiKeys] = await Promise.all([
    prisma.membership.count({ where: { organizationId: u.organizationId } }),
    prisma.approval.count({ where: { organizationId: u.organizationId, status: 'PENDING' } }),
    prisma.session.count({ where: { userId: u.id, revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.apiKey.count({ where: { organizationId: u.organizationId } })
  ]);
  res.json({ rbac: true, role: u.role, members, pendingApprovals, activeSessions: sessions, apiKeys, auditTrail: true, httpOnlySession: true });
});

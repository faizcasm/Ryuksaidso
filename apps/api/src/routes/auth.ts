import { Router, type Response } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db';
import { redis } from '../lib/redis';
import { config } from '../lib/config';
import { audit, clearAuthCookies, createSession, providerConfig, rotateSession, revokeSession, setSessionCookies, verifyPassword, hashPassword, ACCESS_COOKIE, REFRESH_COOKIE } from '../lib/auth';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from '../validation';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/email';
import { logger } from '../lib/logger';
import rateLimit from 'express-rate-limit';

export const authRouter = Router();

const passwordRecoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'RateLimitExceeded', message: 'Too many failed attempts, please try again later.' }
});

function issue(res: Response, user: { id:string; email:string; name:string; organizationId:string; role:string }) {
  return createSession(user).then(({ accessToken, refreshToken, user: subject }) => {
    setSessionCookies(res, accessToken, refreshToken);
    return res.json({ user: subject });
  });
}

function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
const DEFAULT_AGENTS = [
  ['Triage Agent','triage','Classify incoming support requests and identify intent, urgency, entities and required capabilities.'],
  ['Knowledge Agent','knowledge','Retrieve and synthesize organization knowledge using the knowledge search tool.'],
  ['Research Agent','research','Investigate the ticket using organization-scoped support context and safe tools.'],
  ['Resolution Agent','resolution','Synthesize an evidence-backed support response and clearly state uncertainty.']
] as const;

async function provisionAgents(tx: any, organizationId: string) {
  const project = await tx.project.create({
    data: {
      organizationId,
      name: 'Core Agent Platform',
      slug: 'core-agent-platform',
      description: 'Production agent workspace for experiments, traces, evaluations and safe tool execution.'
    }
  });

  await tx.policy.createMany({
    data: [
      { organizationId, name: 'Write operations require approval', description: 'Pause outbound or mutating tool calls until a human approves them.', action: 'ticket:write', requiresApproval: true, severity: 'high' },
      { organizationId, name: 'External side effects require approval', description: 'Any tool marked as a write action must stop for explicit human review.', action: 'external:write', requiresApproval: true, severity: 'critical' },
      { organizationId, name: 'Knowledge reads are always allowed', description: 'Allow organization-scoped retrieval without an approval round trip.', action: 'knowledge:read', requiresApproval: false, severity: 'low' }
    ]
  });

  for (const [name,slug,instructions] of DEFAULT_AGENTS) {
    const agent = await tx.agent.create({ data: { organizationId, projectId: project.id, name, slug, instructions, enabled: true, tools: ['search_knowledge','get_ticket','add_ticket_message'] } });
    await tx.agentVersion.create({
      data: {
        agentId: agent.id,
        version: 1,
        config: { instructions, tools: ['search_knowledge','get_ticket','add_ticket_message'], temperature: 0.1 },
        changelog: 'Initial production agent version',
        publishedAt: new Date()
      }
    });
  }
}



function readCookie(req: { headers: { cookie?: string } }, name: string) {
  for (const part of (req.headers.cookie ?? '').split(';')) { const [k,...v]=part.trim().split('='); if(k===name) return decodeURIComponent(v.join('=')); }
}

authRouter.get('/providers', (_req, res) => res.json({ google: Boolean(providerConfig('google')), github: Boolean(providerConfig('github')) }));

async function createVerificationToken(userId: string) {
  const rawToken = crypto.randomBytes(48).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await prisma.$transaction(async tx => {
    await tx.emailVerificationToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
    await tx.emailVerificationToken.create({ data: { userId, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
  });
  return rawToken;
}

authRouter.post('/register', credentialLimiter, async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body); const email = normalizeEmail(body.email);
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error:'Conflict', message:'Email already registered' });
    const passwordHash = await hashPassword(body.password);
    const result = await prisma.$transaction(async tx => {
      const user = await tx.user.create({ data:{ email, name:body.name.trim(), passwordHash } });
      const org = await tx.organization.create({ data:{ name:body.organizationName?.trim() || `${body.name.trim()}'s Workspace` } });
      await tx.membership.create({ data:{ userId:user.id, organizationId:org.id, role:'OWNER' } });
      await provisionAgents(tx, org.id);
      return { user, org };
    });
    const authUser = { id:result.user.id,email:result.user.email,name:result.user.name,organizationId:result.org.id,role:'OWNER' };
    try {
      const rawToken = await createVerificationToken(result.user.id);
      const verifyUrl = `${config.FRONTEND_URL}/verify-email?token=${encodeURIComponent(rawToken)}`;
      await sendVerificationEmail(result.user.email, verifyUrl);
    } catch (error) {
      if (config.NODE_ENV !== 'production') console.log(`[${config.APP_NAME}] Verification URL unavailable:`, error instanceof Error ? error.message : error);
    }
    await audit(authUser,'auth.register','user',authUser.id);
    return issue(res, authUser);
  } catch (e) { next(e); }
});

authRouter.post('/login', credentialLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body); const email = normalizeEmail(body.email);
    const user = await prisma.user.findUnique({ where:{email}, include:{memberships:true} });
    if (!user?.passwordHash || !(await verifyPassword(body.password,user.passwordHash))) return res.status(401).json({error:'Unauthorized',message:'Invalid credentials'});
    const membership = user.memberships[0]; if (!membership) return res.status(403).json({error:'Forbidden',message:'No organization membership'});
    const authUser = {id:user.id,email:user.email,name:user.name,organizationId:membership.organizationId,role:membership.role};
    await audit(authUser,'auth.login','user',user.id); return issue(res,authUser);
  } catch(e){ next(e); }
});



authRouter.post('/verify-email', credentialLimiter, async (req, res, next) => {
  try {
    const tokenValue = String(req.body?.token || '');
    if (tokenValue.length < 20) return res.status(400).json({ error: 'ValidationError', message: 'Verification token is required' });
    const tokenHash = crypto.createHash('sha256').update(tokenValue).digest('hex');
    const token = await prisma.emailVerificationToken.findUnique({ where: { tokenHash }, include: { user: { include: { memberships: true } } } });
    if (!token || token.usedAt || token.expiresAt <= new Date()) return res.status(400).json({ error:'InvalidToken', message:'This verification link is invalid or has expired.' });
    await prisma.$transaction(async tx => {
      await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: new Date() } });
      await tx.emailVerificationToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
      await tx.emailVerificationToken.updateMany({ where: { userId: token.userId, usedAt: null }, data: { usedAt: new Date() } });
    });
    const membership = token.user.memberships[0];
    if (membership) await audit({ id: token.user.id, email: token.user.email, name: token.user.name, organizationId: membership.organizationId, role: membership.role }, 'auth.email_verified', 'user', token.userId);
    res.json({ verified: true, message: 'Email verified successfully.' });
  } catch (e) { next(e); }
});

authRouter.post('/forgot-password', passwordRecoveryLimiter, async (req, res, next) => {
  try {
    const body = forgotPasswordSchema.parse(req.body);
    const email = normalizeEmail(body.email);
    const user = await prisma.user.findUnique({ where: { email }, include: { memberships: true } });

    const response = { message: 'If that email is registered, a password reset link has been sent.' };
    if (!user) return res.status(202).json(response);

    const rawToken = crypto.randomBytes(48).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await prisma.$transaction(async tx => {
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
    });

    const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (error) {
      logger.error('Password reset email could not be sent', { event: 'password_reset_email_failed', email: user.email, error: error instanceof Error ? error.message : String(error) });
      if (config.NODE_ENV !== 'production') console.log(`[${config.APP_NAME}] Password reset URL for ${user.email}: ${resetUrl}`);
    }
    const membership = user.memberships[0];
    if (membership) await audit({ id:user.id,email:user.email,name:user.name,organizationId:membership.organizationId,role:membership.role }, 'auth.password_reset_requested', 'user', user.id);
    return res.status(202).json(response);
  } catch (e) { next(e); }
});

authRouter.post('/reset-password', passwordRecoveryLimiter, async (req, res, next) => {
  try {
    const body = resetPasswordSchema.parse(req.body);
    const tokenHash = crypto.createHash('sha256').update(body.token).digest('hex');
    const token = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!token || token.usedAt || token.expiresAt <= new Date()) return res.status(400).json({ error:'InvalidToken', message:'This password reset link is invalid or has expired.' });

    const passwordHash = await hashPassword(body.password);
    const result = await prisma.$transaction(async tx => {
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      await tx.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
      await tx.passwordResetToken.updateMany({ where: { userId: token.userId, usedAt: null, id: { not: token.id } }, data: { usedAt: new Date() } });
      await tx.session.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return tx.membership.findFirst({ where: { userId: token.userId } });
    });
    if (result) {
      await audit({ id:token.user.id,email:token.user.email,name:token.user.name,organizationId:result.organizationId,role:result.role }, 'auth.password_reset_completed', 'user', token.userId);
    }
    clearAuthCookies(res);
    res.json({ message:'Password updated successfully. Please sign in again.' });
  } catch (e) { next(e); }
});
authRouter.post('/refresh', async (req,res,next)=>{
  try {
    const token=readCookie(req,REFRESH_COOKIE); if(!token) return res.status(401).json({error:'Unauthorized',message:'Refresh session missing'});
    const rotated=await rotateSession(token); if(!rotated) { clearAuthCookies(res); return res.status(401).json({error:'Unauthorized',message:'Refresh session expired'}); }
    setSessionCookies(res, rotated.accessToken, rotated.refreshToken); return res.json({user:rotated.user});
  } catch(e){ next(e); }
});

authRouter.post('/logout', async (req,res,next)=>{
  try { const token=readCookie(req,REFRESH_COOKIE); if(token) await revokeSession(token); clearAuthCookies(res); res.status(204).send(); } catch(e){ next(e); }
});

authRouter.get('/oauth/:provider', async (req,res,next)=>{
  try {
    const provider=req.params.provider as 'google'|'github'; if(!['google','github'].includes(provider)) return res.status(404).json({error:'NotFound',message:'OAuth provider not supported'});
    const cfg=providerConfig(provider); if(!cfg) return res.status(503).json({error:'Unavailable',message:`${provider} OAuth is not configured`});
    const state=crypto.randomBytes(32).toString('base64url'); const verifier=crypto.randomBytes(32).toString('base64url');
    const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
    await redis.set(`oauth:state:${state}`,JSON.stringify({provider,verifier}), 'EX', 600);
    const url=new URL(cfg.authorization); url.searchParams.set('client_id',cfg.clientId); url.searchParams.set('redirect_uri',cfg.redirectUri); url.searchParams.set('response_type','code'); url.searchParams.set('scope',cfg.scope); url.searchParams.set('state',state); url.searchParams.set('code_challenge',challenge); url.searchParams.set('code_challenge_method','S256');
    res.redirect(url.toString());
  } catch(e){ next(e); }
});

authRouter.get('/oauth/:provider/callback', async (req,res,next)=>{
  try {
    const provider=req.params.provider as 'google'|'github'; const cfg=providerConfig(provider); const state=String(req.query.state||''); const code=String(req.query.code||'');
    if(!cfg || !state || !code) return res.redirect(`${config.FRONTEND_URL}/auth/error?reason=oauth_invalid_callback`);
    const stored=await redis.get(`oauth:state:${state}`); await redis.del(`oauth:state:${state}`); if(!stored) return res.redirect(`${config.FRONTEND_URL}/auth/error?reason=oauth_state_expired`);
    const parsed=JSON.parse(stored) as {provider:string;verifier:string}; if(parsed.provider!==provider) return res.redirect(`${config.FRONTEND_URL}/auth/error?reason=oauth_provider_mismatch`);
    const body=new URLSearchParams({client_id:cfg.clientId,client_secret:cfg.clientSecret,code,redirect_uri:cfg.redirectUri,grant_type:'authorization_code',code_verifier:parsed.verifier});
    const tokenRes=await fetch(cfg.token,{method:'POST',headers:{accept:'application/json','content-type':'application/x-www-form-urlencoded'},body}); if(!tokenRes.ok) throw new Error(`OAuth token exchange failed: ${tokenRes.status}`);
    const token=await tokenRes.json() as {access_token?:string}; if(!token.access_token) throw new Error('OAuth provider returned no access token');
    let profile:{id:string;email:string;name:string};
    if(provider==='google') {
      const r=await fetch(cfg.userinfo,{headers:{authorization:`Bearer ${token.access_token}`}}); if(!r.ok) throw new Error('Google userinfo request failed'); const p=await r.json() as {sub:string;email?:string;name?:string;email_verified?:boolean}; if(!p.email || p.email_verified===false) throw new Error('Google account has no verified email'); profile={id:p.sub,email:normalizeEmail(p.email),name:p.name||p.email.split('@')[0]};
    } else {
      const r=await fetch(cfg.userinfo,{headers:{authorization:`Bearer ${token.access_token}`,accept:'application/vnd.github+json','user-agent':'Ryuksaidso'}}); if(!r.ok) throw new Error('GitHub user request failed'); const p=await r.json() as {id:number;email?:string;name?:string;login:string}; let email=p.email;
      if(!email){const er=await fetch('https://api.github.com/user/emails',{headers:{authorization:`Bearer ${token.access_token}`,accept:'application/vnd.github+json','user-agent':'Ryuksaidso'}}); const emails=await er.json() as Array<{email:string;primary:boolean;verified:boolean}>; email=emails.find(x=>x.primary&&x.verified)?.email;}
      if(!email) throw new Error('GitHub account has no verified email'); profile={id:String(p.id),email:normalizeEmail(email),name:p.name||p.login};
    }
    const result=await prisma.$transaction(async tx=>{
      const existing=await tx.oAuthAccount.findUnique({where:{provider_providerAccountId:{provider,providerAccountId:profile.id}},include:{user:{include:{memberships:true}}}});
      if(existing){return {user:existing.user,membership:existing.user.memberships[0]};}
      let user=await tx.user.findUnique({where:{email:profile.email},include:{memberships:true}});
      if(!user){user=await tx.user.create({data:{email:profile.email,name:profile.name,emailVerifiedAt:new Date()},include:{memberships:true}}); const org=await tx.organization.create({data:{name:`${profile.name}'s Workspace`}}); const membership=await tx.membership.create({data:{userId:user.id,organizationId:org.id,role:'OWNER'}}); await provisionAgents(tx,org.id); user.memberships=[membership];}
      else if(!user.emailVerifiedAt) user=await tx.user.update({where:{id:user.id},data:{emailVerifiedAt:new Date()},include:{memberships:true}});
      await tx.oAuthAccount.create({data:{provider,providerAccountId:profile.id,userId:user.id}}); return {user,membership:user.memberships[0]};
    });
    if(!result.membership) throw new Error('OAuth user has no organization membership');
    const authUser={id:result.user.id,email:result.user.email,name:result.user.name,organizationId:result.membership.organizationId,role:result.membership.role};
    const session=await createSession(authUser);
    setSessionCookies(res, session.accessToken, session.refreshToken);
    await audit(authUser,'auth.oauth_login',provider,profile.id); res.redirect(`${config.FRONTEND_URL}/auth/callback`);
  } catch(e){
    console.error(`[${config.APP_NAME}] OAuth callback failed`, e);
    if (!res.headersSent) return res.redirect(`${config.FRONTEND_URL}/auth/error?reason=oauth_failed`);
    next(e);
  }
});

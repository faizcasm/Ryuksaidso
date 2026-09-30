
'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
export default function VerifyEmailPage(){ const [state,setState]=useState<'loading'|'ok'|'error'>('loading'); const [message,setMessage]=useState('Verifying your email…'); useEffect(()=>{ const token=new URLSearchParams(window.location.search).get('token')||''; if(!token){setState('error');setMessage('Verification token is missing.');return;} api('/auth/verify-email',{method:'POST',body:JSON.stringify({token})}).then((r:any)=>{setState('ok');setMessage(r.message||'Email verified successfully.');}).catch((e)=>{setState('error');setMessage(e instanceof Error?e.message:'Could not verify email.');}); },[]); return <div className="auth-shell"><div className="auth-card reset-card"><div className="auth-head"><span className="eyebrow">RYUKSAIDSO SECURITY</span><h2>{state==='loading'?'Verifying email':state==='ok'?'Email verified':'Verification failed'}</h2><p>{message}</p></div><Link href="/auth" className="primary large">Return to RYUKSAIDSO</Link></div></div>; }

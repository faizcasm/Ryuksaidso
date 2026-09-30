'use client';
import { useState, type FormEvent } from 'react';
import { Lock, Check } from 'lucide-react';
import { api } from '../../lib/api';
export default function ResetPassword(){
  const token = typeof window!=='undefined' ? new URLSearchParams(window.location.search).get('token')||'' : '';
  const [password,setPassword]=useState(''); const [message,setMessage]=useState(''); const [error,setError]=useState(''); const [done,setDone]=useState(false);
  async function submit(e:FormEvent){e.preventDefault();setError('');try{await api('/auth/reset-password',{method:'POST',body:JSON.stringify({token,password})});setDone(true);setMessage('Password updated. You can sign in again.');}catch(e){setError(e instanceof Error?e.message:'Could not reset password');}}
  return <div className="auth-shell"><div className="auth-card reset-card"><div className="auth-head"><span className="eyebrow">RYUKSAIDSO SECURITY</span><h2>{done?'Password updated':'Choose a new password'}</h2><p>{done?message:'This link is single-use and expires after 30 minutes.'}</p></div>{error&&<div className="inline-error">{error}</div>}{!done&&<form className="auth-form" onSubmit={submit}><label>New password<input type="password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)} placeholder="12+ characters" required/></label><button className="primary large" type="submit"><Lock size={15}/>Set password</button></form>}{done&&<a href="/auth" className="primary large"><Check size={15}/>Return to sign in</a>}</div></div>;
}

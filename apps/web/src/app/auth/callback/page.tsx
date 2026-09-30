'use client';
import { useEffect } from 'react';
export default function AuthCallback(){ useEffect(()=>{ window.location.replace('/dashboard'); },[]); return <div className="boot"><div className="boot-orb">✓</div><b>RYUKSAIDSO</b><span>finishing authentication…</span></div>; }

'use client';
import Link from 'next/link';
export default function AuthError(){ return <div className="boot"><div className="boot-orb">!</div><b>Authentication could not be completed</b><span>Return to the Ryuksaidso sign-in screen.</span><Link href="/auth" className="primary">Back to sign in</Link></div>; }

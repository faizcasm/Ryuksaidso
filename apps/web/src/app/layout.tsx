import './globals.css';
import type { ReactNode } from 'react';
export const metadata={title:'RYUKSAIDSO — Agent Reliability & Control Plane',description:'Operate, trace, evaluate and safely ship production AI agents.'};
export default function RootLayout({children}:{children:ReactNode}){return <html lang="en" data-theme="dark" suppressHydrationWarning><body>{children}</body></html>}

import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Playground',
  description:
    'Run a deterministic simulation of the RYUKSAIDSO control plane in your browser: queue runs, inspect traces, step through policy gates and approve decisions.',
  alternates: { canonical: '/playground' },
  openGraph: { url: '/playground', title: `Playground · ${SITE_NAME}` },
};

export default function PlaygroundLayout({ children }: { children: React.ReactNode }) {
  return children;
}

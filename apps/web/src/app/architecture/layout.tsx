import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Architecture',
  description:
    'Interactive 3D architecture of the RYUKSAIDSO control plane: web, API, worker, Postgres, Redis, nginx, LLM gateways and every request path between them.',
  alternates: { canonical: '/architecture' },
  openGraph: { url: '/architecture', title: `Architecture · ${SITE_NAME}` },
};

export default function ArchitectureLayout({ children }: { children: React.ReactNode }) {
  return children;
}

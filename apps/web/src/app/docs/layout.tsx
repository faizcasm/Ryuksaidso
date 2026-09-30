import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'Complete documentation for RYUKSAIDSO: quickstart, environment reference, API guide, auth, health endpoints and production hardening.',
  alternates: { canonical: '/docs' },
  openGraph: { url: '/docs', title: `Documentation · ${SITE_NAME}` },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

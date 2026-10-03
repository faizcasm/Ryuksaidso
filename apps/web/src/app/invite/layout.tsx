import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Accept invitation',
  description: 'Accept your invitation to a RYUKSAIDSO workspace.',
  robots: { index: false, follow: false },
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}

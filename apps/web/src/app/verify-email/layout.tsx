import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Verify email',
  description: 'Verify the email address on your RYUKSAIDSO account.',
  robots: { index: false, follow: false },
};

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children;
}

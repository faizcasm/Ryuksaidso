import './globals.css';
import type { ReactNode } from 'react';
import { FOUNDER, FOUNDER_HANDLE, SITE_DESCRIPTION, SITE_NAME, SITE_URL, SITE_TAGLINE } from '@/lib/site';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'AI agents',
    'agent reliability',
    'agent control plane',
    'LLM observability',
    'agent tracing',
    'agent evaluation',
    'human in the loop approvals',
    'AI agent rollback',
    'multi-provider failover',
    'LangChain',
    'MCP',
    'OpenAI compatible',
    FOUNDER,
    FOUNDER_HANDLE,
  ],
  authors: [{ name: FOUNDER, url: 'https://faizcasm.me' }],
  creator: FOUNDER,
  publisher: FOUNDER,
  category: 'technology',
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#080a0f',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}

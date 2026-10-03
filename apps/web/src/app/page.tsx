import type { Metadata } from 'next';
import LandingPage from '@/components/LandingPage';
import {
  FOUNDER,
  FOUNDER_HANDLE,
  FOUNDER_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  SOCIALS,
} from '@/lib/site';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: {
    url: `${SITE_URL}/`,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      alternateName: 'Ryuksaidso',
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/icon.png`,
      sameAs: SOCIALS.map((social) => social.url),
      founder: {
        '@type': 'Person',
        name: FOUNDER,
        alternateName: FOUNDER_HANDLE,
        url: FOUNDER_URL,
        sameAs: [FOUNDER_URL],
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      alternateName: 'Ryuksaidso',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web',
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      image: `${SITE_URL}/opengraph-image.jpg`,
      author: { '@id': `${SITE_URL}/#organization` },
      publisher: { '@id': `${SITE_URL}/#organization` },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LandingPage />
    </>
  );
}

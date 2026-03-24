import type { MetadataRoute } from 'next';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/login', '/register'],
        disallow: ['/dashboard', '/api', '/verify-email'],
      },
    ],
    sitemap: `${appUrl.replace(/\/$/, '')}/sitemap.xml`,
    host: appUrl,
  };
}

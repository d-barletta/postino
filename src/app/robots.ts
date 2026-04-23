import type { MetadataRoute } from 'next';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://postino.pro';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/blog', '/blog/*', '/login', '/register'],
        disallow: [
          '/dashboard',
          '/api',
          '/verify-email',
          '/auth',
          '/logout',
          '/reset-password',
          '/forgot-password',
        ],
      },
    ],
    sitemap: `${appUrl.replace(/\/$/, '')}/sitemap.xml`,
    host: appUrl,
  };
}

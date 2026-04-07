import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  serverExternalPackages: [
    'firebase-admin',
    'google-auth-library',
    'nodemailer',
    '@google-cloud/firestore',
    'grpc',
    '@grpc/grpc-js',
  ],

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent this app from being embedded in foreign frames.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // Stop browsers from MIME-sniffing the response content type.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Only send the origin when navigating to a same-origin URL.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Restrict access to sensitive browser features.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Enforce HTTPS for one year; include sub-domains.
          // Only set in production to avoid blocking HTTP-only local dev.
          ...(process.env.NODE_ENV === 'production'
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains',
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;

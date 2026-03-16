import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'firebase-admin',
    'google-auth-library',
    'nodemailer',
    '@google-cloud/firestore',
    'grpc',
    '@grpc/grpc-js',
  ],
};

export default nextConfig;

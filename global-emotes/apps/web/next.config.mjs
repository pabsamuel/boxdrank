/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BRAND_NAME: process.env.BRAND_NAME ?? 'Global Emotes',
    NEXT_PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? 'http://localhost:3001',
  },
};

export default nextConfig;

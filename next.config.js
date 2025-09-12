/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  async headers() {
    const frameAncestors = process.env.NEXT_PUBLIC_FRAME_ANCESTORS || 'https://soniqute.com';
    return [
      { source: "/embed", headers: [{ key: "Content-Security-Policy", value: `frame-ancestors 'self' ${frameAncestors}` }] },
      { source: "/embed-leaderboard", headers: [{ key: "Content-Security-Policy", value: `frame-ancestors 'self' ${frameAncestors}` }] },
    ];
  },
};

module.exports = nextConfig;

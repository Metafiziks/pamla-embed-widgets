/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  async headers() {
    // allow your site to be iframed on these origins
    const raw = process.env.NEXT_PUBLIC_FRAME_ANCESTORS || 'https://soniqute.com';
    const list = raw.split(',').map(s => s.trim()).filter(Boolean);
    const frameAncestors = ["'self'", ...list].join(' ');

    // Recharts needs 'unsafe-eval'; keep this minimal
    const csp = [
      `frame-ancestors ${frameAncestors};`,
      `script-src 'self' 'unsafe-eval';`,
    ].join(' ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

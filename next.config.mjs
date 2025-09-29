/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  async headers() {
    // Comma-separated list -> array of trimmed origins
    const raw = process.env.NEXT_PUBLIC_FRAME_ANCESTORS || 'https://soniqute.com';
    const list = raw.split(',').map(s => s.trim()).filter(Boolean);

    // Build the frame-ancestors directive
    // NOTE: wildcard subdomains only work if you specify them (e.g., https://*.hostingerpreview.com)
    const frameAncestors = ["'self'", ...list].join(' ');

    return [
      {
        source: '/(.*)',
        headers: [
          // Only control frame ancestry; don’t add X-Frame-Options (it conflicts with CSP)
          { key: 'Content-Security-Policy', value: `frame-ancestors ${frameAncestors};` },
        ],
      },
    ];
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Docker image runs Next's self-contained server. `next start` and Vercel
  // don't need it, and `next start` warns when it is set.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
};

module.exports = nextConfig;

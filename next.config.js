/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable static file serving from public folder
  async rewrites() {
    return [
      {
        source: '/skill.md',
        destination: '/api/skill',
      },
      {
        source: '/heartbeat.md',
        destination: '/api/heartbeat-doc',
      },
      {
        source: '/skill.json',
        destination: '/api/skill-json',
      },
    ];
  },
  
  // Headers for CORS
  async headers() {
    const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS || '';
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: allowedOrigins },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

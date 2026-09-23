/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // 前端统一用 /api 开头的路径调后端，由 Next 转发到 api 服务。
  // 这样浏览器看到的始终是同一个来源，cookie 才存得住。
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_INTERNAL_URL ?? 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

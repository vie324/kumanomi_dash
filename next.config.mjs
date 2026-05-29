/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 旧ダッシュボード(legacy/index.html)は Next.js のビルド対象外。
  // 必要に応じて public/ 配下に置けば静的配信できるが、既定では配信しない。
};

export default nextConfig;

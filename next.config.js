/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdf-parse', 'mammoth'],
  typescript: {
    // ⚠️ Permite build em produção mesmo com erros de tipo
    ignoreBuildErrors: true,
  },
  eslint: {
    // ⚠️ Permite build em produção mesmo com erros de lint
    ignoreDuringBuilds: true,
  },
  // Force rebuild - 2025-10-31
}

module.exports = nextConfig

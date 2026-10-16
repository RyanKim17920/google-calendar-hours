// eslint-disable-next-line import/no-extraneous-dependencies
const { StatsWriterPlugin } = require('webpack-stats-plugin');
const { execSync } = require('child_process');

// Builds without a .git directory (e.g. `vercel deploy` uploads) must not fail,
// so fall back to the platform-provided SHA or "unknown".
const getCommit = () => {
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch (e) {
    return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown';
  }
};

const commit = getCommit();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, options) => {
    const { dev, isServer } = options;

    // Output webpack stats JSON file only for client-side/production build
    if (!dev && !isServer) {
      config.plugins.push(
        new StatsWriterPlugin({
          filename: '../webpack-stats.json',
          stats: {
            assets: true,
            chunks: true,
            modules: true,
          },
        })
      );
    }

    return config;
  },
  env: {
    commit,
  },
};

module.exports = nextConfig;

// PM2 process config for running Munshi in production.
// Usage on the server:  pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'munshi',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

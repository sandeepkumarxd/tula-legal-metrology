module.exports = {
  apps: [
    {
      name: 'tula-server',
      cwd: __dirname,
      script: 'server.js',
      env: {
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    }
  ]
};

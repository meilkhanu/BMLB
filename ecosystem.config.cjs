module.exports = {
  apps: [{
    name: 'bmlb',
    script: 'dist/server/entry.mjs',
    env: {
      PORT: 4321,
      NODE_ENV: 'production',
    }
  }]
};

module.exports = {
  apps: [{
    name: 'bmlb',
    script: 'dist/server/entry.mjs',
    env: {
      R2_ACCESS_KEY: process.env.R2_ACCESS_KEY || '',
      R2_SECRET_KEY: process.env.R2_SECRET_KEY || '',
      CLOUDFLARE_ACCOUNT_ID: 'cd4393394949ae27ca79e9dfc0263f3c',
      PORT: 4321,
      NODE_ENV: 'production',
    }
  }]
};

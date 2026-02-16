module.exports = {
  apps: [
    {
      name: "buddy-server",
      cwd: "./server",
      script: "index.js",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

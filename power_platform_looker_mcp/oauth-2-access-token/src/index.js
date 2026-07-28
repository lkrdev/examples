import app from './app.js';
import { config, validateConfig } from './config.js';

validateConfig();

const PORT = config.port;
const HOST = config.host || '127.0.0.1';

const server = app.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(`Looker OAuth 2.0 Access Token Service active`);
  console.log(`Listening on http://${HOST}:${PORT}`);
  console.log(`OAuth Client ID: ${config.oauthClientId}`);
  console.log(`Self-Identity endpoint: http://${HOST}:${PORT}/oauth/identity`);
  console.log(`Token endpoint: http://${HOST}:${PORT}/oauth/token`);
  console.log(`====================================================`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[FATAL ERROR] Port ${PORT} is already in use by another process.`);
    console.error(`Run 'lsof -t -i:${PORT} | xargs -r kill -9' to free port ${PORT}.\n`);
    process.exit(1);
  } else {
    console.error('[Server Error]:', err);
  }
});

// Handle graceful shutdown
const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down server...`);
  server.close(() => {
    console.log('Server closed gracefully.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

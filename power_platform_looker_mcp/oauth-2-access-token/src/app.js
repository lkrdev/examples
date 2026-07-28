import express from 'express';
import identityRouter from './routes/identity.js';
import oauthRouter from './routes/oauth.js';
import { requestLogger } from './middleware/requestLogger.js';

const app = express();

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  next();
});

// Body parsers for OAuth POST requests (JSON and form-urlencoded)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log requests to log.jsonl
app.use(requestLogger);

// Register routes
app.use('/', identityRouter);
app.use('/', oauthRouter);

// Health / Status endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Looker OAuth 2.0 Access Token Proxy',
    endpoints: {
      identity: '/oauth/identity',
      well_known: '/.well-known/oauth-authorization-server',
      token: '/oauth/token',
    },
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    error_description: `Route ${req.method} ${req.path} not found`,
  });
});

// Global Error Handler
app.use((err, req, res, _next) => {
  console.error('[Unhandled Express Error]:', err);
  res.status(500).json({
    error: 'server_error',
    error_description: 'An unexpected internal server error occurred.',
  });
});

export { app };
export default app;

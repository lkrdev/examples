import fs from 'node:fs';
import path from 'node:path';

const LOG_FILE = path.resolve(process.cwd(), 'log.jsonl');

const SENSITIVE = /secret|password|token|auth|cookie|code/i;

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const res = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE.test(k)) {
      res[k] = typeof v === 'string' && v.startsWith('Bearer ') ? 'Bearer [REDACTED]' : '[REDACTED]';
    } else {
      res[k] = typeof v === 'object' && v !== null ? sanitize(v) : v;
    }
  }
  return res;
}

/**
 * Express middleware to capture and log HTTP requests to log.jsonl if ENABLE_FILE_LOGGING=true
 */
export function requestLogger(req, res, next) {
  if (process.env.ENABLE_FILE_LOGGING !== 'true') {
    return next();
  }

  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl || req.url,
      path: req.path,
      headers: sanitize(req.headers),
      query: sanitize(req.query),
      body: sanitize(req.body),
      statusCode: res.statusCode,
      durationMs: duration,
    };

    const line = JSON.stringify(logEntry) + '\n';
    fs.appendFile(LOG_FILE, line, (err) => {
      if (err) {
        console.error('[requestLogger] Error writing to log.jsonl:', err.message);
      }
    });
  });

  next();
}

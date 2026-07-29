if (typeof AbortSignal !== 'undefined' && !AbortSignal.timeout) {
  AbortSignal.timeout = (ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };
}

// Suppress upstream @looker/sdk-rtl bug logging false AbortSignal.timeout warning
const originalDebug = console.debug;
console.debug = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('AbortSignal.timeout is not defined')) {
    return;
  }
  originalDebug(...args);
};


export function validateConfig() {
  if (!process.env.OAUTH_CLIENT_SECRET) {
    throw new Error('Missing OAUTH_CLIENT_SECRET environment variable. Please run setup (npm run setup) or set OAUTH_CLIENT_SECRET in .env.');
  }
  if (!process.env.ALLOWED_REDIRECT_URIS) {
    throw new Error('Missing ALLOWED_REDIRECT_URIS environment variable. Please run setup (npm run setup) or set ALLOWED_REDIRECT_URIS in .env.');
  }
}

export const config = {
  get oauthClientId() { return process.env.OAUTH_CLIENT_ID || 'looker-oauth-client-id'; },
  set oauthClientId(val) { process.env.OAUTH_CLIENT_ID = val; },

  get oauthClientSecret() { return process.env.OAUTH_CLIENT_SECRET || 'looker-oauth-client-secret'; },
  set oauthClientSecret(val) { process.env.OAUTH_CLIENT_SECRET = val; },

  get oauthIssuerUrl() { return process.env.OAUTH_ISSUER_URL || process.env.PUBLIC_URL || ''; },
  set oauthIssuerUrl(val) { process.env.OAUTH_ISSUER_URL = val; },

  get allowedRedirectUris() {
    const raw = process.env.ALLOWED_REDIRECT_URIS || '';
    return raw.split(',').map((u) => u.trim().replace(/[\r\n"']/g, '')).filter(Boolean);
  },
  set allowedRedirectUris(val) {
    const arr = Array.isArray(val) ? val : String(val).split(',').map((u) => u.trim()).filter(Boolean);
    process.env.ALLOWED_REDIRECT_URIS = arr.join(',');
  },

  get lookerBaseUrl() { return process.env.LOOKERSDK_BASE_URL || 'https://mycompany.looker.com'; },
  set lookerBaseUrl(val) { process.env.LOOKERSDK_BASE_URL = val; },

  get lookerClientId() { return process.env.LOOKERSDK_CLIENT_ID || ''; },
  set lookerClientId(val) { process.env.LOOKERSDK_CLIENT_ID = val; },

  get lookerClientSecret() { return process.env.LOOKERSDK_CLIENT_SECRET || ''; },
  set lookerClientSecret(val) { process.env.LOOKERSDK_CLIENT_SECRET = val; },

  get port() { return parseInt(process.env.PORT || '3000', 10); },
  set port(val) { process.env.PORT = String(val); },

  get host() { return process.env.HOST || '127.0.0.1'; },
  set host(val) { process.env.HOST = val; },

  cacheSafetyBufferMs: 10000,
};


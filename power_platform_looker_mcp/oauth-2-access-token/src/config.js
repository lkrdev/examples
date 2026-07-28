if (!process.env.OAUTH_CLIENT_SECRET) {
  throw new Error('Missing OAUTH_CLIENT_SECRET environment variable. Please set OAUTH_CLIENT_SECRET in your .env file or environment.');
}

export const config = {
  get oauthClientId() { return process.env.OAUTH_CLIENT_ID || 'looker-oauth-client-id'; },
  set oauthClientId(val) { process.env.OAUTH_CLIENT_ID = val; },

  get oauthClientSecret() { return process.env.OAUTH_CLIENT_SECRET; },
  set oauthClientSecret(val) { process.env.OAUTH_CLIENT_SECRET = val; },

  get oauthIssuerUrl() { return process.env.OAUTH_ISSUER_URL || process.env.PUBLIC_URL || ''; },
  set oauthIssuerUrl(val) { process.env.OAUTH_ISSUER_URL = val; },

  get allowedRedirectUris() {
    if (!this._allowedRedirectUris) {
      this._allowedRedirectUris = (process.env.ALLOWED_REDIRECT_URIS || '').split(',').map((u) => u.trim()).filter(Boolean);
    }
    return this._allowedRedirectUris;
  },
  set allowedRedirectUris(val) {
    this._allowedRedirectUris = Array.isArray(val) ? val : String(val).split(',').map((u) => u.trim()).filter(Boolean);
  },

  get lookerBaseUrl() { return process.env.LOOKERSDK_BASE_URL || ''; },
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


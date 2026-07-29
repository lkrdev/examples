import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../src/app.js';
import { tokenManager } from '../src/tokenManager.js';
import { config } from '../src/config.js';

let server;
const PORT = 3099;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function makeRequest(path, options = {}, bodyData = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          // non-json response
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json || data });
      });
    });

    req.on('error', reject);

    if (bodyData) {
      if (typeof bodyData === 'object') {
        if (reqOptions.headers['Content-Type'] === 'application/x-www-form-urlencoded') {
          req.write(new URLSearchParams(bodyData).toString());
        } else {
          req.setHeader('Content-Type', 'application/json');
          req.write(JSON.stringify(bodyData));
        }
      } else {
        req.write(bodyData);
      }
    }

    req.end();
  });
}

describe('Looker OAuth 2.0 Access Token Proxy', () => {
  before((done) => {
    tokenManager.clearCache();
    server = app.listen(PORT, '127.0.0.1', done);
  });

  after((done) => {
    tokenManager.clearCache();
    server.close(done);
  });

  describe('Self-Identity & Metadata Endpoints', () => {
    it('GET /oauth/identity returns complete metadata', async () => {
      const res = await makeRequest('/oauth/identity');
      assert.equal(res.status, 200);
      assert.equal(res.body.client_id, config.oauthClientId);
      assert.equal(res.body.token_url, `${res.body.issuer}/oauth/token`);
      assert.equal(res.body.authorization_endpoint, `${res.body.issuer}/oauth/authorize`);
      assert.ok(Array.isArray(res.body.scopes_supported));
      assert.ok(res.body.scopes_supported.includes('api'));
      assert.ok(res.body.scopes_supported.includes('login_user'));
      assert.ok(!res.body.scopes_supported.includes('embed'));
      assert.ok(res.body.grant_types_supported.includes('authorization_code'));
      assert.ok(res.body.grant_types_supported.includes('urn:looker:login_user'));
    });

    it('GET /.well-known/oauth-authorization-server returns well-known metadata', async () => {
      const res = await makeRequest('/.well-known/oauth-authorization-server');
      assert.equal(res.status, 200);
      assert.equal(res.body.client_id, config.oauthClientId);
      assert.ok(res.body.token_url);
    });

    it('GET /oauth/identity respects custom OAUTH_ISSUER_URL when configured', async () => {
      const originalIssuer = config.oauthIssuerUrl;
      config.oauthIssuerUrl = 'https://auth.mycompany.com';
      try {
        const res = await makeRequest('/oauth/identity');
        assert.equal(res.status, 200);
        assert.equal(res.body.issuer, 'https://auth.mycompany.com');
        assert.equal(res.body.token_url, 'https://auth.mycompany.com/oauth/token');
      } finally {
        config.oauthIssuerUrl = originalIssuer;
      }
    });
  });

  describe('Client Secret Validation', () => {
    it('rejects token request if client_secret is missing or wrong', async () => {
      const res1 = await makeRequest(
        '/oauth/token',
        { method: 'POST' },
        { grant_type: 'urn:looker:login_user', user_id: '42', client_id: config.oauthClientId }
      );
      assert.equal(res1.status, 401);
      assert.equal(res1.body.error, 'invalid_client');

      const res2 = await makeRequest(
        '/oauth/token',
        { method: 'POST' },
        { grant_type: 'urn:looker:login_user', user_id: '42', client_id: config.oauthClientId, client_secret: 'invalid-secret' }
      );
      assert.equal(res2.status, 401);
      assert.equal(res2.body.error, 'invalid_client');
    });
  });

  describe('GET /oauth/authorize & PKCE Bridge Endpoints', () => {
    it('GET /oauth/authorize redirects to Looker OAuth sign-in screen when redirect_uri is authorized', async () => {
      const redirectTarget = 'http://localhost:8080/callback';
      config.allowedRedirectUris = [...config.allowedRedirectUris, redirectTarget];
      try {
        const res = await makeRequest(
          `/oauth/authorize?client_id=${config.oauthClientId}&redirect_uri=${encodeURIComponent(redirectTarget)}&response_type=code&state=teststate`
        );
        assert.equal(res.status, 302);
        assert.ok(res.headers.location);
        assert.ok(res.headers.location.includes('/auth'));
      } finally {
        config.allowedRedirectUris = config.allowedRedirectUris.filter((u) => u !== redirectTarget);
      }
    });

    it('GET /oauth/authorize accepts subpath redirect_uri and handles CRLF in ALLOWED_REDIRECT_URIS', async () => {
      const baseRedirect = 'https://global.consent.azure-apim.net/redirect';
      const subpathRedirect = 'https://global.consent.azure-apim.net/redirect/looker-5fmcp-5fand-5fai-5fagents-5fd627d5acf692-ea4b3387665a7f3c';
      const originalEnv = process.env.ALLOWED_REDIRECT_URIS;
      process.env.ALLOWED_REDIRECT_URIS = `${baseRedirect}\r\n`;

      try {
        const res = await makeRequest(
          `/oauth/authorize?client_id=${config.oauthClientId}&redirect_uri=${encodeURIComponent(subpathRedirect)}`
        );
        assert.equal(res.status, 302);
        assert.ok(res.headers.location);
      } finally {
        process.env.ALLOWED_REDIRECT_URIS = originalEnv;
      }
    });

    it('GET /oauth/authorize rejects unauthorized redirect_uri', async () => {
      const res = await makeRequest(
        `/oauth/authorize?client_id=${config.oauthClientId}&redirect_uri=https://unauthorized.com/callback`
      );
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'invalid_request');
    });

    it('GET /oauth/authorize rejects path traversal redirect_uri attempts', async () => {
      const baseRedirect = 'https://global.consent.azure-apim.net/redirect/allowed-app';
      const traversalRedirect = 'https://global.consent.azure-apim.net/redirect/allowed-app/../attacker-app';
      config.allowedRedirectUris = [baseRedirect];
      try {
        const res = await makeRequest(
          `/oauth/authorize?client_id=${config.oauthClientId}&redirect_uri=${encodeURIComponent(traversalRedirect)}&response_type=code`
        );
        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'invalid_request');
      } finally {
        config.allowedRedirectUris = [];
      }
    });

    it('GET /oauth/authorize errors with 500 when ALLOWED_REDIRECT_URIS is missing', async () => {
      const originalEnv = process.env.ALLOWED_REDIRECT_URIS;
      delete process.env.ALLOWED_REDIRECT_URIS;
      try {
        const res = await makeRequest(
          `/oauth/authorize?client_id=${config.oauthClientId}&redirect_uri=https://example.com/callback`
        );
        assert.equal(res.status, 500);
        assert.equal(res.body.error, 'server_error');
      } finally {
        process.env.ALLOWED_REDIRECT_URIS = originalEnv;
      }
    });
  });

  describe('Standard OAuth 2.0 Token Grant Endpoint', () => {
    it('POST /oauth/token rejects client_credentials grant type and disables admin tokens', async () => {
      const res = await makeRequest(
        '/oauth/token',
        { method: 'POST' },
        {
          grant_type: 'client_credentials',
          client_id: config.oauthClientId,
          client_secret: config.oauthClientSecret,
        }
      );

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'unsupported_grant_type');
    });

    it('POST /oauth/token fetches user token via login_user on demand', async () => {
      const userId = '42';

      const res = await makeRequest(
        '/oauth/token',
        { method: 'POST' },
        {
          grant_type: 'urn:looker:login_user',
          client_id: config.oauthClientId,
          client_secret: config.oauthClientSecret,
          user_id: userId,
        }
      );

      assert.equal(res.status, 200);
      assert.ok(res.body.access_token);
      assert.equal(res.body.user_id, userId);
    });

    it('POST /oauth/token with refresh_token issues fresh user token when user_id is provided', async () => {
      const res = await makeRequest(
        '/oauth/token',
        { method: 'POST' },
        { grant_type: 'refresh_token', client_id: config.oauthClientId, client_secret: config.oauthClientSecret, user_id: '42' }
      );

      assert.equal(res.status, 200);
      assert.ok(res.body.access_token);
    });

    it('POST /oauth/token with email resolves user token by email', async () => {
      const userEmail = 'user@example.com';
      const res = await makeRequest(
        '/oauth/token',
        { method: 'POST' },
        {
          grant_type: 'urn:looker:login_user',
          client_id: config.oauthClientId,
          client_secret: config.oauthClientSecret,
          email: userEmail,
        }
      );

      assert.equal(res.status, 200);
      assert.ok(res.body.access_token);
      assert.ok(res.body.user_id);
    });
  });

  describe('Token Revocation Endpoint', () => {
    it('POST /oauth/revoke returns 501 Not Implemented', async () => {
      const res = await makeRequest('/oauth/revoke', { method: 'POST' });
      assert.equal(res.status, 501);
      assert.equal(res.body.error, 'not_implemented');
    });
  });
});

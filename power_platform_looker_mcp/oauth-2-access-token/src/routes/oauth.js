import { Router } from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { tokenManager } from '../tokenManager.js';

const router = Router();


/**
 * AES-256-GCM Encryption Helper using client_secret
 */
function encryptPayload(payload) {
  const secret = config.oauthClientSecret;
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * AES-256-GCM Decryption Helper using client_secret
 */
function decryptPayload(code) {
  try {
    if (!code || typeof code !== 'string') return null;
    const parts = code.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, authTagHex, encryptedHex] = parts;
    const secret = config.oauthClientSecret;
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('[Decrypt Error]:', err.message);
    return null;
  }
}

/**
 * Generates a PKCE code_verifier and code_challenge pair
 */
function generatePkcePair() {
  const verifier = crypto.randomBytes(32).toString('hex');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return { verifier, challenge };
}

/**
 * Extracts and validates client_id and client_secret from request
 */
function validateClientCredentials(req) {
  let clientId = req.body?.client_id || req.query?.client_id;
  let clientSecret = req.body?.client_secret || req.query?.client_secret;

  // Check HTTP Basic Auth header if present
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString('utf-8');
      const [id, secret] = credentials.split(':');
      clientId = id || clientId;
      clientSecret = secret || clientSecret;
    } catch {
      // Ignore parse failure, fall back to body/query
    }
  }

  // Enforce configured client_id check
  if (clientId && clientId !== config.oauthClientId) {
    return { valid: false, error: 'invalid_client', message: 'Client ID mismatch' };
  }

  // Require clientSecret match strictly using timing-safe comparison
  const isSecretValid = (() => {
    if (!clientSecret || typeof clientSecret !== 'string') return false;
    const aBuf = crypto.createHash('sha256').update(clientSecret).digest();
    const bBuf = crypto.createHash('sha256').update(config.oauthClientSecret).digest();
    return crypto.timingSafeEqual(aBuf, bBuf);
  })();

  if (!isSecretValid) {
    return { valid: false, error: 'invalid_client', message: 'Invalid or missing client_secret' };
  }

  return { valid: true, clientId: clientId || config.oauthClientId };
}

/**
 * Validates redirect_uri against ALLOWED_REDIRECT_URIS environment variable
 */
function isRedirectUriAllowed(redirectUri) {
  if (!config.allowedRedirectUris || config.allowedRedirectUris.length === 0) {
    return false;
  }
  if (!redirectUri) return false;

  return config.allowedRedirectUris.some((allowed) => {
    const cleanAllowed = allowed.trim().replace(/[\r\n"']/g, '').replace(/\/+$/, '');
    const cleanRedirect = redirectUri.trim().replace(/[\r\n"']/g, '').replace(/\/+$/, '');
    if (cleanRedirect === cleanAllowed) return true;
    return cleanRedirect.startsWith(cleanAllowed + '/') || cleanRedirect.startsWith(cleanAllowed + '?');
  });
}

/**
 * STEP 1 & STEP 3: GET /oauth/authorize
 * - Handles initial request from Power Automate (redirects to Looker /auth)
 * - Handles callback redirect from Looker (/oauth/authorize?code=...&state=...)
 */
router.get('/oauth/authorize', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const lookerCode = req.query?.code;
  const internalState = req.query?.state || '';

  // STEP 3: Handle Looker Callback whenever lookerCode is present
  if (lookerCode) {
    const stateData = decryptPayload(internalState) || {};

    const { codeVerifier, clientRedirectUri, clientState, callbackUrl: storedCallbackUrl } = stateData;

    let baseUrl = config.oauthIssuerUrl;
    if (!baseUrl) {
      const protocol = req.protocol || 'http';
      const host = req.get('host') || `${config.host}:${config.port}`;
      baseUrl = `${protocol}://${host}`;
    }
    baseUrl = baseUrl.replace(/\/+$/, '');
    const callbackUrl = storedCallbackUrl || `${baseUrl}/oauth/authorize`;
    const lookerAuthBaseUrl = config.lookerBaseUrl ? config.lookerBaseUrl.replace(/\/+$/, '') : '';

    let lookerUserId = null;
    let lastErrorDetail = '';

    if (lookerAuthBaseUrl) {
      const apiTokenUrl = `${lookerAuthBaseUrl}/api/token`;
      const tokenPayload = {
        grant_type: 'authorization_code',
        client_id: config.oauthClientId,
        redirect_uri: callbackUrl,
        code: lookerCode,
        code_verifier: codeVerifier || '',
      };

      try {
        const tokenRes = await fetch(apiTokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            'x-looker-appid': 'Looker OAuth Proxy',
            'Accept': 'application/json',
          },
          body: JSON.stringify(tokenPayload),
        });

        const tokenText = await tokenRes.text();
        console.log(`[Looker /api/token Status ${tokenRes.status}]:`, tokenText);

        let tokenJson = null;
        try { tokenJson = JSON.parse(tokenText); } catch {}

        if (tokenRes.ok && tokenJson && tokenJson.access_token) {
          const userAccessToken = tokenJson.access_token;

          // STEP 5: Fetch user ID using returned access token
          const userRes = await fetch(`${lookerAuthBaseUrl}/api/4.0/user?fields=id`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${userAccessToken}`,
              'Accept': 'application/json',
            },
          });

          const userText = await userRes.text();
          console.log(`[Looker GET /api/4.0/user Status ${userRes.status}]:`, userText);

          if (userRes.ok) {
            const userData = JSON.parse(userText);
            if (userData && userData.id) {
              lookerUserId = String(userData.id);
            }
          } else {
            lastErrorDetail = `Failed to get user profile (${userRes.status}): ${userText}`;
          }
        } else {
          lastErrorDetail = `Looker /api/token failed (${tokenRes.status}): ${tokenText}`;
        }
      } catch (err) {
        console.error('[Looker OAuth Redeem Error]:', err.message);
        lastErrorDetail = err.message;
      }
    }

    if (!lookerUserId) {
      return res.status(400).json({
        error: 'oauth_failed',
        error_description: 'Failed to resolve Looker user ID from OAuth authentication.',
        details: lastErrorDetail || undefined,
      });
    }

    const serverCode = encryptPayload({
      looker_user_id: String(lookerUserId),
      createdAt: Date.now(),
    });

    const targetRedirectUri = clientRedirectUri || (config.allowedRedirectUris && config.allowedRedirectUris[0]);

    if (targetRedirectUri) {
      const redirectUrl = new URL(targetRedirectUri);
      redirectUrl.searchParams.append('code', serverCode);
      if (clientState) redirectUrl.searchParams.append('state', clientState);
      return res.redirect(redirectUrl.toString());
    }

    return res.json({
      code: serverCode,
      looker_user_id: String(lookerUserId),
    });
  }

  // STEP 1: Handle initial request from Power Automate
  const clientId = req.query?.client_id;
  if (clientId && clientId !== config.oauthClientId) {
    return res.status(401).json({
      error: 'invalid_client',
      error_description: 'Client ID mismatch',
    });
  }

  if (!config.allowedRedirectUris || config.allowedRedirectUris.length === 0) {
    return res.status(500).json({
      error: 'server_error',
      error_description: 'ALLOWED_REDIRECT_URIS environment variable is not configured on the server.',
    });
  }

  const redirectUri = req.query?.redirect_uri;
  if (redirectUri && !isRedirectUriAllowed(redirectUri)) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: `redirect_uri '${redirectUri}' is not authorized in ALLOWED_REDIRECT_URIS.`,
    });
  }

  const clientState = req.query?.state || '';

  let baseUrl = config.oauthIssuerUrl;
  if (!baseUrl) {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `${config.host}:${config.port}`;
    baseUrl = `${protocol}://${host}`;
  }
  baseUrl = baseUrl.replace(/\/+$/, '');

  const lookerAuthBaseUrl = config.lookerBaseUrl ? config.lookerBaseUrl.replace(/\/+$/, '') : '';
  if (!lookerAuthBaseUrl) {
    return res.status(500).json({
      error: 'server_error',
      error_description: 'LOOKERSDK_BASE_URL is not configured on the server.',
    });
  }

  const { verifier, challenge } = generatePkcePair();
  const callbackUrl = `${baseUrl}/oauth/authorize`;
  const newState = encryptPayload({
    clientRedirectUri: redirectUri,
    clientState,
    codeVerifier: verifier,
    callbackUrl,
    createdAt: Date.now(),
  });



  // Redirect to Looker Native OAuth UI (/auth)
  const lookerAuthorizeUrl = new URL('/auth', lookerAuthBaseUrl);
  lookerAuthorizeUrl.searchParams.append('response_type', 'code');
  lookerAuthorizeUrl.searchParams.append('client_id', config.oauthClientId);
  lookerAuthorizeUrl.searchParams.append('redirect_uri', callbackUrl);
  lookerAuthorizeUrl.searchParams.append('scope', 'cors_api');
  lookerAuthorizeUrl.searchParams.append('state', newState);
  lookerAuthorizeUrl.searchParams.append('code_challenge_method', 'S256');
  lookerAuthorizeUrl.searchParams.append('code_challenge', challenge);

  return res.redirect(lookerAuthorizeUrl.toString());
});

/**
 * STEP 6 (cont): Power Automate calls POST /oauth/token to exchange server code for token
 * Decrypts payload using client_secret, extracts looker_user_id, and returns user token.
 * NOTE: Admin tokens are NEVER returned from this endpoint.
 */
router.post('/oauth/token', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');

  const clientAuth = validateClientCredentials(req);
  if (!clientAuth.valid) {
    return res.status(401).json({
      error: clientAuth.error,
      error_description: clientAuth.message,
    });
  }

  const grantType = req.body?.grant_type || req.query?.grant_type || 'authorization_code';
  const forceRefresh = req.body?.force_refresh === true || req.body?.force_refresh === 'true';

  try {
    if (grantType === 'client_credentials') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'client_credentials grant type is disabled. Admin tokens are not issued via this proxy.',
      });
    }

    if (grantType === 'authorization_code') {
      const code = req.body?.code || req.query?.code;
      let lookerUserId = null;

      if (code) {
        const decrypted = decryptPayload(code);
        if (decrypted) {
          const codeAgeMs = Date.now() - (decrypted.createdAt || 0);
          if (codeAgeMs < 10 * 60 * 1000) {
            lookerUserId = decrypted.looker_user_id;
          }
        }
      }

      if (!lookerUserId) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid or expired authorization code. Missing or unreadable encrypted looker_user_id.',
        });
      }

      const tokenResult = await tokenManager.getUserToken(lookerUserId, forceRefresh);

      return res.json({
        access_token: tokenResult.accessToken,
        token_type: tokenResult.tokenType || 'Bearer',
        expires_in: tokenResult.expiresIn,
        refresh_token: encryptPayload({ looker_user_id: String(lookerUserId), createdAt: Date.now() }),
        scope: tokenResult.scope || 'user_api',
        looker_user_id: String(lookerUserId),
      });
    }

    if (grantType === 'urn:looker:login_user' || grantType === 'login_user' || grantType === 'user_credentials') {
      const userId = req.body?.user_id || req.body?.sudo_user_id || req.query?.user_id;
      const email = req.body?.email || req.body?.user_email || req.query?.email;

      if (!userId && !email) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'user_id or email is required for login_user grant type',
        });
      }

      let tokenResult;
      if (email) {
        tokenResult = await tokenManager.getUserTokenByEmail(email, forceRefresh);
      } else {
        tokenResult = await tokenManager.getUserToken(userId, forceRefresh);
      }

      return res.json({
        access_token: tokenResult.accessToken,
        token_type: tokenResult.tokenType || 'Bearer',
        expires_in: tokenResult.expiresIn,
        scope: tokenResult.scope || 'user_api',
        user_id: String(tokenResult.userId || userId || email),
        looker_user_id: String(tokenResult.userId || userId || email),
      });
    }

    if (grantType === 'refresh_token') {
      const refreshToken = req.body?.refresh_token || req.query?.refresh_token;
      let lookerUserId = req.body?.user_id || req.query?.user_id;

      if (refreshToken && !lookerUserId) {
        const decrypted = decryptPayload(refreshToken);
        if (decrypted) {
          lookerUserId = decrypted.looker_user_id;
        }
      }

      if (!lookerUserId) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid or missing refresh_token or user_id',
        });
      }

      const tokenResult = await tokenManager.getUserToken(lookerUserId, true);

      return res.json({
        access_token: tokenResult.accessToken,
        token_type: tokenResult.tokenType || 'Bearer',
        expires_in: tokenResult.expiresIn,
        refresh_token: refreshToken || encryptPayload({ looker_user_id: String(lookerUserId), createdAt: Date.now() }),
        scope: tokenResult.scope || 'user_api',
        looker_user_id: String(lookerUserId),
      });
    }

    return res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: `Grant type '${grantType}' is not supported. Supported: authorization_code, urn:looker:login_user, refresh_token.`,
    });
  } catch (err) {
    console.error('[OAuth Route Error]:', err.message);
    return res.status(500).json({
      error: 'server_error',
      error_description: err.message || 'An error occurred processing the token request',
    });
  }
});

/**
 * Standard OAuth 2.0 Token Revocation Endpoint (RFC 7009)
 * Returns HTTP 501 Not Implemented.
 */
router.all('/oauth/revoke', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(501).json({
    error: 'not_implemented',
    error_description: 'Token revocation is not implemented for this Looker OAuth token proxy.',
  });
});

export default router;

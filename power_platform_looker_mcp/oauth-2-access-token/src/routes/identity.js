import { Router } from 'express';
import { config } from '../config.js';

const router = Router();

/**
 * Builds standard OAuth 2.0 / OpenID Connect metadata
 */
function getMetadata(req) {
  let baseUrl = config.oauthIssuerUrl;
  if (!baseUrl) {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `${config.host}:${config.port}`;
    baseUrl = `${protocol}://${host}`;
  }
  baseUrl = baseUrl.replace(/\/+$/, '');

  const tokenUrl = `${baseUrl}/oauth/token`;
  const authorizeUrl = `${baseUrl}/oauth/authorize`;
  const revocationUrl = `${baseUrl}/oauth/revoke`;

  return {
    issuer: baseUrl,
    token_endpoint: tokenUrl,
    token_url: tokenUrl,
    authorization_endpoint: authorizeUrl,
    authorization_url: authorizeUrl,
    refresh_url: tokenUrl,
    revocation_endpoint: revocationUrl,
    revocation_url: revocationUrl,
    client_id: config.oauthClientId,
    scopes_supported: ['user_info', 'api', 'login_user'],
    grant_types_supported: [
      'authorization_code',
      'urn:looker:login_user',
      'refresh_token',
    ],
    response_types_supported: ['token', 'code'],
    token_endpoint_auth_methods_supported: [
      'client_secret_post',
      'client_secret_basic',
    ],
  };
}

router.get([
  '/oauth/identity',
  '/identity',
  '/.well-known/oauth-authorization-server',
  '/.well-known/openid-configuration',
], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(getMetadata(req));
});

export default router;

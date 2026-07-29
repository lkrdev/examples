import '../src/config.js';
import { LookerNodeSDK } from '@looker/sdk-node';
import { fileURLToPath } from 'url';

/**
 * Registers or updates an OAuth Client Application in Looker.
 * Try updating first, then falls back to creating if update fails.
 */
export async function registerOrUpdateOAuthClient({ clientId, issuerUrl, displayName }) {
  const cleanIssuerUrl = (issuerUrl || '').trim().replace(/\/+$/, '');
  if (!clientId) throw new Error('Missing OAuth Client ID');
  if (!cleanIssuerUrl) throw new Error('Missing OAuth Issuer URL');

  const redirectUri = `${cleanIssuerUrl}/oauth/authorize`;
  const appDisplayName = displayName || 'Looker OAuth Access Token Proxy';

  const sdk = LookerNodeSDK.init40();
  const body = {
    redirect_uri: redirectUri,
    display_name: appDisplayName,
    enabled: true,
  };

  try {
    const updated = await sdk.ok(sdk.update_oauth_client_app(clientId, body));
    return { action: 'updated', client: updated };
  } catch (updateErr) {
    const created = await sdk.ok(sdk.register_oauth_client_app(clientId, body));
    return { action: 'registered', client: created };
  }
}

async function main() {
  const clientId = process.env.OAUTH_CLIENT_ID || 'looker-oauth-client-id';
  const issuerUrl = process.env.OAUTH_ISSUER_URL;
  const displayName = process.env.OAUTH_CLIENT_DISPLAY_NAME || 'Looker OAuth Access Token Proxy';

  console.log('====================================================');
  console.log('Looker OAuth Client Registration');
  console.log('====================================================');

  if (!clientId || !issuerUrl) {
    console.error('ERROR: OAUTH_CLIENT_ID and OAUTH_ISSUER_URL must be configured.');
    process.exit(1);
  }

  try {
    const result = await registerOrUpdateOAuthClient({ clientId, issuerUrl, displayName });
    console.log(`Successfully ${result.action} OAuth Client App:`);
    console.log(`  Client ID    : ${result.client.client_guid}`);
    console.log(`  Display Name : ${result.client.display_name}`);
    console.log(`  Redirect URI : ${result.client.redirect_uri}`);
    console.log(`  Enabled      : ${result.client.enabled}`);
    console.log('====================================================');
  } catch (err) {
    console.error('ERROR: Failed to register or update OAuth Client App in Looker:');
    console.error(err.message || err);
    process.exit(1);
  }
}

// Check if run directly from CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

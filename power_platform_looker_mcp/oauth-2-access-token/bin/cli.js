#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { LookerNodeSDK } from '@looker/sdk-node';
import { registerOrUpdateOAuthClient } from '../scripts/register_oauth_client.js';

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


// ANSI Color Helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  bgBlue: '\x1b[44m',
  white: '\x1b[37m',
};

function banner() {
  console.clear();
  console.log(`${colors.cyan}${colors.bright}========================================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}            LOOKER OAUTH 2.0 PROXY SETUP & MANAGEMENT TUI               ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}========================================================================${colors.reset}`);
}

/**
 * Loads current .env key-value pairs into an object
 */
function readEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        env[key] = val;
      }
    }
  }
  return env;
}

/**
 * Writes updated key-value pairs to .env, backing up existing file to .env.bak
 */
function saveEnv(newEnv) {
  const envPath = path.resolve(process.cwd(), '.env');
  const bakPath = path.resolve(process.cwd(), '.env.bak');

  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, bakPath);
  }

  const current = readEnv();
  const merged = { ...current, ...newEnv };

  const lines = [
    '# Looker SDK Settings',
    `LOOKERSDK_BASE_URL=${merged.LOOKERSDK_BASE_URL || ''}`,
    `LOOKERSDK_CLIENT_ID=${merged.LOOKERSDK_CLIENT_ID || ''}`,
    `LOOKERSDK_CLIENT_SECRET=${merged.LOOKERSDK_CLIENT_SECRET || ''}`,
    '',
    '# OAuth 2.0 Server Configuration',
    `OAUTH_CLIENT_ID=${merged.OAUTH_CLIENT_ID || 'looker-oauth-client-id'}`,
    `OAUTH_CLIENT_SECRET=${merged.OAUTH_CLIENT_SECRET || ''}`,
    `OAUTH_ISSUER_URL=${merged.OAUTH_ISSUER_URL || ''}`,
    `ALLOWED_REDIRECT_URIS=${merged.ALLOWED_REDIRECT_URIS || ''}`,
    '',
    '# Server Settings',
    `PORT=${merged.PORT || '3000'}`,
    `HOST=${merged.HOST || '127.0.0.1'}`,
    '',
  ];

  fs.writeFileSync(envPath, lines.join('\n'), 'utf-8');
  // Update process.env as well
  for (const [k, v] of Object.entries(merged)) {
    process.env[k] = v;
  }
}

/**
 * Validates Looker API credentials by calling sdk.me()
 */
async function testLookerSdkCredentials(baseUrl, clientId, clientSecret) {
  process.env.LOOKERSDK_BASE_URL = baseUrl;
  process.env.LOOKERSDK_CLIENT_ID = clientId;
  process.env.LOOKERSDK_CLIENT_SECRET = clientSecret;

  try {
    const sdk = LookerNodeSDK.init40();
    const me = await sdk.ok(sdk.me());
    return { ok: true, me };
  } catch (err) {
    return { ok: false, error: err.message || err };
  }
}

/**
 * Tests if the public issuer / Cloudflare tunnel URL is reachable
 */
async function testTunnelConnection(issuerUrl) {
  const cleanUrl = issuerUrl.replace(/\/+$/, '');
  const testTarget = `${cleanUrl}/.well-known/oauth-authorization-server`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(testTarget, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeoutId);

    if (res) {
      if (res.ok) {
        return { ok: true, state: 'healthy', status: res.status, message: 'Tunnel & local server are both healthy and responding!' };
      }
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        return { ok: false, state: 'tunnel_only', status: res.status, message: 'Cloudflare Tunnel is connected, but local proxy server is not running. (Run npm start)' };
      }
      return { ok: true, state: 'reachable', status: res.status, message: `Reachable (HTTP ${res.status})` };
    }
    return { ok: false, state: 'unreachable', message: 'No response received from tunnel URL.' };
  } catch (err) {
    return { ok: false, state: 'error', message: err.message || 'Connection failed' };
  }
}

/**
 * Interactive helper to ask questions with default values
 */
async function promptInput(rl, questionText, defaultValue = '') {
  const promptStr = defaultValue
    ? `${colors.bright}${questionText}${colors.reset} ${colors.dim}(default: ${defaultValue})${colors.reset}: `
    : `${colors.bright}${questionText}${colors.reset}: `;

  try {
    const answer = await rl.question(promptStr);
    return answer.trim() || defaultValue;
  } catch (err) {
    if (err && (err.code === 'ERR_USE_AFTER_CLOSE' || err.message?.includes('closed'))) {
      return defaultValue;
    }
    throw err;
  }
}

/**
 * Interactive helper to view current Proxy OAuth Client Secret and option to generate a new key
 */
async function configureOAuthClientSecret(rl, currentSecret) {
  if (currentSecret) {
    console.log(`\n  Current Proxy OAuth Client Secret : ${colors.yellow}${currentSecret}${colors.reset}`);
    console.log(`  Options:`);
    console.log(`    ${colors.cyan}[1]${colors.reset} Keep current secret`);
    console.log(`    ${colors.cyan}[2]${colors.reset} Generate a new 64-character secret key`);
    console.log(`    ${colors.cyan}[3]${colors.reset} Enter a custom secret key`);

    const opt = await promptInput(rl, 'Choice (1-3)', '1');
    if (opt === '2') {
      const generated = crypto.randomBytes(32).toString('hex');
      console.log(`\n  ${colors.green}✓ Generated new 64-character secret key:${colors.reset} ${colors.bright}${generated}${colors.reset}`);
      return generated;
    }
    if (opt === '3') {
      const custom = await promptInput(rl, 'Enter Custom Secret Key', '');
      return custom || currentSecret;
    }
    return currentSecret;
  }

  const generated = crypto.randomBytes(32).toString('hex');
  console.log(`\n  No Proxy OAuth Client Secret currently set.`);
  console.log(`  ${colors.green}✓ Auto-generated new 64-character secret key:${colors.reset} ${colors.bright}${generated}${colors.reset}`);
  const customOrDefault = await promptInput(rl, 'Press Enter to accept, or type a custom secret key', generated);
  return customOrDefault;
}

/**
 * Main Setup Wizard (New Mode)
 */
async function runNewSetupWizard(rl) {
  banner();
  console.log(`\n${colors.yellow}${colors.bright}--- MODE: NEW SETUP WIZARD ---${colors.reset}\n`);
  console.log('This wizard will guide you through setting up your Looker OAuth Proxy.\n');

  const currentEnv = readEnv();

  // STEP 1: Looker SDK Credentials
  console.log(`${colors.cyan}${colors.bright}[STEP 1/5] Configure Looker API Credentials${colors.reset}`);
  let baseUrl = await promptInput(rl, 'Looker Base URL (e.g. https://yourinstance.cloud.looker.com)', currentEnv.LOOKERSDK_BASE_URL || '');
  baseUrl = baseUrl.replace(/\/+$/, '');

  let sdkClientId = await promptInput(rl, 'Looker API Client ID', currentEnv.LOOKERSDK_CLIENT_ID || '');
  let sdkClientSecret = await promptInput(rl, 'Looker API Client Secret', currentEnv.LOOKERSDK_CLIENT_SECRET || '');

  console.log(`\n${colors.dim}Testing Looker API credentials...${colors.reset}`);
  let testRes = await testLookerSdkCredentials(baseUrl, sdkClientId, sdkClientSecret);

  while (!testRes.ok) {
    console.log(`\n${colors.red}❌ Looker API Connection Failed:${colors.reset} ${testRes.error}`);
    const retry = await promptInput(rl, 'Would you like to re-enter Looker API credentials? (Y/n)', 'Y');
    if (retry.toLowerCase().startsWith('n')) {
      console.log(`${colors.yellow}Proceeding with entered credentials without verification.${colors.reset}`);
      break;
    }
    baseUrl = (await promptInput(rl, 'Looker Base URL', baseUrl)).replace(/\/+$/, '');
    sdkClientId = await promptInput(rl, 'Looker API Client ID', sdkClientId);
    sdkClientSecret = await promptInput(rl, 'Looker API Client Secret', sdkClientSecret);
    testRes = await testLookerSdkCredentials(baseUrl, sdkClientId, sdkClientSecret);
  }

  if (testRes.ok) {
    console.log(`${colors.green}✓ Looker API Connection Verified!${colors.reset} Authenticated user ID: ${testRes.me.id} (${testRes.me.email || 'Admin'})\n`);
  }

  saveEnv({
    LOOKERSDK_BASE_URL: baseUrl,
    LOOKERSDK_CLIENT_ID: sdkClientId,
    LOOKERSDK_CLIENT_SECRET: sdkClientSecret,
  });

  // STEP 2: OAuth Client Credentials
  console.log(`${colors.cyan}${colors.bright}[STEP 2/5] Configure Proxy OAuth Client Credentials${colors.reset}`);
  const oauthClientId = await promptInput(rl, 'Proxy OAuth Client ID', currentEnv.OAUTH_CLIENT_ID || 'looker-oauth-client-id');
  const oauthClientSecret = await configureOAuthClientSecret(rl, currentEnv.OAUTH_CLIENT_SECRET);

  saveEnv({
    OAUTH_CLIENT_ID: oauthClientId,
    OAUTH_CLIENT_SECRET: oauthClientSecret,
  });
  console.log(`${colors.green}✓ Proxy OAuth Client credentials configured.${colors.reset}\n`);

  // STEP 3: Cloudflare Tunnel & Public Issuer URL
  console.log(`${colors.cyan}${colors.bright}[STEP 3/5] Configure Public Issuer / Cloudflare Tunnel URL${colors.reset}`);
  console.log(`${colors.dim}Note: Ensure your Cloudflare tunnel is running (e.g. 'cloudflared tunnel --ha-connections 4 --url http://127.0.0.1:3000')${colors.reset}`);

  let issuerUrl = await promptInput(rl, 'Public Issuer URL (e.g. https://xxx.trycloudflare.com)', currentEnv.OAUTH_ISSUER_URL || '');
  while (!issuerUrl || !issuerUrl.startsWith('http')) {
    console.log(`${colors.red}Please enter a valid HTTP/HTTPS URL.${colors.reset}`);
    issuerUrl = await promptInput(rl, 'Public Issuer URL', currentEnv.OAUTH_ISSUER_URL || '');
  }
  issuerUrl = issuerUrl.replace(/\/+$/, '');

  console.log(`${colors.dim}Testing Cloudflare tunnel reachability...${colors.reset}`);
  const tunnelCheck = await testTunnelConnection(issuerUrl);
  if (tunnelCheck.ok) {
    console.log(`${colors.green}✓ ${tunnelCheck.message}${colors.reset}\n`);
  } else if (tunnelCheck.state === 'tunnel_only') {
    console.log(`${colors.yellow}⚠️ ${tunnelCheck.message}${colors.reset}\n`);
  } else {
    console.log(`${colors.yellow}⚠️ Tunnel Connection Notice:${colors.reset} ${tunnelCheck.message}`);
    console.log(`${colors.dim}Make sure 'cloudflared tunnel --ha-connections 4 --url http://127.0.0.1:3000' is running in your terminal.${colors.reset}\n`);
  }

  saveEnv({ OAUTH_ISSUER_URL: issuerUrl });
  console.log(`${colors.green}✓ Public Issuer URL set to: ${issuerUrl}${colors.reset}\n`);

  // STEP 4: Register / Update Looker OAuth Client
  console.log(`${colors.cyan}${colors.bright}[STEP 4/5] Register OAuth Client App in Looker${colors.reset}`);
  console.log(`${colors.dim}Registering redirect URI '${issuerUrl}/oauth/authorize' in Looker...${colors.reset}`);

  try {
    const regRes = await registerOrUpdateOAuthClient({
      clientId: oauthClientId,
      issuerUrl: issuerUrl,
      displayName: 'Looker OAuth Access Token Proxy',
    });
    console.log(`${colors.green}✓ Successfully ${regRes.action} OAuth Client '${oauthClientId}' in Looker!${colors.reset}\n`);
  } catch (err) {
    console.log(`${colors.red}❌ Failed to register OAuth Client in Looker:${colors.reset} ${err.message}`);
    console.log(`${colors.yellow}You can re-try registration later from the Update menu.${colors.reset}\n`);
  }

  // STEP 5: Custom Connector Details & Allowed Redirect URIs
  console.log(`${colors.cyan}${colors.bright}[STEP 5/5] Custom Connector / Power Automate Setup${colors.reset}`);
  console.log(`${colors.bright}Please enter these details in your Power Automate / Azure APIM / Custom Connector:${colors.reset}`);
  console.log(`${colors.yellow}┌──────────────────────────────────────────────────────────────────────────┐`);
  console.log(`│ ${colors.bright}CUSTOM CONNECTOR OAUTH 2.0 SETTINGS${colors.reset}${colors.yellow}                                      │`);
  console.log(`├──────────────────────────────────────────────────────────────────────────┤`);
  console.log(`│ Identity Provider     : Custom / OAuth 2.0                               │`);
  console.log(`│ Authorization URL     : ${issuerUrl}/oauth/authorize`);
  console.log(`│ Token URL             : ${issuerUrl}/oauth/token`);
  console.log(`│ Refresh URL           : ${issuerUrl}/oauth/token`);
  console.log(`│ Client ID             : ${oauthClientId}`);
  console.log(`│ Client Secret         : ${oauthClientSecret}`);
  console.log(`│ Scope                 : user_info api (or user_api)                       │`);
  console.log(`└──────────────────────────────────────────────────────────────────────────┘${colors.reset}\n`);

  console.log(`${colors.dim}When you save the Custom Connector in Power Automate, it will display a generated Redirect URI.${colors.reset}`);
  const redirectUrisInput = await promptInput(
    rl,
    'Allowed Redirect URIs (comma-separated)',
    currentEnv.ALLOWED_REDIRECT_URIS || ''
  );

  saveEnv({ ALLOWED_REDIRECT_URIS: redirectUrisInput });

  console.log(`\n${colors.green}${colors.bright}========================================================================${colors.reset}`);
  console.log(`${colors.green}${colors.bright}       🎉 NEW SETUP COMPLETE! ALL CONFIGURATIONS SAVED TO .env          ${colors.reset}`);
  console.log(`${colors.green}${colors.bright}========================================================================${colors.reset}\n`);

  console.log(`${colors.cyan}${colors.bright}🚀 STATUS & NEXT STEPS:${colors.reset}`);
  const finalCheck = await testTunnelConnection(issuerUrl);
  if (finalCheck.ok) {
    console.log(`  ${colors.green}✓ Both Proxy Server and Cloudflare Tunnel are actively running and healthy!${colors.reset}`);
    console.log(`  👉 Next step: Test creating an OAuth connection in Power Automate / Azure APIM.\n`);
  } else if (finalCheck.state === 'tunnel_only') {
    console.log(`  ${colors.yellow}✓ Cloudflare Tunnel is active!${colors.reset}`);
    console.log(`  👉 Next step: Start your local proxy server by running: ${colors.bright}${colors.yellow}npm start${colors.reset}\n`);
  } else {
    console.log(`  👉 Next steps:`);
    console.log(`     1. Start proxy server: ${colors.bright}${colors.yellow}npm start${colors.reset}`);
    console.log(`     2. Start Cloudflare tunnel: ${colors.bright}${colors.yellow}cloudflared tunnel --ha-connections 4 --url http://127.0.0.1:3000${colors.reset}`);
    console.log(`     3. Test your connection in Power Automate / Azure APIM.\n`);
  }
}

/**
 * Update Menu (Update Mode)
 */
async function runUpdateMenu(rl) {
  while (true) {
    banner();
    console.log(`\n${colors.yellow}${colors.bright}--- MODE: UPDATE CONFIGURATION ---${colors.reset}\n`);
    const current = readEnv();

    console.log(`Current Configuration:`);
    console.log(`  Looker Base URL       : ${current.LOOKERSDK_BASE_URL || '(not set)'}`);
    console.log(`  Looker Client ID      : ${current.LOOKERSDK_CLIENT_ID || '(not set)'}`);
    console.log(`  Proxy Client ID       : ${current.OAUTH_CLIENT_ID || '(not set)'}`);
    console.log(`  Proxy Issuer URL      : ${current.OAUTH_ISSUER_URL || '(not set)'}`);
    console.log(`  Allowed Redirect URIs : ${current.ALLOWED_REDIRECT_URIS || '(none)'}`);
    console.log('');
    console.log(`${colors.bright}Select an item to update:${colors.reset}`);
    console.log(`  ${colors.cyan}[1]${colors.reset} Update Looker SDK Credentials (Base URL, Client ID, Secret)`);
    console.log(`  ${colors.cyan}[2]${colors.reset} Update Proxy Issuer / Cloudflare Tunnel URL`);
    console.log(`  ${colors.cyan}[3]${colors.reset} Update Proxy OAuth Client Secret`);
    console.log(`  ${colors.cyan}[4]${colors.reset} Update Allowed Redirect URIs`);
    console.log(`  ${colors.cyan}[5]${colors.reset} Re-register Looker OAuth Client in Looker`);
    console.log(`  ${colors.cyan}[6]${colors.reset} Test Cloudflare Tunnel Reachability`);
    console.log(`  ${colors.cyan}[0]${colors.reset} Back to Main Menu`);
    console.log('');

    const choice = await promptInput(rl, 'Enter choice (0-6)', '0');

    if (choice === '0') break;

    if (choice === '1') {
      const baseUrl = (await promptInput(rl, 'Looker Base URL', current.LOOKERSDK_BASE_URL || '')).replace(/\/+$/, '');
      const sdkClientId = await promptInput(rl, 'Looker API Client ID', current.LOOKERSDK_CLIENT_ID || '');
      const sdkClientSecret = await promptInput(rl, 'Looker API Client Secret', current.LOOKERSDK_CLIENT_SECRET || '');

      console.log(`${colors.dim}Testing Looker credentials...${colors.reset}`);
      const res = await testLookerSdkCredentials(baseUrl, sdkClientId, sdkClientSecret);
      if (res.ok) {
        console.log(`${colors.green}✓ Looker API Connection Verified!${colors.reset}`);
      } else {
        console.log(`${colors.red}❌ Verification failed: ${res.error}${colors.reset}`);
      }

      saveEnv({
        LOOKERSDK_BASE_URL: baseUrl,
        LOOKERSDK_CLIENT_ID: sdkClientId,
        LOOKERSDK_CLIENT_SECRET: sdkClientSecret,
      });
      console.log(`${colors.green}Updated Looker SDK credentials.${colors.reset}`);
      await promptInput(rl, 'Press Enter to continue...');
    } else if (choice === '2') {
      let issuerUrl = await promptInput(rl, 'Public Issuer / Tunnel URL', current.OAUTH_ISSUER_URL || '');
      issuerUrl = issuerUrl.trim().replace(/\/+$/, '');
      saveEnv({ OAUTH_ISSUER_URL: issuerUrl });
      console.log(`${colors.green}Updated Public Issuer URL.${colors.reset}`);

      console.log(`${colors.dim}Testing tunnel reachability...${colors.reset}`);
      const check = await testTunnelConnection(issuerUrl);
      if (check.ok) {
        console.log(`${colors.green}✓ ${check.message}${colors.reset}`);
      } else {
        console.log(`${colors.yellow}⚠️ ${check.message}${colors.reset}`);
      }

      const registerNow = await promptInput(rl, 'Re-register OAuth Client in Looker now? (Y/n)', 'Y');
      if (!registerNow.toLowerCase().startsWith('n')) {
        try {
          const regRes = await registerOrUpdateOAuthClient({
            clientId: current.OAUTH_CLIENT_ID || 'looker-oauth-client-id',
            issuerUrl: issuerUrl,
          });
          console.log(`${colors.green}✓ Successfully ${regRes.action} OAuth Client in Looker!${colors.reset}`);
        } catch (err) {
          console.log(`${colors.red}❌ Looker OAuth Client registration failed: ${err.message}${colors.reset}`);
        }
      }
      await promptInput(rl, 'Press Enter to continue...');
    } else if (choice === '3') {
      console.log(`\n${colors.cyan}${colors.bright}Update Proxy OAuth Client Secret${colors.reset}`);
      const newSecret = await configureOAuthClientSecret(rl, current.OAUTH_CLIENT_SECRET);
      saveEnv({ OAUTH_CLIENT_SECRET: newSecret });
      console.log(`\n${colors.green}✓ Proxy OAuth Client Secret updated.${colors.reset}`);
      await promptInput(rl, 'Press Enter to continue...');
    } else if (choice === '4') {
      const uris = await promptInput(rl, 'Allowed Redirect URIs (comma-separated)', current.ALLOWED_REDIRECT_URIS || '');
      saveEnv({ ALLOWED_REDIRECT_URIS: uris });
      console.log(`${colors.green}Updated Allowed Redirect URIs.${colors.reset}`);
      await promptInput(rl, 'Press Enter to continue...');
    } else if (choice === '5') {
      try {
        console.log(`${colors.dim}Registering OAuth Client in Looker...${colors.reset}`);
        const regRes = await registerOrUpdateOAuthClient({
          clientId: current.OAUTH_CLIENT_ID || 'looker-oauth-client-id',
          issuerUrl: current.OAUTH_ISSUER_URL,
        });
        console.log(`${colors.green}✓ Successfully ${regRes.action} OAuth Client in Looker!${colors.reset}`);
      } catch (err) {
        console.log(`${colors.red}❌ Registration failed: ${err.message}${colors.reset}`);
      }
      await promptInput(rl, 'Press Enter to continue...');
    } else if (choice === '6') {
      if (!current.OAUTH_ISSUER_URL) {
        console.log(`${colors.red}OAUTH_ISSUER_URL is not set.${colors.reset}`);
      } else {
        console.log(`${colors.dim}Testing tunnel reachability to ${current.OAUTH_ISSUER_URL}...${colors.reset}`);
        const check = await testTunnelConnection(current.OAUTH_ISSUER_URL);
        if (check.ok) {
          console.log(`${colors.green}✓ ${check.message}${colors.reset}`);
        } else {
          console.log(`${colors.yellow}⚠️ ${check.message}${colors.reset}`);
        }
      }
      await promptInput(rl, 'Press Enter to continue...');
    }
  }
}

/**
 * Display Status & Environment Summary
 */
async function showStatus(rl) {
  banner();
  const current = readEnv();
  console.log(`\n${colors.cyan}${colors.bright}--- CURRENT ENVIRONMENT STATUS ---${colors.reset}\n`);
  console.log(`  Looker Base URL       : ${current.LOOKERSDK_BASE_URL || colors.red + 'MISSING' + colors.reset}`);
  console.log(`  Looker API Client ID  : ${current.LOOKERSDK_CLIENT_ID || colors.red + 'MISSING' + colors.reset}`);
  console.log(`  Looker API Secret     : ${current.LOOKERSDK_CLIENT_SECRET ? colors.green + 'CONFIGURED' + colors.reset : colors.red + 'MISSING' + colors.reset}`);
  console.log(`  OAuth Client ID       : ${current.OAUTH_CLIENT_ID || colors.red + 'MISSING' + colors.reset}`);
  console.log(`  OAuth Client Secret   : ${current.OAUTH_CLIENT_SECRET ? colors.green + 'CONFIGURED' + colors.reset : colors.red + 'MISSING' + colors.reset}`);
  console.log(`  Public Issuer URL     : ${current.OAUTH_ISSUER_URL || colors.yellow + 'NOT SET' + colors.reset}`);
  console.log(`  Allowed Redirect URIs : ${current.ALLOWED_REDIRECT_URIS || colors.yellow + 'NONE RESTRICTED' + colors.reset}`);
  console.log(`  Server Host:Port      : ${current.HOST || '127.0.0.1'}:${current.PORT || '3000'}`);
  console.log('');

  if (current.OAUTH_ISSUER_URL) {
    console.log(`${colors.dim}Testing Cloudflare tunnel health...${colors.reset}`);
    const check = await testTunnelConnection(current.OAUTH_ISSUER_URL);
    if (check.ok) {
      console.log(`  Tunnel Reachability   : ${colors.green}✓ ${check.message}${colors.reset}`);
      console.log(`\n  ${colors.green}${colors.bright}✓ All systems active! Ready to process OAuth requests.${colors.reset}\n`);
    } else if (check.state === 'tunnel_only') {
      console.log(`  Tunnel Reachability   : ${colors.yellow}⚠️ ${check.message}${colors.reset}`);
      console.log(`\n  ${colors.yellow}${colors.bright}Action Required:${colors.reset} Run ${colors.bright}${colors.cyan}npm start${colors.reset} to launch the proxy server.\n`);
    } else {
      console.log(`  Tunnel Reachability   : ${colors.yellow}⚠️ ${check.message}${colors.reset}`);
      console.log(`\n  ${colors.yellow}${colors.bright}Action Required:${colors.reset} Start tunnel (${colors.cyan}cloudflared tunnel --ha-connections 4 --url http://127.0.0.1:3000${colors.reset}) & server (${colors.cyan}npm start${colors.reset}).\n`);
    }
  } else {
    console.log(`\n  ${colors.yellow}${colors.bright}Action Required:${colors.reset} Run New Setup Wizard to configure your Issuer URL.\n`);
  }

  await promptInput(rl, 'Press Enter to return to main menu...');
}

/**
 * Display Power Automate / Azure APIM OAuth Settings including Client Secret
 */
async function printOAuthSettings(rl) {
  banner();
  const current = readEnv();
  const issuerUrl = (current.OAUTH_ISSUER_URL || '').replace(/\/+$/, '');
  const oauthClientId = current.OAUTH_CLIENT_ID || 'looker-oauth-client-id';
  const oauthClientSecret = current.OAUTH_CLIENT_SECRET || '(not configured)';

  console.log(`\n${colors.cyan}${colors.bright}--- POWER AUTOMATE / AZURE APIM OAUTH 2.0 SETTINGS ---${colors.reset}\n`);

  console.log(`${colors.yellow}┌──────────────────────────────────────────────────────────────────────────┐`);
  console.log(`│ ${colors.bright}CUSTOM CONNECTOR OAUTH 2.0 CONFIGURATION${colors.reset}${colors.yellow}                                 │`);
  console.log(`├──────────────────────────────────────────────────────────────────────────┤`);
  console.log(`│ Identity Provider     : Custom / OAuth 2.0                               │`);
  console.log(`│ Authorization URL     : ${issuerUrl ? issuerUrl + '/oauth/authorize' : colors.red + 'OAUTH_ISSUER_URL NOT SET' + colors.yellow}`);
  console.log(`│ Token URL             : ${issuerUrl ? issuerUrl + '/oauth/token' : colors.red + 'OAUTH_ISSUER_URL NOT SET' + colors.yellow}`);
  console.log(`│ Refresh URL           : ${issuerUrl ? issuerUrl + '/oauth/token' : colors.red + 'OAUTH_ISSUER_URL NOT SET' + colors.yellow}`);
  console.log(`│ Client ID             : ${oauthClientId}`);
  console.log(`│ Client Secret         : ${colors.bright}${colors.green}${oauthClientSecret}${colors.reset}${colors.yellow}`);
  console.log(`│ Scope                 : user_info api (or user_api)                       │`);
  console.log(`└──────────────────────────────────────────────────────────────────────────┘${colors.reset}\n`);

  if (current.ALLOWED_REDIRECT_URIS) {
    console.log(`  Allowed Redirect URIs : ${colors.bright}${current.ALLOWED_REDIRECT_URIS}${colors.reset}\n`);
  }

  await promptInput(rl, 'Press Enter to return to main menu...');
}

/**
 * Main Application Loop
 */
async function main() {
  const rl = readline.createInterface({ input, output });

  try {
    while (true) {
      banner();
      console.log(`\nSelect an option:\n`);
      console.log(`  ${colors.cyan}${colors.bright}[1] New Setup Wizard${colors.reset}     (Guided step-by-step setup)`);
      console.log(`  ${colors.cyan}${colors.bright}[2] Update Configuration${colors.reset} (Modify individual parameters)`);
      console.log(`  ${colors.cyan}${colors.bright}[3] Register OAuth Client${colors.reset}(Register/Update redirect URI in Looker)`);
      console.log(`  ${colors.cyan}${colors.bright}[4] View Current Status${colors.reset}   (Check environment & tunnel health)`);
      console.log(`  ${colors.cyan}${colors.bright}[5] Print OAuth Settings${colors.reset} (Display Power Automate config & secret)`);
      console.log(`  ${colors.cyan}${colors.bright}[0] Exit${colors.reset}`);
      console.log('');

      const choice = await promptInput(rl, 'Choice (0-5)', '1');

      if (choice === '0') {
        console.log(`\n${colors.green}Goodbye!${colors.reset}\n`);
        break;
      }

      if (choice === '1') {
        await runNewSetupWizard(rl);
        await promptInput(rl, 'Press Enter to return to main menu...');
      } else if (choice === '2') {
        await runUpdateMenu(rl);
      } else if (choice === '3') {
        const env = readEnv();
        if (!env.OAUTH_ISSUER_URL || !env.OAUTH_CLIENT_ID) {
          console.log(`\n${colors.red}Error: OAUTH_ISSUER_URL and OAUTH_CLIENT_ID must be set first.${colors.reset}`);
        } else {
          try {
            console.log(`\n${colors.dim}Registering OAuth Client in Looker...${colors.reset}`);
            const regRes = await registerOrUpdateOAuthClient({
              clientId: env.OAUTH_CLIENT_ID,
              issuerUrl: env.OAUTH_ISSUER_URL,
            });
            console.log(`${colors.green}✓ Successfully ${regRes.action} OAuth Client in Looker!${colors.reset}`);
          } catch (err) {
            console.log(`${colors.red}❌ Registration failed: ${err.message}${colors.reset}`);
          }
        }
        await promptInput(rl, 'Press Enter to return to main menu...');
      } else if (choice === '4') {
        await showStatus(rl);
      } else if (choice === '5') {
        await printOAuthSettings(rl);
      }
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error('\nFatal TUI Error:', err);
  process.exit(1);
});

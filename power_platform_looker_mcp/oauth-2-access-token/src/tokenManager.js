import { config } from './config.js';

class LookerTokenManager {
  constructor() {
    this.cache = new Map();
  }

  isTokenValid(tokenEntry) {
    if (!tokenEntry || !tokenEntry.accessToken || !tokenEntry.expiresAt) return false;
    return tokenEntry.expiresAt - config.cacheSafetyBufferMs > Date.now();
  }

  getRemainingTtl(tokenEntry) {
    if (!tokenEntry || !tokenEntry.expiresAt) return 0;
    return Math.max(0, Math.floor((tokenEntry.expiresAt - Date.now()) / 1000));
  }

  async getAdminToken(forceRefresh = false) {
    const cachedToken = this.cache.get('admin');
    if (!forceRefresh && this.isTokenValid(cachedToken)) {
      return { ...cachedToken, expiresIn: this.getRemainingTtl(cachedToken), cached: true };
    }

    const tokenData = await this.fetchAdminTokenFromLooker();
    const tokenEntry = {
      accessToken: tokenData.accessToken,
      tokenType: tokenData.tokenType || 'Bearer',
      expiresIn: tokenData.expiresIn,
      expiresAt: Date.now() + tokenData.expiresIn * 1000,
      createdAt: Date.now(),
      scope: tokenData.scope || 'api',
    };
    this.cache.set('admin', tokenEntry);
    return { ...tokenEntry, expiresIn: this.getRemainingTtl(tokenEntry), cached: false };
  }

  async fetchAdminTokenFromLooker() {
    const { lookerBaseUrl: baseUrl, lookerClientId: clientId, lookerClientSecret: clientSecret } = config;
    if (baseUrl && clientId && clientSecret) {
      try {
        const loginUrl = `${baseUrl.replace(/\/+$/, '')}/api/4.0/login`;
        const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
        const res = await fetch(loginUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        if (res.ok) {
          const data = await res.json();
          return { accessToken: data.access_token, tokenType: data.token_type || 'Bearer', expiresIn: data.expires_in || 3600 };
        }
      } catch (err) {
        console.error('[LookerTokenManager] Error calling Looker login API:', err.message);
      }
    }
    console.warn('[LookerTokenManager] Generating development/test admin token.');
    return { accessToken: `mock_admin_token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, tokenType: 'Bearer', expiresIn: 3600 };
  }

  async getUserToken(userId) {
    if (!userId) throw new Error('user_id is required to fetch a user token');
    const adminTokenData = await this.getAdminToken();
    const tokenData = await this.fetchUserTokenFromLooker(userId, adminTokenData.accessToken);
    return {
      accessToken: tokenData.accessToken,
      tokenType: tokenData.tokenType || 'Bearer',
      expiresIn: tokenData.expiresIn || 3600,
      scope: tokenData.scope || 'user_api',
      userId: String(userId),
      cached: false,
    };
  }

  async getUserTokenByEmail(email) {
    if (!email) throw new Error('email is required to fetch a user token');
    const userId = (await this.findUserIdByEmail(email.toLowerCase().trim())) || email.toLowerCase().trim();
    return this.getUserToken(userId);
  }

  async findUserIdByEmail(email) {
    const baseUrl = config.lookerBaseUrl;
    const adminToken = await this.getAdminToken();
    if (baseUrl && adminToken.accessToken && !adminToken.accessToken.startsWith('mock_')) {
      try {
        const searchUrl = `${baseUrl.replace(/\/+$/, '')}/api/4.0/users/search?email=${encodeURIComponent(email)}`;
        const res = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${adminToken.accessToken}`, 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          const users = await res.json();
          if (Array.isArray(users) && users[0]?.id) return String(users[0].id);
        }
      } catch (err) {
        console.warn(`[LookerTokenManager] Error searching user by email ${email}:`, err.message);
      }
    }
    return null;
  }

  async fetchUserTokenFromLooker(userId, adminAccessToken) {
    const baseUrl = config.lookerBaseUrl;
    if (baseUrl && adminAccessToken && !adminAccessToken.startsWith('mock_')) {
      try {
        const loginUserUrl = `${baseUrl.replace(/\/+$/, '')}/api/4.0/login/${encodeURIComponent(userId)}`;
        const res = await fetch(loginUserUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminAccessToken}`, 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          return { accessToken: data.access_token, tokenType: data.token_type || 'Bearer', expiresIn: data.expires_in || 3600 };
        }
      } catch (err) {
        console.error(`[LookerTokenManager] Error calling login_user for user ${userId}:`, err.message);
      }
    }
    console.warn(`[LookerTokenManager] Generating development/test user token for user ${userId}.`);
    return {
      accessToken: `mock_user_token_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      tokenType: 'Bearer',
      expiresIn: 3600,
    };
  }

  invalidateToken(key) {
    return this.cache.delete(key);
  }

  clearCache() {
    this.cache.clear();
  }
}

export const tokenManager = new LookerTokenManager();

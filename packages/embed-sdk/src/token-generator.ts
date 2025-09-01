import jwt from 'jsonwebtoken';
import type { EmbedTokenPayload, TokenGenerationOptions, EmbedPermissions } from './types.js';

/**
 * JWT token generator for embed authentication
 * This should be used on the server-side only
 */
export class EmbedTokenGenerator {
  private secretKey: string;
  private issuer: string;
  private audience: string;

  constructor(secretKey: string, issuer = 'elev8-api', audience = 'elev8-embed') {
    if (!secretKey) {
      throw new Error('Secret key is required for token generation');
    }
    this.secretKey = secretKey;
    this.issuer = issuer;
    this.audience = audience;
  }

  /**
   * Generate a signed JWT token for embedding
   */
  generateToken(options: TokenGenerationOptions): string {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = options.expiresIn || 3600; // Default: 1 hour

    const payload: EmbedTokenPayload = {
      dashboardId: options.dashboardId,
      userId: options.user.id,
      userEmail: options.user.email,
      orgId: options.user.orgId,
      permissions: options.permissions,
      exp: now + expiresIn,
      iat: now,
      iss: this.issuer,
      aud: this.audience,
      ...options.customClaims,
    };

    return jwt.sign(payload, this.secretKey, {
      algorithm: 'HS256',
    });
  }

  /**
   * Verify and decode a JWT token
   */
  verifyToken(token: string): EmbedTokenPayload {
    try {
      const decoded = jwt.verify(token, this.secretKey, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256'],
      }) as EmbedTokenPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error(`Invalid token: ${error.message}`);
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token has expired');
      }
      if (error instanceof jwt.NotBeforeError) {
        throw new Error('Token not active yet');
      }
      throw error;
    }
  }

  /**
   * Create a token with read-only permissions
   */
  createReadOnlyToken(options: Omit<TokenGenerationOptions, 'permissions'>): string {
    const readOnlyPermissions: EmbedPermissions = {
      view: true,
      export: false,
      filter: true,
      drilldown: false,
      refresh: false,
    };

    return this.generateToken({
      ...options,
      permissions: readOnlyPermissions,
    });
  }

  /**
   * Create a token with full permissions
   */
  createFullAccessToken(options: Omit<TokenGenerationOptions, 'permissions'>): string {
    const fullPermissions: EmbedPermissions = {
      view: true,
      export: true,
      filter: true,
      drilldown: true,
      refresh: true,
    };

    return this.generateToken({
      ...options,
      permissions: fullPermissions,
    });
  }

  /**
   * Create a token with custom permissions
   */
  createCustomToken(
    options: Omit<TokenGenerationOptions, 'permissions'>,
    permissions: Partial<EmbedPermissions>,
  ): string {
    const defaultPermissions: EmbedPermissions = {
      view: true,
      export: false,
      filter: false,
      drilldown: false,
      refresh: false,
    };

    return this.generateToken({
      ...options,
      permissions: { ...defaultPermissions, ...permissions },
    });
  }

  /**
   * Get token payload without verification (for debugging)
   */
  decodeTokenUnsafe(token: string): EmbedTokenPayload | null {
    try {
      const decoded = jwt.decode(token) as EmbedTokenPayload | null;
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Check if token is expired without full verification
   */
  isTokenExpired(token: string): boolean {
    const decoded = this.decodeTokenUnsafe(token);
    if (!decoded || !decoded.exp) {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    return decoded.exp < now;
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): Date | null {
    const decoded = this.decodeTokenUnsafe(token);
    if (!decoded || !decoded.exp) {
      return null;
    }

    return new Date(decoded.exp * 1000);
  }

  /**
   * Refresh token if it's close to expiration
   */
  refreshTokenIfNeeded(
    token: string,
    options: TokenGenerationOptions,
    bufferSeconds = 300, // Refresh if less than 5 minutes remaining
  ): string | null {
    const decoded = this.decodeTokenUnsafe(token);
    if (!decoded || !decoded.exp) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - now;

    if (timeUntilExpiry <= bufferSeconds) {
      // Generate new token with same permissions
      return this.generateToken({
        ...options,
        permissions: decoded.permissions,
      });
    }

    return null; // No refresh needed
  }
}

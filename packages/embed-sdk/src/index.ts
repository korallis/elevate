/**
 * Elev8 Embed SDK
 *
 * This SDK provides secure token-based embedding of Elev8 analytics dashboards
 * into external applications with customizable permissions and appearance.
 */

// Core classes
import { EmbedClient } from './embed-client.js';
export { EmbedClient };
export { EmbedTokenGenerator } from './token-generator.js';

// React components (optional peer dependency)
export { EmbedContainer, useEmbed } from './embed-container.js';
export type { EmbedContainerProps } from './embed-container.js';

// Types
export type {
  EmbedTokenPayload,
  EmbedPermissions,
  DashboardConfig,
  DashboardWidget,
  DashboardFilter,
  DashboardTheme,
  EmbedConfig,
  EmbedAppearance,
  TokenGenerationOptions,
  EmbedTokenResponse,
  EmbedValidationResponse,
  EmbedDashboardResponse,
  EmbedMessage,
  EmbedErrorCode,
} from './types.js';

// Error class and constants
export { EmbedError, EMBED_ERRORS } from './types.js';

// Version
export const VERSION = '0.1.0';

/**
 * Quick setup helper for basic embedding
 */
export const createEmbedClient = (config: {
  apiUrl: string;
  dashboardId: string;
  token: string;
  container: string | HTMLElement;
}): EmbedClient => {
  return new EmbedClient({
    ...config,
    appearance: {
      autoResize: true,
      showTitle: true,
      showToolbar: true,
      showFilters: true,
    },
  });
};

/**
 * Utility to check if embed is supported in current environment
 */
export const isEmbedSupported = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    'postMessage' in window &&
    'addEventListener' in window &&
    document?.createElement !== undefined
  );
};

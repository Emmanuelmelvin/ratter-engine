/**
 * Utility functions for Caddy orchestration
 * Provides safe request handling, route generation, and configuration management
 */

import type { CaddyRouteConfig } from '../types';

/**
 * Generate a collision-safe route ID using base64url encoding.
 * This prevents collisions from simple dot-to-hyphen replacements.
 *
 * @param domain - The domain name
 * @returns A URL-safe base64 encoded ID
 */
export function generateRouteId(domain: string): string {
  const encoded = Buffer.from(domain).toString('base64');
  // Convert to base64url (replace + with -, / with _, remove padding)
  return `route-${encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')}`;
}

/**
 * Extract domain from a route ID (reverse of generateRouteId)
 *
 * @param routeId - The generated route ID
 * @returns The original domain, or null if invalid
 */
export function extractDomainFromRouteId(routeId: string): string | null {
  if (!routeId.startsWith('route-')) {
    return null;
  }

  const encoded = routeId.slice(6);
  // Restore base64url to standard base64
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  // Add back padding
  const padding = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padding);

  try {
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

/**
 * Build a Caddy reverse proxy route configuration.
 * 
 * Routes should include terminal: true to prevent fallthrough to subsequent routes,
 * ensuring that specific domain matches are handled and don't leak to catch-all rules.
 *
 * @param domain - The domain to match
 * @param upstreamDialer - The upstream address (e.g., "localhost:3000" or "app:3000")
 * @returns A complete CaddyRouteConfig object
 */
export function buildRoute(domain: string, upstreamDialer: string): CaddyRouteConfig {
  return {
    '@id': generateRouteId(domain),
    match: [
      {
        host: [domain],
      },
    ],
    terminal: true, // Prevent fallthrough; this route is authoritative
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [
          {
            dial: upstreamDialer,
          },
        ],
      },
    ],
  };
}

/**
 * Resolve upstream hostname based on environment.
 * Allows for flexible configuration across local, Docker, and cloud deployments.
 *
 * @param port - The port number
 * @param upstreamHost - Optional override for upstream hostname (defaults to localhost)
 * @returns The dialer string (e.g., "localhost:3000")
 */
export function resolveUpstream(port: number, upstreamHost?: string): string {
  const host = upstreamHost ?? 'localhost';
  return `${host}:${port}`;
}

/**
 * Compare two routes for equality.
 * Useful for detecting which routes need updates.
 *
 * @param route1 - First route
 * @param route2 - Second route
 * @returns true if routes are functionally equivalent
 */
export function routesEqual(route1: CaddyRouteConfig, route2: CaddyRouteConfig): boolean {
  if (route1['@id'] !== route2['@id']) return false;
  if (JSON.stringify(route1.match) !== JSON.stringify(route2.match)) return false;
  if (JSON.stringify(route1.handle) !== JSON.stringify(route2.handle)) return false;
  return true;
}

/**
 * Format a Caddy API error message for debugging.
 *
 * @param status - HTTP status code
 * @param body - Response body text
 * @param endpoint - The endpoint that was called
 * @returns Formatted error message
 */
export function formatCaddyError(status: number, body: string, endpoint: string): string {
  const statusText = getStatusText(status);
  if (body) {
    return `Caddy API error at ${endpoint}: ${status} ${statusText}\n${body}`;
  }
  return `Caddy API error at ${endpoint}: ${status} ${statusText}`;
}

/**
 * Get human-readable HTTP status text.
 *
 * @param status - HTTP status code
 * @returns Status text
 */
function getStatusText(status: number): string {
  const statusMap: Record<number, string> = {
    400: 'Bad Request',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  return statusMap[status] ?? 'Unknown Error';
}

/**
 * Validate that a route has all required fields.
 *
 * @param route - The route to validate
 * @returns true if the route is valid
 */
export function isValidRoute(route: CaddyRouteConfig): boolean {
  if (!route['@id'] || typeof route['@id'] !== 'string') return false;
  if (!Array.isArray(route.match) || route.match.length === 0) return false;
  if (!Array.isArray(route.handle) || route.handle.length === 0) return false;
  if (typeof route.terminal !== 'boolean') return false;

  // Validate match entries
  for (const matcher of route.match) {
    if (!Array.isArray(matcher.host) || matcher.host.length === 0) return false;
  }

  // Validate handle entries
  for (const handler of route.handle) {
    if (handler.handler !== 'reverse_proxy') return false;
    if (!Array.isArray(handler.upstreams) || handler.upstreams.length === 0) return false;
    for (const upstream of handler.upstreams) {
      if (!upstream.dial || typeof upstream.dial !== 'string') return false;
    }
  }

  return true;
}

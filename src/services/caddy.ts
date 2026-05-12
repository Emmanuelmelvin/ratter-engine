/**
 * Caddy Orchestration Layer - Production-Grade Implementation
 *
 * This module manages routes and configuration through the Caddy Admin API.
 *
 * IMPORTANT ARCHITECTURAL NOTES:
 *
 * 1. WHY NOT /load?
 *    POST /load replaces the ENTIRE active Caddy config, which:
 *    - Wipes TLS/HTTPS automation state
 *    - Resets admin configuration
 *    - Clears unrelated routes and servers
 *    - Causes service disruption
 *    We only use /load during initial setup to establish a known state.
 *
 * 2. INCREMENTAL OPERATIONS:
 *    Routes are now added/removed individually using:
 *    - PUT /config/apps/http/servers/localdns (create server once)
 *    - POST /config/apps/http/servers/localdns/routes (append routes)
 *    - DELETE /id/<routeId> (remove specific routes)
 *    This ensures safe, atomic operations without side effects.
 *
 * 3. HTTPS & AUTOMATIC TLS:
 *    The server listens on both :80 and :443.
 *    Caddy's automatic HTTPS (enabled by default) handles:
 *    - Certificate provisioning (Let's Encrypt)
 *    - HTTP → HTTPS redirects
 *    - OCSP stapling
 *    We do NOT disable automatic HTTPS.
 *
 * 4. TERMINAL ROUTES:
 *    All routes include terminal: true, meaning they are authoritative
 *    and prevent fallthrough to subsequent routes.
 *    This is critical for host-based routing to work correctly.
 *
 * 5. UPSTREAM CONFIGURATION:
 *    Upstream dialers support both local and containerized environments:
 *    - localhost:port (local development)
 *    - service-name:port (Docker/Kubernetes)
 *    - custom-host:port (Railway, cloud deployments)
 *    Configured via CADDY_UPSTREAM_HOST environment variable.
 */

import type { CaddyRoute, CaddyRouteConfig, CaddyServerConfig, CaddyApiError } from '../types';
import { logger } from '../utils/logger';
import {
  generateRouteId,
  buildRoute,
  resolveUpstream,
  routesEqual,
  formatCaddyError,
  isValidRoute,
} from './caddy-utils';

const COMPONENT = 'Caddy';
const caddyAdminUrl = process.env.CADDY_ADMIN_URL ?? 'http://localhost:2019';
const caddyUpstreamHost = process.env.CADDY_UPSTREAM_HOST ?? 'localhost';
const caddyOrigin = caddyAdminUrl;
const SERVER_NAME = 'localdns';

/**
 * Make a request to the Caddy Admin API.
 * Handles retries, error formatting, and logging.
 *
 * @param endpoint - The API endpoint path (e.g., '/config/apps/http/servers/localdns')
 * @param init - Fetch options (method, headers, body)
 * @param allowedStatuses - HTTP statuses to treat as success (default: [200, 201])
 * @returns Response as JSON, or null if status not OK and not in allowedStatuses
 * @throws CaddyApiError on unexpected failures
 */
async function request<T = Record<string, unknown>>(
  endpoint: string,
  init: RequestInit = {},
  allowedStatuses: number[] = [200, 201],
): Promise<{ status: number; body: T | null }> {
  const url = new URL(endpoint, caddyAdminUrl);
  const method = init.method ?? 'GET';

  logger.debug(COMPONENT, `${method} ${endpoint}`);

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Origin: caddyOrigin,
        ...(init.headers ?? {}),
      },
    });

    if (response.status === 404) {
      logger.debug(COMPONENT, `Not found (404): ${endpoint}`);
      return { status: 404, body: null };
    }

    const rawBody = await response.text().catch(() => null);
    const contentType = response.headers.get('content-type') ?? '';
    const body: T | null =
      rawBody && contentType.includes('application/json')
        ? JSON.parse(rawBody)
        : (rawBody as T) || null;

    if (!response.ok && !allowedStatuses.includes(response.status)) {
      const error: CaddyApiError = new Error(
        formatCaddyError(response.status, rawBody ?? '', endpoint),
      ) as CaddyApiError;
      error.statusCode = response.status;
      error.responseBody = rawBody ?? '';
      error.endpoint = endpoint;
      logger.error(COMPONENT, `API request failed`, {
        method,
        endpoint,
        status: response.status,
        body,
      });
      throw error;
    }

    return { status: response.status, body };
  } catch (err) {
    if (err instanceof Error && 'statusCode' in err) {
      throw err;
    }
    logger.error(COMPONENT, `Network error during ${method} ${endpoint}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Initialize the localdns Caddy server.
 * This should be called once during application startup.
 * Uses PUT to create the server with a clean slate.
 *
 * @throws CaddyApiError if the operation fails
 */
export async function initializeServer(): Promise<void> {
  logger.info(COMPONENT, 'Initializing localdns server');

  const serverConfig: CaddyServerConfig = {
    listen: [':80', ':443'], // Support HTTP and HTTPS
    routes: [],
  };

  try {
    await request(`/config/apps/http/servers/${SERVER_NAME}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(serverConfig),
    });

    logger.info(COMPONENT, 'Server initialized successfully', {
      listen: serverConfig.listen,
    });
  } catch (err) {
    logger.error(COMPONENT, 'Failed to initialize server', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Check if the localdns server exists in the Caddy config.
 *
 * @returns true if server exists, false otherwise
 */
export async function serverExists(): Promise<boolean> {
  try {
    const { status } = await request(`/config/apps/http/servers/${SERVER_NAME}`, {
      method: 'GET',
    });
    return status === 200;
  } catch (err) {
    logger.warn(COMPONENT, 'Error checking server existence', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Get all currently configured routes.
 *
 * @returns Array of route configurations, or empty array if none
 * @throws CaddyApiError on API failures
 */
async function getExistingRoutes(): Promise<CaddyRouteConfig[]> {
  logger.debug(COMPONENT, 'Fetching existing routes');

  try {
    const result = await request<CaddyRouteConfig[]>(
      `/config/apps/http/servers/${SERVER_NAME}/routes`,
      { method: 'GET' },
      [200, 404],
    );

    if (result.status === 404) {
      logger.debug(COMPONENT, 'No existing routes found');
      return [];
    }

    if (!Array.isArray(result.body)) {
      logger.warn(COMPONENT, 'Routes response is not an array', {
        type: typeof result.body,
      });
      return [];
    }

    logger.debug(COMPONENT, `Found ${result.body.length} existing routes`);
    return result.body;
  } catch (err) {
    logger.error(COMPONENT, 'Failed to fetch existing routes', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Find a route by its ID.
 *
 * @param routeId - The route ID to search for
 * @returns The route if found, null otherwise
 */
async function findRouteById(routeId: string): Promise<CaddyRouteConfig | null> {
  const routes = await getExistingRoutes();
  return routes.find((r) => r['@id'] === routeId) ?? null;
}

/**
 * Add a single route to the localdns server.
 * This is an incremental operation that appends to the existing routes array.
 *
 * @param domain - The domain name
 * @param port - The target port
 * @throws CaddyApiError on API failures
 */
export async function addRoute(domain: string, port: number): Promise<void> {
  const upstreamDial = resolveUpstream(port, caddyUpstreamHost);
  const route = buildRoute(domain, upstreamDial);

  if (!isValidRoute(route)) {
    const err = new Error(`Invalid route configuration for ${domain}`);
    logger.error(COMPONENT, 'Route validation failed', {
      domain,
      port,
      route,
    });
    throw err;
  }

  logger.info(COMPONENT, `Adding route for ${domain}`, {
    port,
    upstream: upstreamDial,
    routeId: route['@id'],
  });

  try {
    const res = await request(`/config/apps/http/servers/${SERVER_NAME}/routes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(route),
    });

    console.log(res)
    logger.info(COMPONENT, `Route added successfully`, {
      domain,
      routeId: route['@id'],
    });
  } catch (err) {
    logger.error(COMPONENT, `Failed to add route for ${domain}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Remove a route by domain name.
 * This uses the route ID generated from the domain to safely delete the route.
 *
 * @param domain - The domain name
 * @throws CaddyApiError on API failures (except 404, which is treated as success)
 */
export async function removeRoute(domain: string): Promise<void> {
  const routeId = generateRouteId(domain);

  logger.info(COMPONENT, `Removing route for ${domain}`, {
    routeId,
  });

  try {
    await request(`/id/${routeId}`, {
      method: 'DELETE',
    }, [200, 404]); // 404 is OK; route may already be gone

    logger.info(COMPONENT, `Route removed successfully`, {
      domain,
      routeId,
    });
  } catch (err) {
    logger.error(COMPONENT, `Failed to remove route for ${domain}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Update a route (replace an existing one).
 * This removes the old route and adds a new one.
 *
 * @param domain - The domain name
 * @param port - The new target port
 * @throws CaddyApiError on API failures
 */
export async function updateRoute(domain: string, port: number): Promise<void> {
  logger.info(COMPONENT, `Updating route for ${domain}`, { port });

  try {
    await removeRoute(domain);
    await addRoute(domain, port);

    logger.info(COMPONENT, `Route updated successfully`, {
      domain,
      port,
    });
  } catch (err) {
    logger.error(COMPONENT, `Failed to update route for ${domain}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Synchronize routes to match the desired state.
 * This is an incremental, idempotent operation that:
 * - Adds missing routes
 * - Removes stale routes
 * - Updates changed routes
 *
 * IMPORTANT: This function does NOT use /load, ensuring that other
 * Caddy configuration (TLS, admin settings, etc.) is preserved.
 *
 * @param desiredRoutes - Array of CaddyRoute objects representing the desired state
 * @throws CaddyApiError on API failures
 */
export async function syncRoutes(desiredRoutes: Array<CaddyRoute>): Promise<void> {
  logger.info(COMPONENT, `Starting route sync`, {
    desiredCount: desiredRoutes.length,
  });

  try {
    // Ensure server exists
    if (!(await serverExists())) {
      logger.info(COMPONENT, 'Server does not exist, initializing');
      await initializeServer();
    }

    // Fetch current routes
    const existingRoutes = await getExistingRoutes();
    logger.debug(COMPONENT, `Current state: ${existingRoutes.length} routes`);

    // Build maps of desired and existing routes by domain
    const desiredMap = new Map(
      desiredRoutes.map((r) => [r.domain, r]),
    );

    const existingMap = new Map(
      existingRoutes.map((r) => {
        const domain = r.match?.[0]?.host?.[0];
        return [domain, r];
      }),
    );

    // Add or update routes
    for (const [domain, desiredRoute] of desiredMap) {
      const existingRoute = existingMap.get(domain);
      const upstreamDial = resolveUpstream(desiredRoute.port, caddyUpstreamHost);
      const desiredRouteConfig = buildRoute(domain, upstreamDial);

      if (!existingRoute) {
        logger.debug(COMPONENT, `Route not found locally: ${domain}`);
        await addRoute(domain, desiredRoute.port);
      } else if (!routesEqual(existingRoute, desiredRouteConfig)) {
        logger.debug(COMPONENT, `Route differs: ${domain}`);
        await updateRoute(domain, desiredRoute.port);
      } else {
        logger.debug(COMPONENT, `Route unchanged: ${domain}`);
      }
    }

    // Remove stale routes
    for (const [domain, existingRoute] of existingMap) {
      if (!desiredMap.has(domain)) {
        logger.debug(COMPONENT, `Route is stale: ${domain}`);
        await removeRoute(domain);
      }
    }

    logger.info(COMPONENT, `Route sync completed successfully`);
  } catch (err) {
    logger.error(COMPONENT, `Route sync failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Perform a health check on the Caddy admin API.
 * Validates that the admin endpoint is reachable and the localdns server is configured.
 *
 * @returns true if healthy, false otherwise
 */
export async function healthCheck(): Promise<boolean> {
  try {
    // Check admin API
    const adminHealth = await request('/config/', { method: 'GET' });
    if (adminHealth.status !== 200) {
      logger.warn(COMPONENT, 'Admin API returned no config');
      return false;
    }

    // Check if localdns server exists
    const serverExists_ = await serverExists();
    if (!serverExists_) {
      logger.warn(COMPONENT, 'localdns server does not exist');
      await initializeServer(); // Attempt to self-heal by initializing the server
    }

    logger.debug(COMPONENT, 'Health check passed');
    return true;
  } catch (err) {
    logger.error(COMPONENT, 'Health check failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Get Caddy status and configuration info for debugging.
 *
 * @returns Status information or null if unavailable
 */
export async function getStatus(): Promise<Record<string, unknown> | null> {
  try {
    const routes = await getExistingRoutes();
    const health = await healthCheck();

    return {
      admin_url: caddyAdminUrl,
      upstream_host: caddyUpstreamHost,
      healthy: health,
      server_name: SERVER_NAME,
      route_count: routes.length,
      routes: routes.map((r) => ({
        id: r['@id'],
        domain: r.match?.[0]?.host?.[0],
        upstream: r.handle?.[0]?.upstreams?.[0]?.dial,
      })),
    };
  } catch (err) {
    logger.error(COMPONENT, 'Failed to get status', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

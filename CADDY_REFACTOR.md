# Caddy Orchestration - Refactoring Guide

## Overview

The Caddy orchestration layer has been completely refactored to use **incremental, safe operations** instead of the dangerous `/load` endpoint that was replacing the entire configuration.

## Key Architectural Changes

### 1. **No More `/load` During Normal Operations**

**Before (Problematic):**
```typescript
// This replaced the ENTIRE Caddy config every time!
POST /load -d '{ "apps": { "http": { ... } } }'
```

**Problems:**
- ❌ Wiped TLS/HTTPS automation state
- ❌ Reset admin configuration
- ❌ Cleared unrelated routes and servers
- ❌ Caused service disruption
- ❌ Loss of certificate state

**After (Safe):**
```typescript
// Only used during initial setup
PUT /config/apps/http/servers/localdns { "listen": [":80", ":443"], "routes": [] }

// Routes added incrementally
POST /config/apps/http/servers/localdns/routes { ... }

// Routes removed individually
DELETE /id/route-abc123
```

### 2. **Incremental Route Operations**

Routes are now managed individually:

| Operation | Endpoint | Method | When Used |
|-----------|----------|--------|-----------|
| Create server | `/config/apps/http/servers/localdns` | PUT | Once during `initializeServer()` |
| Add route | `/config/apps/http/servers/localdns/routes` | POST | When adding a domain |
| Remove route | `/id/<routeId>` | DELETE | When removing a domain |
| Get routes | `/config/apps/http/servers/localdns/routes` | GET | During sync operations |

### 3. **HTTPS & Automatic TLS Support**

**Before:**
```javascript
listen: [':80']  // Only HTTP
```

**After:**
```javascript
listen: [':80', ':443']  // HTTP and HTTPS
```

Caddy's automatic HTTPS (enabled by default) now:
- ✅ Provisions certificates (Let's Encrypt)
- ✅ Redirects HTTP → HTTPS
- ✅ Handles OCSP stapling
- ✅ Renews certificates automatically

### 4. **Terminal Routes**

All routes now include `terminal: true`:

```javascript
{
  '@id': 'route-abc123',
  match: [{ host: ['example.com'] }],
  terminal: true,  // ← Prevents fallthrough
  handle: [
    {
      handler: 'reverse_proxy',
      upstreams: [{ dial: 'localhost:3000' }],
    },
  ],
}
```

**Why?** Terminal routes are authoritative and don't fallthrough to subsequent routes. This is critical for host-based routing to work correctly with catch-all rules.

### 5. **Collision-Safe Route IDs**

**Before (Problematic):**
```typescript
// Simple dot-to-hyphen replacement
function routeId(domain: string): string {
  return `localdns-${domain.replace(/\./g, '-')}`;
}
// Problem: "foo.bar" and "foo-bar" both become "localdns-foo-bar"
```

**After (Safe):**
```typescript
function generateRouteId(domain: string): string {
  const encoded = Buffer.from(domain).toString('base64');
  // Convert to base64url
  return `route-${encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')}`;
}
// Result: "foo.bar" → "route-Zm9vLmJhcg"
```

### 6. **Configurable Upstream Hosts**

Supports local development and containerized environments:

```typescript
// Local development
CADDY_UPSTREAM_HOST=localhost

// Docker Compose
CADDY_UPSTREAM_HOST=app

// Kubernetes
CADDY_UPSTREAM_HOST=app-service

// Railway / custom
CADDY_UPSTREAM_HOST=my-custom-host
```

The resolved dialer becomes: `${CADDY_UPSTREAM_HOST}:${port}`

### 7. **Idempotent Route Sync**

`syncRoutes()` now:
1. Fetches current routes
2. Compares with desired state
3. Adds missing routes
4. Removes stale routes
5. Updates changed routes

This is fully idempotent—running it multiple times produces the same result.

### 8. **Production-Grade Logging**

All operations are logged with structured output:

```
2026-05-08T14:30:21.456Z INFO  [Caddy]        Initializing localdns server
Details: {
  "listen": [
    ":80",
    ":443"
  ]
}
2026-05-08T14:30:21.789Z INFO  [Caddy]        Adding route for example.com
Details: {
  "port": 3000,
  "upstream": "localhost:3000",
  "routeId": "route-ZXhhbXBsZS5jb20"
}
```

## Environment Variables

### `CADDY_ADMIN_URL`
- **Default:** `http://localhost:2019`
- **Purpose:** Caddy admin API endpoint
- **Example:** `http://caddy:2019` (Docker), `http://caddy.example.com:2019` (Production)

### `CADDY_UPSTREAM_HOST`
- **Default:** `localhost`
- **Purpose:** Upstream hostname for reverse proxy
- **Examples:**
  - `localhost` (local development)
  - `app` (Docker Compose service)
  - `app-service` (Kubernetes)
  - `127.0.0.1` (explicit)

### Example `.env`

```bash
# Local development
CADDY_ADMIN_URL=http://localhost:2019
CADDY_UPSTREAM_HOST=localhost

# Docker Compose
CADDY_ADMIN_URL=http://caddy:2019
CADDY_UPSTREAM_HOST=app

# Production
CADDY_ADMIN_URL=https://caddy.internal:2019
CADDY_UPSTREAM_HOST=app-backend
```

## API Functions

### Public Functions

#### `initializeServer(): Promise<void>`
Creates the localdns Caddy server with empty routes. Called automatically during sync if needed.

```typescript
await caddy.initializeServer();
```

#### `addRoute(domain: string, port: number): Promise<void>`
Adds a single route. Incremental operation.

```typescript
await caddy.addRoute('example.com', 3000);
```

#### `removeRoute(domain: string): Promise<void>`
Removes a route by domain. Safe—404s are ignored.

```typescript
await caddy.removeRoute('example.com');
```

#### `updateRoute(domain: string, port: number): Promise<void>`
Updates a route's port. Removes old route and adds new one.

```typescript
await caddy.updateRoute('example.com', 3001);
```

#### `syncRoutes(routes: CaddyRoute[]): Promise<void>`
Synchronizes all routes to match desired state. Idempotent.

```typescript
await caddy.syncRoutes([
  { domain: 'app1.local', port: 3000 },
  { domain: 'app2.local', port: 3001 },
]);
```

#### `healthCheck(): Promise<boolean>`
Verifies Caddy admin API and localdns server exist.

```typescript
const healthy = await caddy.healthCheck();
```

#### `getStatus(): Promise<Record<string, unknown> | null>`
Returns current configuration and route status.

```typescript
const status = await caddy.getStatus();
console.log(status.routes);
// [
//   { id: "route-...", domain: "example.com", upstream: "localhost:3000" },
//   ...
// ]
```

#### `serverExists(): Promise<boolean>`
Checks if localdns server is configured.

```typescript
const exists = await caddy.serverExists();
```

## Utility Functions

### `caddy-utils.ts`

#### `generateRouteId(domain: string): string`
Creates a collision-safe route ID.

```typescript
const id = generateRouteId('example.com');
// "route-ZXhhbXBsZS5jb20"
```

#### `extractDomainFromRouteId(routeId: string): string | null`
Reverses the ID to get the domain.

```typescript
const domain = extractDomainFromRouteId('route-ZXhhbXBsZS5jb20');
// "example.com"
```

#### `buildRoute(domain: string, upstreamDialer: string): CaddyRouteConfig`
Generates a complete route configuration.

```typescript
const route = buildRoute('example.com', 'localhost:3000');
// {
//   '@id': 'route-...',
//   match: [{ host: ['example.com'] }],
//   terminal: true,
//   handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'localhost:3000' }] }],
// }
```

#### `resolveUpstream(port: number, upstreamHost?: string): string`
Generates dialer string.

```typescript
resolveUpstream(3000, 'app');
// "app:3000"

resolveUpstream(3000);
// "localhost:3000"
```

#### `routesEqual(route1: CaddyRouteConfig, route2: CaddyRouteConfig): boolean`
Checks if two routes are functionally equivalent.

```typescript
if (routesEqual(existing, desired)) {
  // No changes needed
}
```

## Error Handling

All Caddy API operations throw `CaddyApiError` on failure:

```typescript
interface CaddyApiError extends Error {
  statusCode: number;
  responseBody?: string;
  endpoint: string;
}
```

Example usage:

```typescript
try {
  await caddy.addRoute('example.com', 3000);
} catch (err) {
  if (err instanceof Error && 'statusCode' in err) {
    const apiErr = err as CaddyApiError;
    console.error(`Caddy API failed at ${apiErr.endpoint}:`, apiErr.statusCode);
    console.error(apiErr.responseBody);
  }
}
```

## Migration Notes

### From Old Implementation

If you were using the old implementation:

1. **No breaking changes** to the public API—same function signatures
2. **Routes are now added incrementally** instead of in a batch `/load` call
3. **HTTPS is now supported** by default (`:443` added to listen)
4. **Route IDs are now collision-safe** using base64url encoding
5. **Logging is now structured** instead of silent/console.error only

### Bootstrap Changes

The bootstrap process now uses `syncRoutes()` which:
- Fetches existing routes
- Diffs with desired routes
- Only makes necessary changes

This means:
- ✅ Faster startup (fewer API calls)
- ✅ Safer (no full config replacement)
- ✅ More reliable (idempotent)

## Caddyfile Reference

The `Caddyfile` should remain minimal since routes are managed via API:

```caddyfile
{
  admin localhost:2019
}

localhost {
  respond "Caddy works!"
}
```

The HTTP server (`localdns`) and routes are created purely through the Admin API.

## Production Deployment

### Railway

```bash
# .env
CADDY_ADMIN_URL=http://localhost:2019
CADDY_UPSTREAM_HOST=localhost  # or your service name

# docker-compose.yml (if using)
services:
  caddy:
    image: caddy:latest
    ports:
      - "80:80"
      - "443:443"
      - "2019:2019"
  app:
    # your app service
```

### Docker Compose

```yaml
services:
  caddy:
    image: caddy:latest
    ports:
      - "80:80"
      - "443:443"
      - "2019:2019"

  localdns:
    environment:
      CADDY_ADMIN_URL: http://caddy:2019
      CADDY_UPSTREAM_HOST: app
```

### Kubernetes

```yaml
env:
  - name: CADDY_ADMIN_URL
    value: http://caddy-svc:2019
  - name: CADDY_UPSTREAM_HOST
    value: app-backend-svc
```

## Troubleshooting

### Routes not appearing

1. Check health: `GET /config/apps/http/servers/localdns`
2. Verify server exists: `await caddy.serverExists()`
3. Check logs for errors

### HTTPS not working

1. Verify `:443` is in listen addresses
2. Check certificate generation: `GET /pki/ca`
3. Ensure domain is public (Let's Encrypt requirement)

### Upstream connection failures

1. Verify `CADDY_UPSTREAM_HOST` is correct
2. Test connectivity: `curl http://${CADDY_UPSTREAM_HOST}:${port}`
3. Check application logs

### Route ID collisions (old system)

This is now fixed with base64url encoding. No action needed.

## Testing

All utility functions have TypeScript types:

```typescript
import { generateRouteId, buildRoute, resolveUpstream } from './services/caddy-utils';
import type { CaddyRoute, CaddyRouteConfig } from './types';

const routeId = generateRouteId('test.local');
const route: CaddyRouteConfig = buildRoute('test.local', 'localhost:3000');
```

Unit tests can verify route generation independently of Caddy:

```typescript
import { describe, it, expect } from 'vitest';
import { generateRouteId, extractDomainFromRouteId } from './caddy-utils';

describe('Route ID encoding', () => {
  it('generates safe route IDs', () => {
    const id = generateRouteId('foo.bar.baz');
    expect(id).toMatch(/^route-[a-zA-Z0-9_-]+$/);
  });

  it('round-trips domain correctly', () => {
    const domain = 'example.com';
    const id = generateRouteId(domain);
    const recovered = extractDomainFromRouteId(id);
    expect(recovered).toBe(domain);
  });
});
```

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Core Pattern** | `/load` (full replace) | Incremental operations (PUT/POST/DELETE) |
| **HTTPS** | Not supported | ✅ Automatic TLS |
| **Route IDs** | Simple string replacement | Base64url encoding (collision-safe) |
| **Upstreams** | Hard-coded `127.0.0.1` | Configurable via env var |
| **Logging** | Silent/console.error | Structured logging |
| **Sync** | Batch replace | Idempotent incremental |
| **Listen Ports** | `:80` only | `:80, :443` |
| **Terminal Routes** | ❌ Missing | ✅ Included |
| **Error Messages** | Minimal | Detailed with context |

---

**For questions or issues**, check the logging output which now includes detailed context for every operation.

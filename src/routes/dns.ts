import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { ApiError } from '../types';
import * as technitium from '../services/technitium';
import {
  ApiErrorSchema,
  DNSActionResponseSchema,
  DNSStatusResponseSchema,
} from '../openapi/schemas';

const router = new OpenAPIHono();

const dnsStatusRoute = createRoute({
  method: 'get',
  path: '/status',
  tags: ['DNS'],
  summary: 'Get dnsmasq status',
  description: 'Checks whether Technitium is reachable and returns server stats.',
  responses: {
    200: {
      description: 'DNS service status',
      content: {
        'application/json': {
          schema: DNSStatusResponseSchema,
        },
      },
    },
    500: {
      description: 'Internal error',
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
    },
  },
});

const dnsFlushRoute = createRoute({
  method: 'post',
  path: '/flush',
  tags: ['DNS'],
  summary: 'Flush DNS cache',
  description: 'Flushes Technitium DNS cache.',
  responses: {
    200: {
      description: 'Cache flushed',
      content: {
        'application/json': {
          schema: DNSActionResponseSchema,
        },
      },
    },
    500: {
      description: 'Internal error',
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
    },
  },
});

// GET /api/dns/status
router.openapi(dnsStatusRoute, async (c) => {
  try {
    const stats = await technitium.getStats();
    return c.json({ running: true, stats }, 200);
  } catch (err) {
    if (err instanceof Error) {
      return c.json({ error: err.message, code: 'INTERNAL' } as ApiError, 500);
    }
    return c.json({ error: 'Unknown error', code: 'UNKNOWN' } as ApiError, 500);
  }
});

// POST /api/dns/flush
router.openapi(dnsFlushRoute, async (c) => {
  try {
    await technitium.flushCache();
    return c.json({ success: true, output: 'Cache flushed' }, 200);
  } catch (err) {
    if (err instanceof Error) {
      return c.json({ error: err.message, code: 'INTERNAL' } as ApiError, 500);
    }
    return c.json({ error: 'Unknown error', code: 'UNKNOWN' } as ApiError, 500);
  }
});

export default router;

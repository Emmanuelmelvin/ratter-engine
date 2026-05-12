import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { db } from '../db/client';
import { ApiError } from '../types';
import {
  ApiErrorSchema,
  SettingsMapSchema,
  SettingsUpdateRequestSchema,
  SettingsUpdateResponseSchema,
} from '../openapi/schemas';

const router = new OpenAPIHono();

const settingsSchema = SettingsUpdateRequestSchema;

const getSettingsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Settings'],
  summary: 'List settings',
  description: 'Returns all settings as a key/value object.',
  responses: {
    200: {
      description: 'Settings returned',
      content: {
        'application/json': {
          schema: SettingsMapSchema,
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

const patchSettingsRoute = createRoute({
  method: 'patch',
  path: '/',
  tags: ['Settings'],
  summary: 'Update setting',
  description: 'Updates a setting value.',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: SettingsUpdateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Setting updated',
      content: {
        'application/json': {
          schema: SettingsUpdateResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation failed',
      content: {
        'application/json': {
          schema: ApiErrorSchema,
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

// GET /api/settings
router.openapi(getSettingsRoute, async (c) => {
  try {
    const settings = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
    const result = Object.fromEntries(settings.map(s => [s.key, s.value]));
    return c.json(result, 200);
  } catch (err) {
    if (err instanceof Error) {
      return c.json({ error: err.message, code: 'INTERNAL' } as ApiError, 500);
    }
    return c.json({ error: 'Unknown error', code: 'UNKNOWN' } as ApiError, 500);
  }
});

// PATCH /api/settings
router.openapi(patchSettingsRoute, async (c) => {
  try {
    const body = await c.req.json();
    const parsed = settingsSchema.parse(body);

    if (parsed.key === 'app_domain' || parsed.key === 'app_port') {
      return c.json({ error: 'Cannot modify read-only settings', code: 'PROTECTED' } as ApiError, 403);
    }

    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(parsed.value, parsed.key);

    return c.json({ key: parsed.key, value: parsed.value }, 200);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', code: 'VALIDATION', details: JSON.stringify(err.errors) } as ApiError, 400);
    }
    if (err instanceof Error) {
      return c.json({ error: err.message, code: 'INTERNAL' } as ApiError, 500);
    }
    return c.json({ error: 'Unknown error', code: 'UNKNOWN' } as ApiError, 500);
  }
});

export default router;

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { db } from '../db/client';
import { Domain, ApiError } from '../types';
import { generateCert, deleteCert } from '../services/cert-manager';
import {
  ApiErrorSchema,
  CertDomainIdParamSchema,
  GenerateCertResponseSchema,
} from '../openapi/schemas';

const router = new OpenAPIHono();

const createCertRoute = createRoute({
  method: 'post',
  path: '/{domainId}',
  tags: ['Certificates'],
  summary: 'Generate certificate',
  description: 'Generates TLS certificate and key for a configured domain using mkcert.',
  request: {
    params: CertDomainIdParamSchema,
  },
  responses: {
    201: {
      description: 'Certificate generated',
      content: {
        'application/json': {
          schema: GenerateCertResponseSchema,
        },
      },
    },
    404: {
      description: 'Domain not found',
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

const deleteCertRoute = createRoute({
  method: 'delete',
  path: '/{domainId}',
  tags: ['Certificates'],
  summary: 'Delete certificate',
  description: 'Deletes TLS certificate and key files for a configured domain.',
  request: {
    params: CertDomainIdParamSchema,
  },
  responses: {
    204: {
      description: 'Certificate deleted',
    },
    404: {
      description: 'Domain not found',
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

// POST /api/certs/:domainId
router.openapi(createCertRoute, async (c) => {
  try {
    const domainId = c.req.param('domainId');
    const domain = db.prepare('SELECT * FROM domains WHERE id = ?').get(domainId) as Domain | undefined;

    if (!domain) {
      return c.json({ error: 'Domain not found', code: 'NOT_FOUND' } as ApiError, 404);
    }

    const { certPath, keyPath } = await generateCert(domain.domain);
    return c.json({ certPath, keyPath }, 201);
  } catch (err) {
    if (err instanceof Error) {
      return c.json({ error: err.message, code: 'INTERNAL' } as ApiError, 500);
    }
    return c.json({ error: 'Unknown error', code: 'UNKNOWN' } as ApiError, 500);
  }
});

// DELETE /api/certs/:domainId
router.openapi(deleteCertRoute, async (c) => {
  try {
    const domainId = c.req.param('domainId');
    const domain = db.prepare('SELECT * FROM domains WHERE id = ?').get(domainId) as Domain | undefined;

    if (!domain) {
      return c.json({ error: 'Domain not found', code: 'NOT_FOUND' } as ApiError, 404);
    }

    await deleteCert(domain.domain);
    return c.body(null, 204);
  } catch (err) {
    if (err instanceof Error) {
      return c.json({ error: err.message, code: 'INTERNAL' } as ApiError, 500);
    }
    return c.json({ error: 'Unknown error', code: 'UNKNOWN' } as ApiError, 500);
  }
});

export default router;

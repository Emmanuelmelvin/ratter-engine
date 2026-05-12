import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { db } from '../db/client';
import type { Domain, ApiError, LogEntry } from '../types';
import * as technitium from '../services/technitium';
import * as caddy from '../services/caddy';
import { deleteCert } from '../services/cert-manager';
import { SQLInputValue } from 'node:sqlite';
import { internalError } from '../utils/error';
import {
  ApiErrorSchema,
  CreateDomainRequestSchema,
  DomainInsightsQuerySchema,
  DomainInsightsResponseSchema,
  DomainIdParamSchema,
  DomainResponseSchema,
  DomainsResponseSchema,
  UpdateDomainRequestSchema,
} from '../openapi/schemas';

const router = new OpenAPIHono();

const createDomainSchema = CreateDomainRequestSchema;
const updateDomainSchema = UpdateDomainRequestSchema;

const listDomainsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Domains'],
  summary: 'List domains',
  description: 'Returns all configured domains ordered by newest first.',
  responses: {
    200: {
      description: 'Domain list returned successfully',
      content: {
        'application/json': {
          schema: DomainsResponseSchema,
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
    },
  },
});

const createDomainRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Domains'],
  summary: 'Create domain',
  description: 'Creates a new domain rule and regenerates dnsmasq config.',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: CreateDomainRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Domain created',
      content: {
        'application/json': {
          schema: DomainResponseSchema,
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
    409: {
      description: 'Domain already exists',
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
    },
  },
});

const updateDomainRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  tags: ['Domains'],
  summary: 'Update domain',
  description: 'Updates one or more domain fields and regenerates dnsmasq config.',
  request: {
    params: DomainIdParamSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: UpdateDomainRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Domain updated',
      content: {
        'application/json': {
          schema: DomainResponseSchema,
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
    404: {
      description: 'Domain not found',
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
    },
  },
});

const deleteDomainRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['Domains'],
  summary: 'Delete domain',
  description: 'Deletes a domain, attempts certificate cleanup, and regenerates config.',
  request: {
    params: DomainIdParamSchema,
  },
  responses: {
    204: {
      description: 'Domain deleted',
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
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
    },
  },
});

const toggleDomainRoute = createRoute({
  method: 'patch',
  path: '/{id}/toggle',
  tags: ['Domains'],
  summary: 'Toggle domain active state',
  description: 'Flips active/inactive status for a domain and regenerates config.',
  request: {
    params: DomainIdParamSchema,
  },
  responses: {
    200: {
      description: 'Domain toggled',
      content: {
        'application/json': {
          schema: DomainResponseSchema,
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
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
    },
  },
});

const domainInsightsRoute = createRoute({
  method: 'get',
  path: '/{id}/insights',
  tags: ['Domains'],
  summary: 'Get domain insights',
  description: 'Returns domain details and query traffic buckets derived from Technitium query logs.',
  request: {
    params: DomainIdParamSchema,
    query: DomainInsightsQuerySchema,
  },
  responses: {
    200: {
      description: 'Domain insights returned',
      content: {
        'application/json': {
          schema: DomainInsightsResponseSchema,
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
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
    },
  },
});

function parsePositiveInt(value: string | undefined, fallback: number, max?: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  if (typeof max === 'number') {
    return Math.min(parsed, max);
  }

  return parsed;
}

function mapTechnitiumLogEntry(entry: {
  rowNumber: number;
  timestamp: string;
  clientIpAddress: string;
  protocol: string;
  responseType: string;
  rcode: string;
  responseRtt: number;
  qname: string;
  qtype: string;
  qclass: string;
  answer: string;
}): LogEntry {
  return {
    id: entry.rowNumber,
    domain_queried: entry.qname,
    resolved_to: entry.answer || null,
    source: entry.responseType === 'Authoritative' ? 'local' : 'upstream',
    response_ms: Number.isFinite(entry.responseRtt) ? Math.round(entry.responseRtt) : null,
    matched_rule_id: null,
    queried_at: entry.timestamp,
    client_ip: entry.clientIpAddress || null,
    protocol: entry.protocol || null,
    rcode: entry.rcode || null,
    qtype: entry.qtype || null,
    qclass: entry.qclass || null,
  };
}

// GET /api/domains
router.openapi(listDomainsRoute, async (c) => {
  try {
    const stmt = db.prepare(`
      SELECT * FROM domains
      ORDER BY created_at DESC
    `);

    const domains = stmt.all() as unknown as Domain[];

    return c.json({ domains }, 200);
  } catch (err) {
    return c.json(internalError(err), 500);
  }
});

// POST /api/domains
router.openapi(createDomainRoute, async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createDomainSchema.parse(body);
    const { zone, name } = technitium.deriveZone(parsed.domain);

    try {
      const result = db
        .prepare(`
          INSERT INTO domains (
            domain,
            type,
            target_ip,
            port,
            active
          )
          VALUES (?, ?, ?, ?, 1)
        `)
        .run(
          parsed.domain,
          parsed.type,
          parsed.target_ip,
          parsed.port ?? null
        );

      const inserted = db
        .prepare('SELECT * FROM domains WHERE id = ?')
        .get(result.lastInsertRowid) as unknown as Domain;

      try {
        await technitium.ensureZoneAndAddRecord(zone, name, parsed.target_ip);
      } catch (error) {
        console.error(`Failed to sync Technitium for ${parsed.domain}:`, error);
      }

      if (parsed.port) {
        try {
          await caddy.addRoute(parsed.domain, parsed.port);
        } catch (error) {
          console.error(`Failed to sync Caddy for ${parsed.domain}:`, error);
        }
      }

      return c.json({ domain: inserted }, 201);
    } catch (dbErr: any) {
      if (dbErr?.message?.includes('UNIQUE')) {
        return c.json(
          {
            error: 'Domain already exists',
            code: 'CONFLICT',
          } satisfies ApiError,
          409
        );
      }

      throw dbErr;
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json(
        {
          error: 'Validation failed',
          code: 'VALIDATION',
          details: JSON.stringify(err.issues),
        } satisfies ApiError,
        400
      );
    }

    return c.json(internalError(err), 500);
  }
});

// PATCH /api/domains/:id
router.openapi(updateDomainRoute, async (c) => {
  try {
    const id = Number(c.req.param('id'));

    const existing = db
      .prepare('SELECT * FROM domains WHERE id = ?')
      .get(id) as unknown as Domain | undefined;

    if (!existing) {
      return c.json(
        {
          error: 'Domain not found',
          code: 'NOT_FOUND',
        } satisfies ApiError,
        404
      );
    }

    const body = await c.req.json();
    const parsed = updateDomainSchema.parse(body);
    const oldZone = technitium.deriveZone(existing.domain);
    const newDomain = parsed.domain ?? existing.domain;
    const newZone = technitium.deriveZone(newDomain);
    const newTargetIp = parsed.target_ip ?? existing.target_ip;
    const newPort = parsed.port !== undefined ? parsed.port : existing.port;
    const domainChanged = parsed.domain !== undefined && parsed.domain !== existing.domain;
    const targetIpChanged = parsed.target_ip !== undefined && parsed.target_ip !== existing.target_ip;
    const portChanged = parsed.port !== undefined && parsed.port !== existing.port;

    const updates: Array<[string, unknown]> = [];

    if (parsed.domain !== undefined) {
      updates.push(['domain', parsed.domain]);
    }

    if (parsed.type !== undefined) {
      updates.push(['type', parsed.type]);
    }

    if (parsed.target_ip !== undefined) {
      updates.push(['target_ip', parsed.target_ip]);
    }

    if (parsed.port !== undefined) {
      updates.push(['port', parsed.port]);
    }

    if (updates.length > 0) {
      const setClauses = updates
        .map(([key]) => `${key} = ?`)
        .join(', ');

      const values = updates.map(([, value]) => value);

      db.prepare(`
        UPDATE domains
        SET ${setClauses}
        WHERE id = ?
      `).run(...values as SQLInputValue[], id);
    }

    const updated = db
      .prepare('SELECT * FROM domains WHERE id = ?')
      .get(id) as unknown as Domain;

    if (domainChanged || targetIpChanged) {
      try {
        await technitium.deleteRecord(oldZone.zone, oldZone.name, existing.target_ip);
      } catch (error) {
        console.error(`Failed to remove old Technitium record for ${existing.domain}:`, error);
      }

      try {
        await technitium.ensureZoneAndAddRecord(newZone.zone, newZone.name, newTargetIp);
      } catch (error) {
        console.error(`Failed to add updated Technitium record for ${updated.domain}:`, error);
      }
    }

    if (domainChanged || portChanged) {
      if (existing.port) {
        try {
          await caddy.removeRoute(existing.domain);
        } catch (error) {
          console.error(`Failed to remove old Caddy route for ${existing.domain}:`, error);
        }
      }

      if (newPort) {
        try {
          await caddy.addRoute(updated.domain, newPort);
        } catch (error) {
          console.error(`Failed to add updated Caddy route for ${updated.domain}:`, error);
        }
      }
    }

    return c.json({ domain: updated }, 200);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json(
        {
          error: 'Validation failed',
          code: 'VALIDATION',
          details: JSON.stringify(err.issues),
        } satisfies ApiError,
        400
      );
    }

    return c.json(internalError(err), 500);
  }
});

// DELETE /api/domains/:id
router.openapi(deleteDomainRoute, async (c) => {
  try {
    const id = Number(c.req.param('id'));

    const existing = db
      .prepare('SELECT * FROM domains WHERE id = ?')
      .get(id) as unknown as Domain | undefined;

    if (!existing) {
      return c.json(
        {
          error: 'Domain not found',
          code: 'NOT_FOUND',
        } satisfies ApiError,
        404
      );
    }

    if (existing.domain === 'local.dev') {
      return c.json(
        {
          error: 'Cannot delete the app domain',
          code: 'PROTECTED',
        } satisfies ApiError,
        403
      );
    }

    db.prepare('DELETE FROM domains WHERE id = ?').run(id);

    try {
      await deleteCert(existing.domain);
    } catch {
      // ignore cert cleanup errors
    }

    const { zone, name } = technitium.deriveZone(existing.domain);

    try {
      await technitium.deleteRecord(zone, name, existing.target_ip);
    } catch (error) {
      console.error(`Failed to delete Technitium record for ${existing.domain}:`, error);
    }

    if (existing.port) {
      try {
        await caddy.removeRoute(existing.domain);
      } catch (error) {
        console.error(`Failed to remove Caddy route for ${existing.domain}:`, error);
      }
    }

    return c.body(null, 204);
  } catch (err) {
    return c.json(internalError(err), 500);
  }
});

// PATCH /api/domains/:id/toggle
router.openapi(toggleDomainRoute, async (c) => {
  try {
    const id = Number(c.req.param('id'));

    const existing = db
      .prepare('SELECT * FROM domains WHERE id = ?')
      .get(id) as unknown as Domain | undefined;

    if (!existing) {
      return c.json(
        {
          error: 'Domain not found',
          code: 'NOT_FOUND',
        } satisfies ApiError,
        404
      );
    }

    db.prepare(`
        UPDATE domains
        SET active = (1 - active)
        WHERE id = ?
        `).run(id);
    const updated = db
        .prepare('SELECT * FROM domains WHERE id = ?')
        .get(id) as unknown as Domain;

    const { zone, name } = technitium.deriveZone(updated.domain);

    if (updated.active) {
      try {
        await technitium.enableRecord(zone, name, updated.target_ip);
      } catch (error) {
        console.error(`Failed to enable Technitium record for ${updated.domain}:`, error);
      }

      if (updated.port) {
        try {
          await caddy.addRoute(updated.domain, updated.port);
        } catch (error) {
          console.error(`Failed to add Caddy route for ${updated.domain}:`, error);
        }
      }
    } else {
      try {
        await technitium.disableRecord(zone, name, updated.target_ip);
      } catch (error) {
        console.error(`Failed to disable Technitium record for ${updated.domain}:`, error);
      }

      if (updated.port) {
        try {
          await caddy.removeRoute(updated.domain);
        } catch (error) {
          console.error(`Failed to remove Caddy route for ${updated.domain}:`, error);
        }
      }
    }

    return c.json({ domain: updated }, 200);
  } catch (err) {
    return c.json(internalError(err), 500);
  }
});

// GET /api/domains/:id/insights
router.openapi(domainInsightsRoute, async (c) => {
  try {
    const id = Number(c.req.param('id'));
    const domain = db
      .prepare('SELECT * FROM domains WHERE id = ?')
      .get(id) as unknown as Domain | undefined;

    if (!domain) {
      return c.json(
        {
          error: 'Domain not found',
          code: 'NOT_FOUND',
        } satisfies ApiError,
        404
      );
    }

    const windowHours = parsePositiveInt(c.req.query('windowHours'), 24, 168);
    const bucketMinutes = parsePositiveInt(c.req.query('bucketMinutes'), 30, 120);
    const limit = parsePositiveInt(c.req.query('limit'), 500, 500);

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - windowHours * 60 * 60 * 1000);

    const page = await technitium.queryLogs({
      qname: domain.domain,
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
      limit,
      pageNumber: 1,
      descendingOrder: true,
    });

    const entries = page.entries;
    const bucketSizeMs = bucketMinutes * 60 * 1000;
    const bucketCount = Math.max(1, Math.ceil((windowEnd.getTime() - windowStart.getTime()) / bucketSizeMs));
    const buckets = Array.from({ length: bucketCount }, (_, index) => {
      const startMs = windowStart.getTime() + index * bucketSizeMs;
      const endMs = Math.min(startMs + bucketSizeMs, windowEnd.getTime());
      return {
        bucketStart: new Date(startMs).toISOString(),
        bucketEnd: new Date(endMs).toISOString(),
        count: 0,
      };
    });

    const clients = new Set<string>();
    let noErrorCount = 0;
    let rttSum = 0;
    let rttCount = 0;
    const qtypeCounts = new Map<string, number>();
    const rcodeCounts = new Map<string, number>();

    for (const entry of entries) {
      if (entry.clientIpAddress) {
        clients.add(entry.clientIpAddress);
      }

      if ((entry.rcode || '').toLowerCase() === 'noerror') {
        noErrorCount += 1;
      }

      if (Number.isFinite(entry.responseRtt)) {
        rttSum += entry.responseRtt;
        rttCount += 1;
      }

      if (entry.qtype) {
        qtypeCounts.set(entry.qtype, (qtypeCounts.get(entry.qtype) ?? 0) + 1);
      }

      if (entry.rcode) {
        rcodeCounts.set(entry.rcode, (rcodeCounts.get(entry.rcode) ?? 0) + 1);
      }

      const timestampMs = Date.parse(entry.timestamp);
      if (Number.isNaN(timestampMs) || timestampMs < windowStart.getTime() || timestampMs > windowEnd.getTime()) {
        continue;
      }

      const bucketIndex = Math.floor((timestampMs - windowStart.getTime()) / bucketSizeMs);
      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        buckets[bucketIndex].count += 1;
      }
    }

    const topQtypes = Array.from(qtypeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([qtype, count]) => ({ qtype, count }));

    const topRcodes = Array.from(rcodeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([rcode, count]) => ({ rcode, count }));

    return c.json(
      {
        domain,
        summary: {
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString(),
          totalQueries: entries.length,
          uniqueClients: clients.size,
          noErrorCount,
          successRate: entries.length ? Number(((noErrorCount / entries.length) * 100).toFixed(2)) : 0,
          averageResponseMs: rttCount ? Number((rttSum / rttCount).toFixed(2)) : null,
          topQtypes,
          topRcodes,
        },
        traffic: {
          bucketMinutes,
          points: buckets,
        },
        recentEntries: entries.slice(0, 20).map((entry) => mapTechnitiumLogEntry(entry)),
      },
      200
    );
  } catch (err) {
    return c.json(internalError(err), 500);
  }
});

export default router;
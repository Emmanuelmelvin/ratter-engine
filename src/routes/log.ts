import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import type { LogEntry } from '../types';
import { internalError } from '../utils/error';
import { clearQueryLogs, downloadLogFile, listLogFiles, queryLogs } from '../services/technitium';
import {
  ApiErrorSchema,
  LogListQuerySchema,
  LogListResponseSchema,
  TechnitiumLogDownloadQuerySchema,
  TechnitiumLogFilesResponseSchema,
} from '../openapi/schemas';

const router = new OpenAPIHono();

const getLogRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Logs'],
  summary: 'Get DNS query log',
  description: 'Returns recent DNS query log entries with optional limit (default 200, max 500).',
  request: {
    query: LogListQuerySchema,
  },
  responses: {
    200: {
      description: 'Log entries returned',
      content: {
        'application/json': {
          schema: LogListResponseSchema,
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

const clearLogRoute = createRoute({
  method: 'delete',
  path: '/',
  tags: ['Logs'],
  summary: 'Clear DNS query log',
  description: 'Deletes all query log entries.',
  responses: {
    204: {
      description: 'Log cleared',
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

const listTechnitiumLogFilesRoute = createRoute({
  method: 'get',
  path: '/technitium/files',
  tags: ['Technitium Logs'],
  summary: 'List Technitium log files',
  description: 'Returns the available Technitium server log files, usually one file per day.',
  responses: {
    200: {
      description: 'Technitium log files returned',
      content: {
        'application/json': {
          schema: TechnitiumLogFilesResponseSchema,
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

const downloadTechnitiumLogRoute = createRoute({
  method: 'get',
  path: '/technitium/download',
  tags: ['Technitium Logs'],
  summary: 'Download Technitium log file',
  description: 'Returns the selected Technitium log file as plain text.',
  request: {
    query: TechnitiumLogDownloadQuerySchema,
  },
  responses: {
    200: {
      description: 'Technitium log file returned',
      content: {
        'text/plain': {
          schema: { type: 'string' },
        },
      },
    },
    400: {
      description: 'Missing file name',
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

// GET /api/log
router.openapi(getLogRoute, async (c) => {
  try {
    const parsePositiveInt = (value: string | undefined, fallback: number, max?: number): number => {
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
    };

    const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
      if (!value) {
        return fallback;
      }

      const normalized = value.toLowerCase();
      if (normalized === 'true' || normalized === '1') {
        return true;
      }

      if (normalized === 'false' || normalized === '0') {
        return false;
      }

      return fallback;
    };

    const page = await queryLogs({
      limit: parsePositiveInt(c.req.query('limit'), 200, 500),
      pageNumber: parsePositiveInt(c.req.query('pageNumber'), 1),
      descendingOrder: parseBoolean(c.req.query('descendingOrder'), true),
      start: c.req.query('start')?.trim() || undefined,
      end: c.req.query('end')?.trim() || undefined,
      clientIpAddress: c.req.query('clientIpAddress')?.trim() || undefined,
      protocol: c.req.query('protocol')?.trim() || undefined,
      responseType: c.req.query('responseType')?.trim() || undefined,
      rcode: c.req.query('rcode')?.trim() || undefined,
      qname: c.req.query('qname')?.trim() || undefined,
      qtype: c.req.query('qtype')?.trim() || undefined,
      qclass: c.req.query('qclass')?.trim() || undefined,
    });

    const entries = page.entries.map((entry) => mapTechnitiumLogEntry(entry));

    return c.json(
      {
        entries,
        pageNumber: page.pageNumber,
        totalPages: page.totalPages,
        totalEntries: page.totalEntries,
        total: page.totalEntries,
      },
      200
    );
  } catch (err) {
    return c.json(internalError(err), 500);
  }
});

// DELETE /api/log
router.openapi(clearLogRoute, async (c) => {
  try {
    await clearQueryLogs();

    return c.body(null, 204);
  } catch (err) {
    return c.json(internalError(err), 500);
  }
});

// GET /api/log/technitium/files
router.openapi(listTechnitiumLogFilesRoute, async (c) => {
  try {
    const files = await listLogFiles();

    return c.json({ files }, 200);
  } catch (err) {
    return c.json(internalError(err), 500);
  }
});

// GET /api/log/technitium/download?fileName=YYYY-MM-DD
router.openapi(downloadTechnitiumLogRoute, async (c) => {
  try {
    const fileName = c.req.query('fileName');

    if (!fileName) {
      return c.json({ error: 'fileName is required', code: 'VALIDATION' }, 400);
    }

    const content = await downloadLogFile(fileName);

    return c.text(content, 200);
  } catch (err) {
    return c.json(internalError(err), 500);
  }
});

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

export default router;
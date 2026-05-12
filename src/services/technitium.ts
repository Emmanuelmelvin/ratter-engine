import type { TechnitiumError, TechnitiumQueryLogEntry, TechnitiumQueryLogPage, TechnitiumStats } from '../types';
import { logger } from '../utils/logger';

const COMPONENT = 'Technitium';
const technitiumBaseUrl = process.env.TECHNITIUM_URL ?? 'http://localhost:5380';
const technitiumApiKey = process.env.TECHNITIUM_API_KEY;
const technitiumLogsAppName = process.env.TECHNITIUM_LOGS_APP_NAME ?? null;
const technitiumLogsClassPath = process.env.TECHNITIUM_LOGS_CLASS_PATH ?? null;
const technitiumOrigin = technitiumBaseUrl;
const technitiumNode = process.env.TECHNITIUM_NODE ?? null;

// Warn once at module load if query log env vars are absent.
// queryLogs() and getQueryLog() are called frequently, so logging inside them
// would flood the output — this fires exactly once at startup instead.
const queryLogEnabled = Boolean(technitiumLogsAppName && technitiumLogsClassPath);
if (!queryLogEnabled) {
  logger.warn(
    COMPONENT,
    'Query log disabled: TECHNITIUM_LOGS_APP_NAME and/or TECHNITIUM_LOGS_CLASS_PATH are not set. ' +
    'queryLogs() and getQueryLog() will return empty results until these are configured.',
  );
}

type TechnitiumApiErrorBody = {
  error?: string;
  message?: string;
  errorMessage?: string;
  response?: {
    error?: string;
    message?: string;
    errorMessage?: string;
    pageNumber?: number;
    totalPages?: number;
    totalEntries?: number;
    entries?: TechnitiumQueryLogEntry[];
    token?: string;
    stats?: Partial<TechnitiumStats>;
    logs?: TechnitiumQueryLogEntry[];
      logFiles?: TechnitiumLogFile[];
    data?: unknown;
  };
  token?: string;
  stats?: Partial<TechnitiumStats>;
  pageNumber?: number;
  totalPages?: number;
  totalEntries?: number;
  logs?: TechnitiumQueryLogEntry[];
  logFiles?: TechnitiumLogFile[];
  entries?: TechnitiumQueryLogEntry[];
  data?: unknown;
};

class TechnitiumApiError extends Error implements TechnitiumError {
  statusCode: number;

  technitiumMessage: string;

  constructor(statusCode: number, technitiumMessage: string) {
    super(technitiumMessage);
    this.name = 'TechnitiumError';
    this.statusCode = statusCode;
    this.technitiumMessage = technitiumMessage;
  }
}

/**
 * Construct a full URL against the configured Technitium base URL.
 *
 * @param path - API path (e.g., '/api/zones/list')
 * @returns Fully-qualified URL object
 */
function routeUrl(path: string): URL {
  return new URL(path, technitiumBaseUrl);
}

/**
 * Safely read and parse a JSON response body.
 * Returns undefined for empty bodies; falls back to { message: text } if not valid JSON.
 *
 * @param response - The fetch Response to read
 * @returns Parsed body, partial error shape, or undefined
 */
async function readJson(response: Response): Promise<TechnitiumApiErrorBody | undefined> {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as TechnitiumApiErrorBody;
  } catch {
    return { message: text };
  }
}

/**
 * Extract the most descriptive error message from a Technitium API response body.
 * Walks several known field locations before falling back to a provided default.
 *
 * @param body - Parsed response body (may be undefined)
 * @param fallback - Message to use if no known field is present
 */
function getErrorMessage(body: TechnitiumApiErrorBody | undefined, fallback: string): string {
  return body?.error ?? body?.message ?? body?.errorMessage ?? body?.response?.error ?? body?.response?.message ?? body?.response?.errorMessage ?? fallback;
}

/**
 * Create a TechnitiumApiError from an HTTP response and its parsed body.
 *
 * @param statusCode - HTTP status code
 * @param body - Parsed response body (may be undefined)
 * @param fallback - Fallback message if body contains no error text
 */
function toTechnitiumError(statusCode: number, body: TechnitiumApiErrorBody | undefined, fallback: string): TechnitiumApiError {
  return new TechnitiumApiError(statusCode, getErrorMessage(body, fallback));
}

/**
 * Make a request to the Technitium DNS API.
 * JSON body fields are automatically promoted to query string parameters,
 * since Technitium's API accepts parameters via GET query strings.
 * Authentication is handled via Bearer token if TECHNITIUM_API_KEY is set.
 *
 * @param path - The API endpoint path (e.g., '/api/zones/list')
 * @param init - Fetch options (method, headers, body)
 * @returns Parsed response payload (unwrapped from the `response` envelope if present)
 * @throws TechnitiumApiError on HTTP errors or error-status payloads
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = routeUrl(path);
  const method = init.method ?? 'GET';
  const headers: any = {
    Origin: technitiumOrigin,
    ...(init.headers ?? {}),
  };

  logger.debug(COMPONENT, `${method} ${path}`);

  const requestBody = init.body;

  if (typeof requestBody === 'string') {
    try {
      const parsedBody = JSON.parse(requestBody) as Record<string, unknown>;

      for (const [key, value] of Object.entries(parsedBody)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    } catch {
      // Leave the request body untouched if it is not JSON.
    }
  }

  // Use API key with Bearer token header (preferred method per API docs v15.0+)
  if (technitiumApiKey) {
    headers['Authorization'] = `Bearer ${technitiumApiKey}`;
  }

  try {
    const response = await fetch(url, {
      ...init,
      body: undefined,
      headers,
    });

    if (!response.ok) {
      const body = await readJson(response);
      const error = toTechnitiumError(response.status, body, 'Technitium request failed');
      logger.error(COMPONENT, `API request failed`, {
        method,
        path,
        status: response.status,
        message: error.technitiumMessage,
      });
      throw error;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const body = await readJson(response);
    // If the API returned an error payload (status: 'error' or error fields), treat as failure
    if (body && ((body as any).status === 'error' || body.error || body.errorMessage || body.response?.error || body.response?.errorMessage)) {
      const error = toTechnitiumError(response.status, body, getErrorMessage(body, 'Technitium returned an error'));
      logger.error(COMPONENT, `API returned error payload`, {
        method,
        path,
        message: error.technitiumMessage,
      });
      throw error;
    }

    const payload = (body?.response ?? body) as T | undefined;

    return payload as T;
  } catch (err) {
    if (err instanceof TechnitiumApiError) {
      throw err;
    }
    logger.error(COMPONENT, `Network error during ${method} ${path}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Make a Technitium API request that returns plain text.
 *
 * @param path - The API endpoint path, including any query string
 * @param init - Fetch options (method, headers, body)
 * @returns Raw text response from Technitium
 * @throws TechnitiumApiError on HTTP errors
 */
async function requestText(path: string, init: RequestInit = {}): Promise<string> {
  const url = routeUrl(path);
  const method = init.method ?? 'GET';
  const headers: any = {
    Origin: technitiumOrigin,
    ...(init.headers ?? {}),
  };

  logger.debug(COMPONENT, `${method} ${path}`);

  if (technitiumApiKey) {
    headers['Authorization'] = `Bearer ${technitiumApiKey}`;
  }

  const response = await fetch(url, {
    ...init,
    body: undefined,
    headers,
  });

  const text = await response.text();

  if (!response.ok) {
    const error = new TechnitiumApiError(response.status, text || response.statusText || 'Technitium request failed');
    logger.error(COMPONENT, `API request failed`, {
      method,
      path,
      status: response.status,
      message: error.technitiumMessage,
    });
    throw error;
  }

  return text;
}

/**
 * Build the request payload for A record operations (add, update, delete).
 * Sends several aliased field names to maximise compatibility across
 * Technitium API versions.
 *
 * @param zone - The DNS zone (e.g., 'local')
 * @param name - The record name within the zone (e.g., 'myapp', '@', '*')
 * @param ip - IP address for the A record (omit for update/disable operations)
 * @param disabled - Whether the record should be disabled (omit for add/delete)
 */
function deriveRecordPayload(zone: string, name: string, ip?: string, disabled?: boolean) {
  return {
    domain: name === '@' ? zone : `${name}.${zone}`,
    zone,
    zoneName: zone,
    name,
    recordName: name,
    type: 'A',
    recordType: 'A',
    ip,
    ipAddress: ip,
    data: ip,
    disabled,
    isDisabled: disabled,
    enabled: disabled === undefined ? undefined : !disabled,
    ttl: 60,
  };
}

/**
 * Create a new primary DNS zone.
 * Treats 409 and "already exists" responses as success, since the
 * zone being present is the desired outcome regardless of who created it.
 *
 * @param zone - Zone name to create (e.g., 'local')
 * @throws TechnitiumApiError on unexpected failures
 */
async function createZone(zone: string): Promise<void> {
  logger.info(COMPONENT, `Creating zone`, { zone });

  try {
    await request('/api/zones/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ domain: zone, type: 'Primary' }),
    });

    logger.info(COMPONENT, `Zone created successfully`, { zone });
  } catch (error) {
    // If the zone already exists, Technitium may return a 409 or a
    // message indicating the zone exists. Treat that as success.
    if (error instanceof TechnitiumApiError) {
      if (error.statusCode === 409) {
        logger.debug(COMPONENT, `Zone already exists`, { zone });
        return;
      }
    }

    const msg = error instanceof Error ? error.message : String(error);
    if (/already exists|exists/i.test(msg)) {
      logger.debug(COMPONENT, `Zone already exists`, { zone });
      return;
    }

    logger.error(COMPONENT, `Failed to create zone`, {
      zone,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Derive the DNS zone and record name from a fully-qualified domain.
 * The zone is the TLD (last label); the name is everything before it.
 * Wildcards (*.example) are handled by returning name='*' and zone='example'.
 *
 * @param domain - Fully-qualified domain (e.g., 'app.local', '*.local')
 * @returns { zone, name } tuple suitable for Technitium API calls
 * @throws Error if the domain has fewer than two labels
 */
export function deriveZone(domain: string): { zone: string; name: string } {
  // Handle wildcard domains like *.local
  if (domain.startsWith('*.')) {
    const zone = domain.slice(2);
    return { zone, name: '*' };
  }

  const parts = domain.split('.');
  if (parts.length < 2) throw new Error(`Invalid domain: ${domain}`);

  // zone is the last part (TLD), name is everything before
  const zone = parts.slice(-1).join('.');
  const name = parts.slice(0, -1).join('.') || '@';

  return { zone, name };
}

/**
 * Idempotently ensure a zone exists and add an A record within it.
 * Zone creation errors are treated as warnings (zone may already exist);
 * duplicate record errors (409 / "already exists") are silently ignored.
 *
 * @param zone - The DNS zone (e.g., 'local')
 * @param name - The record name (e.g., 'myapp', '@', '*')
 * @param ip - The IP address to point the A record at
 * @throws TechnitiumApiError on unexpected record-add failures
 */
export async function ensureZoneAndAddRecord(
  zone: string,
  name: string,
  ip: string
): Promise<void> {
  // Step 1: ensure the zone exists
  try {
    const zones = await listZones();
    const exists = zones.some(z => z.name === zone);
    if (!exists) {
      await createZone(zone);
    } else {
      logger.debug(COMPONENT, `Zone already exists, skipping create`, { zone });
    }
  } catch (err) {
    logger.warn(COMPONENT, `Zone check/create warned`, {
      zone,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Step 2: add the A record
  logger.info(COMPONENT, `Adding A record`, { zone, name, ip });

  try {
    await request('/api/zones/records/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deriveRecordPayload(zone, name, ip)),
    });

    logger.info(COMPONENT, `A record added successfully`, { zone, name, ip });
  } catch (error) {
    if (error instanceof TechnitiumApiError && error.statusCode === 409) {
      logger.debug(COMPONENT, `A record already exists`, { zone, name, ip });
      return;
    }

    const msg = error instanceof Error ? error.message : String(error);
    if (/already exists|exists/i.test(msg)) {
      logger.debug(COMPONENT, `A record already exists`, { zone, name, ip });
      return;
    }

    logger.error(COMPONENT, `Failed to add A record`, {
      zone,
      name,
      ip,
      error: msg,
    });
    throw error;
  }
}

/**
 * Retrieve all zones currently configured in Technitium.
 *
 * @returns Array of zone objects (at minimum { name: string })
 * @throws TechnitiumApiError on API failures
 */
async function listZones(): Promise<Array<{ name: string }>> {
  logger.debug(COMPONENT, 'Fetching zone list');

  const data = await request('/api/zones/list', {
    method: 'GET',
  }) as any;

  return data?.zones ?? [];
}

/**
 * Add an A record, creating the zone first if it does not exist.
 * Convenience wrapper around ensureZoneAndAddRecord.
 *
 * @param zone - The DNS zone (e.g., 'local')
 * @param name - The record name (e.g., 'myapp')
 * @param ip - The target IP address
 */
export async function addRecord(zone: string, name: string, ip: string): Promise<void> {
  await ensureZoneAndAddRecord(zone, name, ip);
}

/**
 * Permanently delete an A record from a zone.
 *
 * @param zone - The DNS zone (e.g., 'local')
 * @param name - The record name (e.g., 'myapp')
 * @param ip - The IP address of the record to delete
 * @throws TechnitiumApiError on API failures
 */
export async function deleteRecord(zone: string, name: string, ip: string): Promise<void> {
  logger.info(COMPONENT, `Deleting A record`, { zone, name, ip });

  try {
    await request('/api/zones/records/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deriveRecordPayload(zone, name, ip)),
    });

    logger.info(COMPONENT, `A record deleted successfully`, { zone, name, ip });
  } catch (err) {
    logger.error(COMPONENT, `Failed to delete A record`, {
      zone,
      name,
      ip,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Disable a DNS record without deleting it.
 * Disabled records are retained in the zone but not served in responses.
 *
 * @param zone - The DNS zone (e.g., 'local')
 * @param name - The record name (e.g., 'myapp')
 * @throws TechnitiumApiError on API failures
 */
export async function disableRecord(zone: string, name: string, ip?: string): Promise<void> {
  logger.info(COMPONENT, `Disabling record`, { zone, name });

  try {
    await request('/api/zones/records/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deriveRecordPayload(zone, name, ip, true)),
    });

    logger.info(COMPONENT, `Record disabled successfully`, { zone, name });
  } catch (err) {
    logger.error(COMPONENT, `Failed to disable record`, {
      zone,
      name,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Re-enable a previously disabled DNS record.
 *
 * @param zone - The DNS zone (e.g., 'local')
 * @param name - The record name (e.g., 'myapp')
 * @throws TechnitiumApiError on API failures
 */
export async function enableRecord(zone: string, name: string, ip?: string): Promise<void> {
  logger.info(COMPONENT, `Enabling record`, { zone, name });

  try {
    await request('/api/zones/records/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deriveRecordPayload(zone, name, ip, false)),
    });

    logger.info(COMPONENT, `Record enabled successfully`, { zone, name });
  } catch (err) {
    logger.error(COMPONENT, `Failed to enable record`, {
      zone,
      name,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Flush the entire Technitium DNS cache.
 * Useful after bulk record changes to ensure resolvers pick up the new state immediately.
 *
 * @throws TechnitiumApiError on API failures
 */
export async function flushCache(): Promise<void> {
  logger.info(COMPONENT, 'Flushing DNS cache');

  try {
    await request('/api/cache/flush', {
      method: 'GET',
    });

    logger.info(COMPONENT, 'DNS cache flushed successfully');
  } catch (err) {
    logger.error(COMPONENT, 'Failed to flush DNS cache', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Retrieve aggregate query statistics from the Technitium dashboard.
 * All counters default to 0 if absent from the response.
 *
 * @returns TechnitiumStats snapshot
 * @throws TechnitiumApiError on API failures
 */
export async function getStats(): Promise<TechnitiumStats> {
  logger.debug(COMPONENT, 'Fetching dashboard stats');

  const body = await request<TechnitiumApiErrorBody>('/api/dashboard/stats/get', {
    method: 'GET',
  });

  const stats = body?.stats ?? body?.response?.stats ?? {};

  return {
    totalQueries: stats.totalQueries ?? 0,
    totalNoError: stats.totalNoError ?? 0,
    totalServerFailure: stats.totalServerFailure ?? 0,
    totalNxDomain: stats.totalNxDomain ?? 0,
    totalCached: stats.totalCached ?? 0,
    totalBlocked: stats.totalBlocked ?? 0,
  };
}

function parseQueryLogPage(body: TechnitiumApiErrorBody | undefined): TechnitiumQueryLogPage {
  const response = body?.response ?? body;
  const entries = (response?.entries ?? response?.logs ?? body?.entries ?? body?.logs ?? []) as TechnitiumQueryLogEntry[];

  return {
    pageNumber: response?.pageNumber ?? body?.pageNumber ?? 1,
    totalPages: response?.totalPages ?? body?.totalPages ?? 1,
    totalEntries: response?.totalEntries ?? body?.totalEntries ?? entries.length,
    entries: Array.isArray(entries) ? entries : [],
  };
}

type TechnitiumLogFile = {
  fileName: string;
  size: string;
};

export type QueryLogsOptions = {
  limit?: number;
  pageNumber?: number;
  descendingOrder?: boolean;
  start?: string;
  end?: string;
  clientIpAddress?: string;
  protocol?: string;
  responseType?: string;
  rcode?: string;
  qname?: string;
  qtype?: string;
  qclass?: string;
};

function parseLogFiles(body: TechnitiumApiErrorBody | undefined): TechnitiumLogFile[] {
  const response = body?.response ?? body;
  const files = (response?.logFiles ?? body?.logFiles ?? []) as TechnitiumLogFile[];

  return Array.isArray(files) ? files : [];
}

/**
 * Fetch recent DNS query log entries together with paging metadata.
 * Returns an empty result immediately (without logging) if query logging
 * is not configured.
 *
 * @param optionsOrLimit - Maximum entries or advanced query options
 * @returns Page of query log entries, or an empty page if query logging is not configured
 * @throws TechnitiumApiError on API failures
 */
export async function queryLogs(optionsOrLimit: number | QueryLogsOptions = 200): Promise<TechnitiumQueryLogPage> {
  if (!queryLogEnabled) {
    return {
      pageNumber: 1,
      totalPages: 1,
      totalEntries: 0,
      entries: [],
    };
  }

  const options = typeof optionsOrLimit === 'number'
    ? { limit: optionsOrLimit }
    : optionsOrLimit;

  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  const pageNumber = Math.max(options.pageNumber ?? 1, 1);
  const payload: Record<string, string | number | boolean> = {
    name: technitiumLogsAppName as string,
    classPath: technitiumLogsClassPath as string,
    pageNumber,
    entriesPerPage: limit,
    descendingOrder: options.descendingOrder ?? true,
  };

  if (technitiumNode) {
    payload.node = technitiumNode;
  }

  const optionalFilters: Array<keyof QueryLogsOptions> = [
    'start',
    'end',
    'clientIpAddress',
    'protocol',
    'responseType',
    'rcode',
    'qname',
    'qtype',
    'qclass',
  ];

  for (const key of optionalFilters) {
    const value = options[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      payload[key] = value.trim();
    }
  }

  logger.debug(COMPONENT, 'Fetching query logs', {
    limit,
    pageNumber,
    filters: Object.keys(payload).filter((key) => !['name', 'classPath', 'pageNumber', 'entriesPerPage', 'descendingOrder', 'node'].includes(key)),
  });

  try {
    const body = await request<TechnitiumApiErrorBody>('/api/logs/query', {
      method: 'GET',
      body: JSON.stringify(payload),
    });

    const page = parseQueryLogPage(body);

    logger.debug(COMPONENT, `Fetched ${page.entries.length} query log entries`);

    return page;
  } catch (err) {
    if (err instanceof TechnitiumApiError) {
      throw err;
    }
    logger.error(COMPONENT, 'Network error fetching query logs', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Fetch recent DNS query log entries.
 *
 * @param limit - Maximum number of entries to return (most recent first)
 * @returns Array of log entries, or [] if query logging is not configured
 * @throws TechnitiumApiError on API failures
 */
export async function getQueryLog(limit: number): Promise<TechnitiumQueryLogEntry[]> {
  const page = await queryLogs({ limit });
  return page.entries;
}

/**
 * Delete all Technitium query logs.
 *
 * @throws TechnitiumApiError on API failures
 */
export async function clearQueryLogs(): Promise<void> {
  logger.debug(COMPONENT, 'Clearing query logs');

  await request('/api/logs/deleteAll', {
    method: 'POST',
  });

  logger.debug(COMPONENT, 'Query logs cleared');
}

/**
 * List the available Technitium server log files.
 *
 * @returns Available log files, newest-first when Technitium returns them that way
 * @throws TechnitiumApiError on API failures
 */
export async function listLogFiles(): Promise<TechnitiumLogFile[]> {
  logger.debug(COMPONENT, 'Fetching log files');

  const query = new URLSearchParams();
  if (technitiumNode) {
    query.set('node', technitiumNode);
  }

  const body = await request<TechnitiumApiErrorBody>(`/api/logs/list${query.toString() ? `?${query.toString()}` : ''}`, {
    method: 'GET',
  });

  return parseLogFiles(body);
}

/**
 * Download a Technitium server log file as raw text.
 *
 * @param fileName - Daily log file name, usually a date like YYYY-MM-DD
 * @returns Raw log file contents
 * @throws TechnitiumApiError on API failures
 */
export async function downloadLogFile(fileName: string): Promise<string> {
  logger.debug(COMPONENT, 'Downloading log file', { fileName });

  const query = new URLSearchParams({ fileName });
  if (technitiumNode) {
    query.set('node', technitiumNode);
  }

  return requestText(`/api/logs/download?${query.toString()}`, {
    method: 'GET',
  });
}

/**
 * Perform a health check on the Technitium API.
 * Validates reachability by fetching dashboard stats.
 *
 * @returns true if the API is reachable and responding, false otherwise
 */
export async function healthCheck(): Promise<boolean> {
  try {
    await getStats();
    logger.debug(COMPONENT, 'Health check passed');
    return true;
  } catch (err) {
    logger.error(COMPONENT, 'Health check failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
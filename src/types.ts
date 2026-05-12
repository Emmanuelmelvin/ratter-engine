export interface Domain {
  id: number;
  domain: string;
  type: 'subdomain' | 'custom' | 'wildcard';
  target_ip: string;
  port: number | null;
  active: boolean;
  created_at: string;
}

export interface LogEntry {
  id: number;
  domain_queried: string;
  resolved_to: string | null;
  source: 'local' | 'upstream';
  response_ms: number | null;
  matched_rule_id: number | null;
  queried_at: string;
  client_ip?: string | null;
  protocol?: string | null;
  rcode?: string | null;
  qtype?: string | null;
  qclass?: string | null;
}

export interface ExecuteResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ApiError {
  error: string;
  details?: string;
  code: string;
}

export interface TechnitiumStats {
  totalQueries: number;
  totalNoError: number;
  totalServerFailure: number;
  totalNxDomain: number;
  totalCached: number;
  totalBlocked: number;
}

export interface TechnitiumQueryLogEntry {
  rowNumber: number;
  timestamp: string;
  clientIpAddress: string;
  protocol: string;
  responseType: string;
  responseRtt: number;
  rcode: string;
  qname: string;
  qtype: string;
  qclass: string;
  answer: string;
}

export interface TechnitiumQueryLogPage {
  pageNumber: number;
  totalPages: number;
  totalEntries: number;
  entries: TechnitiumQueryLogEntry[];
}

export interface CaddyRoute {
  domain: string;
  port: number;
}

export interface CaddyRouteConfig {
  '@id': string;
  match: Array<{
    host: string[];
  }>;
  terminal: boolean;
  handle: Array<{
    handler: 'reverse_proxy';
    upstreams: Array<{
      dial: string;
    }>;
  }>;
}

export interface CaddyServerConfig {
  listen: string[];
  routes: CaddyRouteConfig[];
}

export interface CaddyConfig {
  apps: {
    http: {
      servers: {
        [serverName: string]: CaddyServerConfig;
      };
    };
  };
}

export interface CaddyApiError extends Error {
  statusCode: number;
  responseBody?: string;
  endpoint: string;
}

export interface TechnitiumError extends Error {
  statusCode: number;
  technitiumMessage: string;
}

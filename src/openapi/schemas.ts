import { z } from '@hono/zod-openapi';

export const ApiErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'Domain not found' }),
    code: z.string().openapi({ example: 'NOT_FOUND' }),
    details: z.string().optional().openapi({ example: 'Validation failed for field: domain' }),
  })
  .openapi('ApiError');

export const DomainSchema = z
  .object({
    id: z.number().int().openapi({ example: 1 }),
    domain: z.string().openapi({ example: 'admin.localhost' }),
    type: z.enum(['subdomain', 'custom', 'wildcard']).openapi({ example: 'subdomain' }),
    target_ip: z.string().openapi({ example: '127.0.0.1' }),
    port: z.number().int().nullable().openapi({ example: 3000 }),
    active: z.union([z.boolean(), z.number().int().min(0).max(1)]).openapi({ example: 1 }),
    created_at: z.string().openapi({ example: '2026-05-07 10:30:00' }),
  })
  .openapi('Domain');

export const DomainsResponseSchema = z
  .object({
    domains: z.array(DomainSchema),
  })
  .openapi('DomainsResponse');

export const DomainResponseSchema = z
  .object({
    domain: DomainSchema,
  })
  .openapi('DomainResponse');

export const CreateDomainRequestSchema = z
  .object({
    domain: z.string().min(3).regex(/^[\w.*-]+\.[\w.-]+$/).openapi({ example: 'api.localhost' }),
    type: z.enum(['subdomain', 'custom', 'wildcard']).openapi({ example: 'subdomain' }),
    target_ip: z.string().ip().default('127.0.0.1').openapi({ example: '127.0.0.1' }),
    port: z.number().int().min(1).max(65535).optional().openapi({ example: 8080 }),
  })
  .openapi('CreateDomainRequest');

export const UpdateDomainRequestSchema = CreateDomainRequestSchema.partial().openapi('UpdateDomainRequest');

export const DomainIdParamSchema = z
  .object({
    id: z.string().openapi({ param: { name: 'id', in: 'path' }, example: '1' }),
  })
  .openapi('DomainIdParam');

export const CertDomainIdParamSchema = z
  .object({
    domainId: z.string().openapi({ param: { name: 'domainId', in: 'path' }, example: '1' }),
  })
  .openapi('CertDomainIdParam');

export const GenerateCertResponseSchema = z
  .object({
    certPath: z.string().openapi({ example: '/home/user/.localdns/certs/admin.localhost.pem' }),
    keyPath: z.string().openapi({ example: '/home/user/.localdns/certs/admin.localhost-key.pem' }),
  })
  .openapi('GenerateCertResponse');

export const DNSStatusResponseSchema = z
  .object({
    running: z.boolean().openapi({ example: true }),
    stats: z
      .object({
        totalQueries: z.number().int().openapi({ example: 1200 }),
        totalNoError: z.number().int().openapi({ example: 1180 }),
        totalServerFailure: z.number().int().openapi({ example: 2 }),
        totalNxDomain: z.number().int().openapi({ example: 10 }),
        totalCached: z.number().int().openapi({ example: 600 }),
        totalBlocked: z.number().int().openapi({ example: 8 }),
      })
      .openapi({ example: { totalQueries: 1200, totalNoError: 1180, totalServerFailure: 2, totalNxDomain: 10, totalCached: 600, totalBlocked: 8 } }),
  })
  .openapi('DNSStatusResponse');

export const DNSActionResponseSchema = z
  .object({
    success: z.boolean().openapi({ example: true }),
    output: z.string().openapi({ example: 'Command executed successfully' }),
  })
  .openapi('DNSActionResponse');

export const DNSReloadResponseSchema = z
  .object({
    success: z.boolean().openapi({ example: true }),
    message: z.string().openapi({ example: 'Config written and reloaded with 5 rules' }),
  })
  .openapi('DNSReloadResponse');

export const LogEntrySchema = z
  .object({
    id: z.number().int().openapi({ example: 25 }),
    domain_queried: z.string().openapi({ example: 'admin.localhost' }),
    resolved_to: z.string().nullable().openapi({ example: '127.0.0.1' }),
    source: z.enum(['local', 'upstream']).openapi({ example: 'local' }),
    response_ms: z.number().int().nullable().openapi({ example: 3 }),
    matched_rule_id: z.number().int().nullable().openapi({ example: 1 }),
    queried_at: z.string().openapi({ example: '2026-05-07 10:33:10' }),
  })
  .openapi('LogEntry');

export const LogListQuerySchema = z
  .object({
    limit: z.string().optional().openapi({
      param: { name: 'limit', in: 'query' },
      example: '200',
    }),
  })
  .openapi('LogListQuery');

export const LogListResponseSchema = z
  .object({
    entries: z.array(LogEntrySchema),
    total: z.number().int().openapi({ example: 120 }),
  })
  .openapi('LogListResponse');

export const TechnitiumLogFileSchema = z
  .object({
    fileName: z.string().openapi({ example: '2026-05-11' }),
    size: z.string().openapi({ example: '8.14 KB' }),
  })
  .openapi('TechnitiumLogFile');

export const TechnitiumLogFilesResponseSchema = z
  .object({
    files: z.array(TechnitiumLogFileSchema),
  })
  .openapi('TechnitiumLogFilesResponse');

export const TechnitiumLogDownloadQuerySchema = z
  .object({
    fileName: z.string().min(1).openapi({
      param: { name: 'fileName', in: 'query' },
      example: '2026-05-11',
    }),
  })
  .openapi('TechnitiumLogDownloadQuery');

export const SettingsMapSchema = z
  .record(z.string())
  .openapi('SettingsMap');

export const SettingsUpdateRequestSchema = z
  .object({
    key: z.enum(['dns_port', 'upstream_dns', 'cert_dir', 'technitium_url', 'caddy_admin_url', 'app_domain', 'app_port']).openapi({ example: 'upstream_dns' }),
    value: z.string().min(1).openapi({ example: '1.1.1.1' }),
  })
  .openapi('SettingsUpdateRequest');

export const SettingsUpdateResponseSchema = z
  .object({
    key: z.string().openapi({ example: 'upstream_dns' }),
    value: z.string().openapi({ example: '1.1.1.1' }),
  })
  .openapi('SettingsUpdateResponse');

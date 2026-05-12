import { db } from '../db/client';
import * as technitium from '../services/technitium';
import * as caddy from '../services/caddy';
import type { Domain } from '../types';

type BootstrapCounters = {
  dnsRecords: number;
  routes: number;
};

const DEFAULT_LOCAL_ROUTE = {
  domain: 'local.test',
  port: 4321,
};

export async function bootstrap(): Promise<void> {
  const counters: BootstrapCounters = {
    dnsRecords: 0,
    routes: 0,
  };

  const domains = db
    .prepare('SELECT * FROM domains WHERE active = 1')
    .all() as unknown as Domain[];
  // Ensure DNS records for all active domains
  for (const domain of domains) {
    const { zone, name } = technitium.deriveZone(domain.domain);

    try {
      await technitium.ensureZoneAndAddRecord(zone, name, domain.target_ip);
      counters.dnsRecords += 1;
    } catch (error) {
      console.error(`Failed to bootstrap Technitium for ${domain.domain}:`, error);
    }
  }

  // Build full routes list and initialize Caddy with a single sync call
  const routes = domains
    .filter(d => d.port)
    .map(d => ({ domain: d.domain, port: d.port as number }));

  if (!routes.some((route) => route.domain === DEFAULT_LOCAL_ROUTE.domain)) {
    routes.push(DEFAULT_LOCAL_ROUTE);
  }

  try {
    await caddy.syncRoutes(routes);
    counters.routes = routes.length;
  } catch (error) {
    console.error('Failed to sync routes into Caddy:', error);
  }

  console.log(`✓ Bootstrapped ${counters.dnsRecords} DNS records into Technitium`);
  console.log(`✓ Bootstrapped ${counters.routes} routes into Caddy`);
  console.log('✓ local.test is ready at https://local.test');
}

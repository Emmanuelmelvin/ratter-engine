import 'dotenv/config';

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'fs/promises';
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import './db/schema';
import domainsRoute from './routes/domains';
import dnsRoute from './routes/dns';
import certsRoute from './routes/certs';
import logRoute from './routes/log';
import settingsRoute from './routes/settings';
import { checkDependencies } from './startup/check-dependencies';
import { bootstrap } from './startup/bootstrap';
import { LogPoller } from './services/log-poller';

const app = new OpenAPIHono();
const logPoller = new LogPoller();

app.use('*', cors());
app.use('*', logger());

// Serve the landing page at `/`
app.get('/', async (c) => {
  try {
    const html = await fs.readFile('./landing/index.html', 'utf-8');
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  } catch (e) {
    return c.text('Landing page not found', 404);
  }
});

// Serve static assets used by landing and dashboard pages.
// Keep this before `/dashboard/*` so image requests do not get the SPA HTML.
app.use('/dashboard/assets/*', serveStatic({ root: './landing' }));
app.use('/assets/*', serveStatic({ root: './landing/dashboard' }));

// Serve the dashboard SPA index for client-side routing
app.get('/dashboard', async (c) => {
  try {
    const html = await fs.readFile('./landing/dashboard/index.html', 'utf-8');
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  } catch (e) {
    return c.text('Dashboard not found', 404);
  }
});

app.get('/dashboard/*', async (c) => {
  try {
    const html = await fs.readFile('./landing/dashboard/index.html', 'utf-8');
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  } catch (e) {
    return c.text('Dashboard not found', 404);
  }
});

// Existing public static fallback
app.use('/*', serveStatic({ root: './public' }));

app.route('/api/domains', domainsRoute);
app.route('/api/dns', dnsRoute);
app.route('/api/certs', certsRoute);
app.route('/api/log', logRoute);
app.route('/api/settings', settingsRoute);

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'LocalDNS API',
    version: '1.0.0',
    description: 'Backend API for managing local DNS rules, config generation, and certificate workflows.',
  },
  servers: [
    {
      url: 'http://localhost:4321',
      description: 'Local development server',
    },
  ],
});

app.get('/docs', swaggerUI({
  url: '/openapi.json',
}));

app.onError((err, c) => {
  return c.json({ error: err.message, code: 'INTERNAL' }, 500);
});

app.notFound((c) => {
  return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
});

await checkDependencies();
await bootstrap();

logPoller.start();
// startLogSocket(logPoller);

serve({ fetch: app.fetch, port: 4321 }, () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  LocalDNS is running');
  console.log('  Open http://local.test in your browser');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

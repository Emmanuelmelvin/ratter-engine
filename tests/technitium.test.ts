import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('technitium', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
    vi.unstubAllGlobals();
  });

  it('derives zones from common domain shapes', async () => {
    const { deriveZone } = await import('../src/services/technitium');

    expect(deriveZone('admin.localhost')).toEqual({ zone: 'localhost', name: 'admin' });
    expect(deriveZone('myapp.test')).toEqual({ zone: 'test', name: 'myapp' });
    expect(deriveZone('*.local')).toEqual({ zone: 'local', name: '*' });
    expect(deriveZone('local.dev')).toEqual({ zone: 'dev', name: 'local' });
  });

  it('calls the add record endpoint with the expected payload', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(JSON.stringify({ token: 'token-123' })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(JSON.stringify({ response: {} })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(JSON.stringify({ response: {} })),
      });

    vi.stubGlobal('fetch', fetchMock);
    const technitium = await import('../src/services/technitium');

    await technitium.addRecord('localhost', 'admin', '127.0.0.1');

    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[1][0].toString()).toContain('/api/zones/create');
    expect(fetchMock.mock.calls[2][0].toString()).toContain('/api/zones/records/add');

    const body = JSON.parse(fetchMock.mock.calls[2][1]?.body as string);
    expect(body).toMatchObject({ domain: 'admin.localhost', zone: 'localhost', name: 'admin', ip: '127.0.0.1', type: 'A' });
  });

  it('calls the delete record endpoint', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(JSON.stringify({ token: 'token-123' })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(JSON.stringify({ response: {} })),
      });

    vi.stubGlobal('fetch', fetchMock);
    const technitium = await import('../src/services/technitium');

    await technitium.deleteRecord('localhost', 'admin', '127.0.0.1');

    expect(fetchMock.mock.calls[1][0].toString()).toContain('/api/zones/records/delete');
  });

  it('re-authenticates once on 401 before throwing', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(JSON.stringify({ token: 'token-123' })),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue(JSON.stringify({ error: 'unauthorized' })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(JSON.stringify({ token: 'token-456' })),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue(JSON.stringify({ error: 'boom' })),
      });

    vi.stubGlobal('fetch', fetchMock);
    const technitium = await import('../src/services/technitium');

    await expect(technitium.flushCache()).rejects.toMatchObject({
      statusCode: 500,
      technitiumMessage: 'boom',
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('throws TechnitiumError details on API failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(JSON.stringify({ token: 'token-123' })),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue(JSON.stringify({ error: 'server failed' })),
      });

    vi.stubGlobal('fetch', fetchMock);
    const technitium = await import('../src/services/technitium');

    await expect(technitium.getStats()).rejects.toMatchObject({
      statusCode: 500,
      technitiumMessage: 'server failed',
    });
  });
});

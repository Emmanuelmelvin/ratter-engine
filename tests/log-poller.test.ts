import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/technitium', () => ({
  getQueryLog: vi.fn(),
}));

describe('log-poller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  it('emits entries for new log items and maps them correctly', async () => {
    const technitium = await import('../src/services/technitium');
    const { LogPoller } = await import('../src/services/log-poller');

    vi.mocked(technitium.getQueryLog).mockResolvedValue([
      {
        rowNumber: 2,
        timestamp: '2026-05-07T10:00:02.000Z',
        clientIpAddress: '127.0.0.1',
        protocol: 'Udp',
        responseType: 'Authoritative',
        responseRtt: 2,
        rcode: 'NoError',
        qname: 'new.local',
        qtype: 'A',
        qclass: 'IN',
        answer: '127.0.0.1',
      },
      {
        rowNumber: 1,
        timestamp: '2026-05-07T10:00:01.000Z',
        clientIpAddress: '127.0.0.1',
        protocol: 'Udp',
        responseType: 'Recursive',
        responseRtt: 8,
        rcode: 'NoError',
        qname: 'old.local',
        qtype: 'A',
        qclass: 'IN',
        answer: '',
      },
    ]);

    const poller = new LogPoller();
    const entries: unknown[] = [];
    poller.on('entry', (entry) => entries.push(entry));

    await (poller as unknown as { poll: () => Promise<void> }).poll();

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      domain_queried: 'old.local',
      resolved_to: null,
      source: 'upstream',
      response_ms: 8,
      queried_at: '2026-05-07T10:00:01.000Z',
    });
    expect(entries[1]).toMatchObject({
      domain_queried: 'new.local',
      resolved_to: '127.0.0.1',
      source: 'local',
      response_ms: 2,
      queried_at: '2026-05-07T10:00:02.000Z',
    });
  });

  it('skips entries already seen', async () => {
    const technitium = await import('../src/services/technitium');
    const { LogPoller } = await import('../src/services/log-poller');

    vi.mocked(technitium.getQueryLog).mockResolvedValue([
      {
        rowNumber: 2,
        timestamp: '2026-05-07T10:00:03.000Z',
        clientIpAddress: '127.0.0.1',
        protocol: 'Udp',
        responseType: 'Authoritative',
        responseRtt: 1,
        rcode: 'NoError',
        qname: 'latest.local',
        qtype: 'A',
        qclass: 'IN',
        answer: '127.0.0.1',
      },
      {
        rowNumber: 1,
        timestamp: '2026-05-07T10:00:02.000Z',
        clientIpAddress: '127.0.0.1',
        protocol: 'Udp',
        responseType: 'Authoritative',
        responseRtt: 1,
        rcode: 'NoError',
        qname: 'seen.local',
        qtype: 'A',
        qclass: 'IN',
        answer: '127.0.0.1',
      },
    ]);

    const poller = new LogPoller();
    const entries: unknown[] = [];
    poller.on('entry', (entry) => entries.push(entry));

    await (poller as unknown as { poll: () => Promise<void> }).poll();
    await (poller as unknown as { poll: () => Promise<void> }).poll();

    expect(entries).toHaveLength(2);
  });

  it('stops polling when stopped', async () => {
    const technitium = await import('../src/services/technitium');
    const { LogPoller } = await import('../src/services/log-poller');

    vi.mocked(technitium.getQueryLog).mockResolvedValue([]);

    const poller = new LogPoller();
    const entrySpy = vi.fn();
    poller.on('entry', entrySpy);
    poller.start(1000);
    poller.stop();

    vi.advanceTimersByTime(3000);

    expect(entrySpy).not.toHaveBeenCalled();
  });
});

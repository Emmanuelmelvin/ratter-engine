import { EventEmitter } from 'events';
import * as technitium from './technitium';
import type { LogEntry } from '../types';

export class LogPoller extends EventEmitter {
  private interval: NodeJS.Timeout | null = null;

  private lastSeen: string | null = null;

  start(intervalMs = 2000): void {
    if (this.interval) {
      return;
    }

    this.interval = setInterval(() => {
      void this.poll();
    }, intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const entries = await technitium.getQueryLog(50);
      const newEntries = entries
        .filter((entry) => !this.lastSeen || entry.timestamp > this.lastSeen)
        .reverse();

      for (const entry of newEntries) {
        const mapped: LogEntry = {
          id: entry.rowNumber,
          domain_queried: entry.qname,
          resolved_to: entry.answer || null,
          source: entry.responseType === 'Authoritative' ? 'local' : 'upstream',
          response_ms: Number.isFinite(entry.responseRtt) ? Math.round(entry.responseRtt) : null,
          matched_rule_id: null,
          queried_at: entry.timestamp,
        };

        this.emit('entry', mapped);

        this.lastSeen = entry.timestamp;
      }
    } catch (error) {
      console.error('Error polling Technitium query logs:', error);
    }
  }
}

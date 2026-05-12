/**
 * Logging utilities for Caddy orchestration
 * Provides structured, production-safe logging for debugging and monitoring
 */

enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  details?: Record<string, unknown>;
}

function formatLog(entry: LogEntry): string {
  const timestamp = entry.timestamp;
  const level = entry.level.padEnd(5);
  const component = `[${entry.component}]`.padEnd(15);
  let log = `${timestamp} ${level} ${component} ${entry.message}`;

  if (entry.details && Object.keys(entry.details).length > 0) {
    log += `\nDetails: ${JSON.stringify(entry.details, null, 2)}`;
  }

  return log;
}

function now(): string {
  return new Date().toISOString();
}

export const logger = {
  debug(component: string, message: string, details?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: now(),
      level: LogLevel.DEBUG,
      component,
      message,
      details,
    };
    console.log(formatLog(entry));
  },

  info(component: string, message: string, details?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: now(),
      level: LogLevel.INFO,
      component,
      message,
      details,
    };
    console.log(formatLog(entry));
  },

  warn(component: string, message: string, details?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: now(),
      level: LogLevel.WARN,
      component,
      message,
      details,
    };
    console.warn(formatLog(entry));
  },

  error(component: string, message: string, details?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: now(),
      level: LogLevel.ERROR,
      component,
      message,
      details,
    };
    console.error(formatLog(entry));
  },
};

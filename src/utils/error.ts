import type { ApiError } from '../types';

export function internalError(err: unknown): ApiError {
  if (err instanceof Error) {
    return {
      error: err.message,
      code: 'INTERNAL',
    };
  }

  return {
    error: 'Unknown error',
    code: 'UNKNOWN',
  };
}
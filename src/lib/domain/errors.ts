/**
 * Errors that are part of the domain contract. Anything else thrown out of a
 * transaction is a bug and should surface as a 500.
 */
export class DomainError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = status;
  }
}

export const notFound = (what: string) => new DomainError('NOT_FOUND', `${what} not found`, 404);
export const invalid = (message: string) => new DomainError('INVALID_INPUT', message, 422);

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}

import { ErrorCodes, type ErrorCode } from '@global-emotes/contracts';

export class ApiHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

export const unauthorized = (msg = 'authentication required') =>
  new ApiHttpError(401, ErrorCodes.UNAUTHORIZED, msg);
export const forbidden = (msg = 'forbidden') => new ApiHttpError(403, ErrorCodes.FORBIDDEN, msg);
export const notFound = (msg = 'not found') => new ApiHttpError(404, ErrorCodes.NOT_FOUND, msg);
export const conflict = (msg: string) => new ApiHttpError(409, ErrorCodes.CONFLICT, msg);
export const validation = (msg: string, details?: unknown) =>
  new ApiHttpError(400, ErrorCodes.VALIDATION, msg, details);
export const planLimit = (msg: string) => new ApiHttpError(402, ErrorCodes.PLAN_LIMIT, msg);

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Authentication required", code = "UNAUTHORIZED") =>
  new HttpError(401, code, message);
export const forbidden = (message = "You do not have permission to do that") =>
  new HttpError(403, "FORBIDDEN", message);
// Resources the viewer may not see are reported as 404 so their existence is not leaked.
export const notFound = (message = "Not found") => new HttpError(404, "NOT_FOUND", message);
export const conflict = (message: string) => new HttpError(409, "CONFLICT", message);

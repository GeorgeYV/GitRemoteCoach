export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} no encontrado`, 404, 'not_found');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: string) {
    super(message, 409, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, 403, 'forbidden');
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 422, 'validation_error');
  }
}

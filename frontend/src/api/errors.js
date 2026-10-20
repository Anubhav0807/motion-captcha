export class ApiError extends Error {
  constructor(message, status = 0, data = null, code = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = code;
  }
}

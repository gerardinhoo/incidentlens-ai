export interface TestErrorResponse {
  statusCode: 500;
  error: 'Internal Server Error';
  message: string;
  requestId: string;
}

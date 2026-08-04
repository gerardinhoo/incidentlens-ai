// Minimal fixture for Terraform native tests (not a real runtime package).
export const handler = async () => ({ statusCode: 200, body: 'ok' });

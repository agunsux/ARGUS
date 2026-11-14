// Deployment identity is independent of Node's optimization/runtime mode.
function authOrigin() {
  if (process.env.VERCEL_ENV === 'production') return 'https://tikum.app';
  if (process.env.VERCEL_ENV === 'preview') {
    if (!process.env.VERCEL_URL) throw new Error('PREVIEW_AUTH_ORIGIN_REQUIRED');
    const origin = new URL(`https://${process.env.VERCEL_URL}`);
    if (origin.hostname === 'tikum.app' || origin.hostname.endsWith('.tikum.app')) {
      throw new Error('PREVIEW_AUTH_ORIGIN_REJECTED');
    }
    return origin.origin;
  }
  if (process.env.APP_BASE_URL) return new URL(process.env.APP_BASE_URL).origin;
  return 'https://tikum.app';
}
module.exports = { authOrigin };
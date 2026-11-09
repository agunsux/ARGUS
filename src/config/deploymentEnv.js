/**
 * TIKUM / ARGUS — Centralized Deployment Environment Resolver
 *
 * Resolves authoritative execution environment across Vercel and local runtimes.
 *
 * CANONICAL ENVS:
 * - PREVIEW: Vercel Preview deployment (isolated staging, sandbox payment verification)
 * - PRODUCTION: Vercel Production deployment (live marketplace, real-money verification)
 * - DEVELOPMENT: Local developer runtime or Vercel local dev
 * - TEST: Automated test runner (NODE_ENV=test)
 * - UNKNOWN: Ambiguous, corrupt, or contradictory environment (FAIL CLOSED)
 *
 * SECURITY INVARIANTS:
 * 1. VERCEL=1 alone NEVER implies PRODUCTION.
 * 2. NODE_ENV=production alone on Vercel NEVER implies PRODUCTION (Preview builds also use NODE_ENV=production).
 * 3. On Vercel, VERCEL_ENV is the authoritative discriminator:
 *    - 'preview'     => PREVIEW
 *    - 'production'  => PRODUCTION
 *    - 'development' => DEVELOPMENT
 * 4. Missing or unrecognized VERCEL_ENV when VERCEL=1 evaluates to UNKNOWN (fail-closed).
 * 5. In PREVIEW, live production payment rails are STRICTLY FORBIDDEN.
 * 6. In PRODUCTION, sandbox payment credentials are STRICTLY FORBIDDEN.
 */

const DEPLOYMENT_ENV = {
  PREVIEW: 'PREVIEW',
  PRODUCTION: 'PRODUCTION',
  DEVELOPMENT: 'DEVELOPMENT',
  TEST: 'TEST',
  UNKNOWN: 'UNKNOWN'
};

let testEnvOverride = null;

/**
 * Resolves the canonical deployment environment.
 * @returns {string} One of DEPLOYMENT_ENV values
 */
function getDeploymentEnv() {
  if (testEnvOverride) {
    return testEnvOverride;
  }

  // 1. Explicit automated test runner check (only if not simulating Vercel environment)
  if (process.env.NODE_ENV === 'test' && !process.env.VERCEL_ENV && !process.env.VERCEL) {
    return DEPLOYMENT_ENV.TEST;
  }

  const isVercelRuntime = Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);

  // 2. Vercel deployment detection
  if (isVercelRuntime) {
    const rawVercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase();

    if (rawVercelEnv === 'preview') {
      return DEPLOYMENT_ENV.PREVIEW;
    }
    if (rawVercelEnv === 'production') {
      return DEPLOYMENT_ENV.PRODUCTION;
    }
    if (rawVercelEnv === 'development') {
      return DEPLOYMENT_ENV.DEVELOPMENT;
    }

    // VERCEL=1 present, but VERCEL_ENV is missing, unrecognized, or contradictory: FAIL CLOSED
    return DEPLOYMENT_ENV.UNKNOWN;
  }

  // 3. Non-Vercel runtimes (Local dev, test, or standalone Node.js server)
  if (process.env.NODE_ENV === 'production') {
    return DEPLOYMENT_ENV.PRODUCTION;
  }
  if (process.env.NODE_ENV === 'test') {
    return DEPLOYMENT_ENV.TEST;
  }

  return DEPLOYMENT_ENV.DEVELOPMENT;
}

function isVercelPreview() {
  return getDeploymentEnv() === DEPLOYMENT_ENV.PREVIEW;
}

function isProductionDeployment() {
  return getDeploymentEnv() === DEPLOYMENT_ENV.PRODUCTION;
}

function isDevelopmentDeployment() {
  const env = getDeploymentEnv();
  return env === DEPLOYMENT_ENV.DEVELOPMENT || env === DEPLOYMENT_ENV.TEST;
}

function isKnownDeployment() {
  return getDeploymentEnv() !== DEPLOYMENT_ENV.UNKNOWN;
}

/**
 * Validates Midtrans configuration against current deployment environment.
 * Fails closed on any contradictory or hazardous configuration.
 *
 * @param {Object} config - { serverKey, clientKey, isProduction }
 * @returns {Object} { allowed: boolean, reason: string|null, isSandbox: boolean, isProduction: boolean, environment: string }
 */
function validateMidtransConfiguration(config = {}) {
  const depEnv = getDeploymentEnv();
  const rawServerKey = (config.serverKey || process.env.MIDTRANS_SERVER_KEY || '').trim();
  const rawClientKey = (config.clientKey || process.env.MIDTRANS_CLIENT_KEY || '').trim();
  const serverKey = rawServerKey.replace(/^["']|["']$/g, '').trim();
  const clientKey = rawClientKey.replace(/^["']|["']$/g, '').trim();
  const rawIsProd = config.isProduction === true || process.env.MIDTRANS_IS_PRODUCTION === 'true';

  if (depEnv === DEPLOYMENT_ENV.UNKNOWN) {
    return {
      allowed: false,
      reason: 'Ambiguous or unverified deployment environment. Midtrans operations gated fail-closed.',
      isSandbox: false,
      isProduction: false,
      environment: depEnv
    };
  }

  if (depEnv === DEPLOYMENT_ENV.PREVIEW) {
    if (rawIsProd || process.env.ENABLE_MIDTRANS_PRODUCTION === 'true') {
      return {
        allowed: false,
        reason: 'Live Midtrans production mode is strictly prohibited on Preview deployments.',
        isSandbox: false,
        isProduction: false,
        environment: depEnv
      };
    }

    if (serverKey && process.env.NODE_ENV !== 'test') {
      if (serverKey.startsWith('Mid-server-')) {
        return {
          allowed: false,
          reason: 'Live production server key (Mid-server-*) detected on Preview environment. Sandbox key (SB-Mid-server-*) required.',
          isSandbox: false,
          isProduction: false,
          environment: depEnv
        };
      }
      if (!serverKey.startsWith('SB-Mid-')) {
        return {
          allowed: false,
          reason: 'Unrecognized Midtrans server key format on Preview. Expected SB-Mid-server-* for Sandbox.',
          isSandbox: false,
          isProduction: false,
          environment: depEnv
        };
      }
    }

    if (clientKey && process.env.NODE_ENV !== 'test') {
      if (clientKey.startsWith('Mid-client-')) {
        return {
          allowed: false,
          reason: 'Live production client key (Mid-client-*) detected on Preview environment. Sandbox key (SB-Mid-client-*) required.',
          isSandbox: false,
          isProduction: false,
          environment: depEnv
        };
      }
      if (!clientKey.startsWith('SB-Mid-')) {
        return {
          allowed: false,
          reason: 'Unrecognized Midtrans client key format on Preview. Expected SB-Mid-client-* for Sandbox.',
          isSandbox: false,
          isProduction: false,
          environment: depEnv
        };
      }
    }

    return {
      allowed: true,
      reason: null,
      isSandbox: true,
      isProduction: false,
      environment: depEnv
    };
  }

  if (depEnv === DEPLOYMENT_ENV.PRODUCTION) {
    if (serverKey && serverKey.startsWith('SB-Mid-')) {
      return {
        allowed: false,
        reason: 'Midtrans Sandbox credentials strictly prohibited in Production.',
        isSandbox: false,
        isProduction: false,
        environment: depEnv
      };
    }

    const isProdActive = process.env.ENABLE_MIDTRANS_PRODUCTION === 'true' && rawIsProd && Boolean(serverKey);
    return {
      allowed: isProdActive,
      reason: isProdActive ? null : 'Production merchant activation pending. Real-money transactions gated.',
      isSandbox: false,
      isProduction: true,
      environment: depEnv
    };
  }

  // Development / Test
  return {
    allowed: true,
    reason: null,
    isSandbox: !rawIsProd,
    isProduction: rawIsProd,
    environment: depEnv
  };
}

function setDeploymentEnvForTesting(env) {
  testEnvOverride = env;
}

module.exports = {
  DEPLOYMENT_ENV,
  getDeploymentEnv,
  isVercelPreview,
  isProductionDeployment,
  isDevelopmentDeployment,
  isKnownDeployment,
  validateMidtransConfiguration,
  setDeploymentEnvForTesting
};

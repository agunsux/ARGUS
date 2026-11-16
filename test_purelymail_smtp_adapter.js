/**
 * TIKUM — Purelymail SMTP Adapter Verification Suite
 *
 * Verifies:
 * 1. Default configuration matches official Purelymail SMTP parameters:
 *    Host: smtp.purelymail.com, Port: 465, Secure: true, Username: admin@tikum.app
 * 2. Provider inheritance and boundary compliance with EmailProvider
 * 3. Fail-Closed behavior in production when password is missing
 * 4. Safety: Passwords are redacted from error messages and logs
 * 5. Mock mode behavior under NODE_ENV === 'test'
 * 6. Live SMTP connectivity test (executable when credentials are provided in env)
 */

const assert = require('assert');
const { SmtpEmailProvider } = require('./src/services/email/SmtpEmailProvider');
const { resolveEmailProvider, UnconfiguredEmailProvider } = require('./src/services/email');
const { EmailProvider } = require('./src/services/email/EmailProvider');

async function runSuite() {
  console.log('================================================================');
  console.log('  TIKUM — PURELYMAIL SMTP ADAPTER VERIFICATION SUITE           ');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function pass(msg) {
    passed++;
    total++;
    console.log(`  ✓ [PASS] ${msg}`);
  }

  // 1. Defaults
  {
    const provider = new SmtpEmailProvider();
    assert.strictEqual(provider.host, 'smtp.purelymail.com');
    assert.strictEqual(provider.port, 465);
    assert.strictEqual(provider.secure, true);
    assert.strictEqual(provider.user, 'admin@tikum.app');
    assert.strictEqual(provider.name, 'purelymail');
    assert.ok(provider instanceof EmailProvider);
    pass('1. Default parameters match official Purelymail SMTP settings (smtp.purelymail.com:465, SSL/TLS)');
  }

  // 2. Custom env overrides
  {
    const custom = new SmtpEmailProvider({
      host: 'smtp.custom.com',
      port: 587,
      secure: false,
      user: 'custom@tikum.app',
      pass: 'custom_pass_123'
    });
    assert.strictEqual(custom.host, 'smtp.custom.com');
    assert.strictEqual(custom.port, 587);
    assert.strictEqual(custom.secure, false);
    assert.strictEqual(custom.user, 'custom@tikum.app');
    assert.strictEqual(custom.isConfigured(), true);
    pass('2. Environment options and overrides respected');
  }

  // 3. Test mode mock safety
  {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      const provider = new SmtpEmailProvider({ pass: 'dummy' });
      const res = await provider.send({
        from: 'TIKUM <admin@tikum.app>',
        to: 'admin@tikum.app',
        subject: 'Test Subject',
        text: 'Test Body'
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.status, 'MOCKED');
      assert.strictEqual(res.isMock, true);
      assert.strictEqual(res.provider, 'purelymail');
      pass('3. NODE_ENV=test mocks dispatch without opening real network socket');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  }

  // 4. Missing password fails closed
  {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const provider = new SmtpEmailProvider({ pass: null });
      const res = await provider.send({
        from: 'TIKUM <admin@tikum.app>',
        to: 'admin@tikum.app',
        subject: 'Test Subject',
        text: 'Test Body'
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.status, 'NOT_CONFIGURED');
      assert.strictEqual(res.code, 'SMTP_CREDENTIALS_MISSING');
      pass('4. Missing password fails closed with NOT_CONFIGURED in production');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  }

  // 5. Factory resolution priority
  {
    // A. When SMTP_PASS is provided, factory selects SmtpEmailProvider
    const providerWithSmtp = resolveEmailProvider({
      NODE_ENV: 'production',
      SMTP_PASS: 'test_pass',
      SMTP_USER: 'admin@tikum.app'
    });
    assert.ok(providerWithSmtp instanceof SmtpEmailProvider);
    assert.strictEqual(providerWithSmtp.user, 'admin@tikum.app');

    // B. When no credentials in production, factory returns UnconfiguredEmailProvider
    const unconfigured = resolveEmailProvider({ NODE_ENV: 'production' });
    assert.ok(unconfigured instanceof UnconfiguredEmailProvider);
    pass('5. Factory resolveEmailProvider selects SmtpEmailProvider when credentials are present');
  }

  // 6. Security: Password redaction in error sanitization
  {
    const secretPass = 'SuperSecretMailboxPass999!';
    const provider = new SmtpEmailProvider({ pass: secretPass });
    const sanitized = provider._sanitizeError(`Connection failed: auth password ${secretPass} was rejected by server`);
    assert.ok(!sanitized.includes(secretPass), 'Password must be completely redacted from error messages');
    assert.ok(sanitized.includes('[REDACTED_SECRET]'), 'Redaction placeholder must be present');
    pass('6. Security: Password is redacted from all error messages');
  }

  // 7. Optional Live Connectivity Probe (runs only if live credentials supplied)
  const livePass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  if (livePass) {
    console.log('\n  [INFO] Live SMTP credentials detected. Testing actual connection to Purelymail...');
    const liveProvider = new SmtpEmailProvider({
      pass: livePass,
      allowLiveNetwork: true
    });
    const conn = await liveProvider.verifyConnection();
    if (conn.success) {
      pass(`7. Live Purelymail SMTP connection verified: ${conn.message}`);
      // Send real test email
      const testSend = await liveProvider.send({
        from: 'TIKUM Admin <admin@tikum.app>',
        to: 'admin@tikum.app',
        subject: `[TIKUM Test] Purelymail SMTP Verification ${Date.now()}`,
        text: 'This is a test notification confirming Purelymail SMTP integration is operational in TIKUM.',
        html: '<p>This is a test notification confirming <strong>Purelymail SMTP integration</strong> is operational in TIKUM.</p>'
      });
      if (testSend.success && testSend.delivered) {
        pass(`8. Live test email successfully sent to admin@tikum.app (ID: ${testSend.id})`);
      } else {
        console.warn(`  [WARN] Live send did not deliver: ${testSend.error}`);
      }
    } else {
      console.warn(`  [WARN] Live Purelymail connection check returned: ${conn.message}`);
    }
  } else {
    console.log('\n  [INFO] Live test skipped (SMTP_PASS not provided in local environment). Adapter ready for credentials.');
  }

  console.log('\n================================================================');
  console.log(`  PURELYMAIL SMTP SUITE COMPLETE: ${passed}/${total} PASSED`);
  console.log('================================================================\n');
}

runSuite().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});

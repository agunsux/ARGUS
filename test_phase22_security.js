const assert = require('assert');
const { securityGuard } = require('./src/security/SecurityGuard');

let p = 0, f = 0;
const t = (n, fn) => {
  try {
    fn();
    console.log('  \u2713', n);
    p++;
  } catch (e) {
    console.log('  \u2717', n, e.message);
    f++;
  }
};

console.log('\n=== PHASE 22 SECURITY HARDENING TEST SUITE ===\n');

t('SecurityGuard validates JWT expiration and payload format', () => {
  const token = 'header.' + Buffer.from(JSON.stringify({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 10 })).toString('base64') + '.sig';
  const res = securityGuard.validateJWT(token);
  assert.ok(res.valid);
  assert.strictEqual(res.payload.sub, 'user-1');

  const expiredToken = 'header.' + Buffer.from(JSON.stringify({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) - 10 })).toString('base64') + '.sig';
  const resExp = securityGuard.validateJWT(expiredToken);
  assert.ok(!resExp.valid);
  assert.strictEqual(resExp.error, 'Token expired');
});

t('SecurityGuard enforces sliding-window rate limit', () => {
  const client = 'client-1';
  assert.ok(securityGuard.checkRateLimit(client, 2));
  assert.ok(securityGuard.checkRateLimit(client, 2));
  assert.ok(!securityGuard.checkRateLimit(client, 2)); // Limit exceeded
});

t('SecurityGuard prevents replay attacks using JTIs', () => {
  const jti = 'jti-12345';
  assert.ok(securityGuard.preventReplay(jti));
  assert.ok(!securityGuard.preventReplay(jti)); // Replay attack detected!
});

t('SecurityGuard sanitizes SQL injection patterns', () => {
  const input = "SELECT * FROM users WHERE username = 'admin' OR 1=1 --";
  const output = securityGuard.sanitizeSQL(input);
  assert.ok(!output.includes('OR 1=1'));
  assert.ok(!output.includes('--'));
});

t('SecurityGuard masks PII fields in transaction payloads', () => {
  const payload = {
    customerEmail: 'admin@domain.com',
    customerPhone: '1234567890',
    creditCard: '1234567812345678',
    nested: {
      userPassword: 'my_password'
    }
  };
  const masked = securityGuard.maskPII(payload);
  assert.strictEqual(masked.customerEmail, 'a***@domain.com');
  assert.strictEqual(masked.customerPhone, '123*****890');
  assert.strictEqual(masked.creditCard, '************5678');
  assert.strictEqual(masked.nested.userPassword, '*****');
});

console.log('\nResults: ' + p + ' passed, ' + f + ' failed, ' + (p + f) + ' total');
if (f > 0) process.exit(1);
else process.exit(0);

const crypto = require('crypto');
const { ADMIN_EMAIL, normalizeEmail } = require('../config/adminIdentity');
const { adminSecurityStore, hash } = require('../storage/AdminSecurityStore');
const { resolveEmailProvider } = require('./email');

const ACCEPTED = Object.freeze({ success: true,
  message: 'Jika identitas diizinkan, permintaan tautan masuk diproses. Periksa inbox; penerimaan email belum dikonfirmasi.' });
function failure(code, status) { return Object.assign(new Error(code), { code, status }); }

class AdminMagicLinkService {
  constructor(store = adminSecurityStore, provider = null) { this.store = store; this.provider = provider; }
  async rate(key, max, seconds) {
    if (!await this.store.limit(key, max, seconds)) throw failure('AUTH_RATE_LIMITED', 429);
  }
  async request(email, ip) {
    await this.rate(`request:ip:${ip}`, 10, 900);
    const normalized = normalizeEmail(email);
    await this.rate(`request:identity:${normalized.slice(0, 254)}`, 10, 900);
    if (normalized !== ADMIN_EMAIL) return ACCEPTED;
    // Account cooldown resets after one minute; never invalidates links already issued.
    if (!await this.store.limit(`request:account:${ADMIN_EMAIL}`, 1, 60)) return ACCEPTED;
    const user = await this.store.findAdmin();
    if (!user) throw failure('ADMIN_AUTH_UNAVAILABLE', 503);
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hash(token);
    await this.store.issue(user.id, tokenHash);
    // Fragment is not sent in HTTP request URLs, access logs, or Referer headers.
    const link = `https://tikum.app/admin/login#token=${token}`;
    try {
      const provider = this.provider || resolveEmailProvider();
      const result = await provider.send({ from: 'TIKUM <no-reply@tikum.app>', to: ADMIN_EMAIL,
        subject: 'TIKUM administrator sign-in',
        text: `Masuk ke TIKUM: ${link}\nTautan berlaku 15 menit dan hanya dapat digunakan sekali.`,
        html: `<p><a href="${link}">Masuk ke TIKUM</a></p><p>Berlaku 15 menit, sekali pakai.</p>` });
      if (!result?.success || !result.id || (result.isMock && process.env.NODE_ENV !== 'test')) {
        throw failure('ADMIN_EMAIL_UNAVAILABLE', 503);
      }
      await this.store.accept(tokenHash);
      // Provider acceptance is deliberately not described as delivery.
      return ACCEPTED;
    } catch (_) {
      await this.store.cancel(tokenHash).catch(() => {});
      throw failure('ADMIN_EMAIL_UNAVAILABLE', 503);
    }
  }
  async verify(token, ip, oldToken) {
    await this.rate(`verify:ip:${ip}`, 30, 900);
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw failure('INVALID_ADMIN_LINK', 401);
    await this.rate(`verify:token:${hash(token)}`, 5, 900);
    const sessionToken = `adm-${crypto.randomBytes(32).toString('hex')}`;
    const user = await this.store.consume(hash(token), hash(sessionToken), oldToken ? hash(oldToken) : null);
    if (!user) throw failure('INVALID_ADMIN_LINK', 401);
    return { user, sessionToken };
  }
}
module.exports = { AdminMagicLinkService, ACCEPTED };
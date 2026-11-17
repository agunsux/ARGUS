/**
 * ARGUS Payment Gateway Registry (EPIC P1.0: DOKU-Only Sandbox Readiness)
 *
 * Central registry managing regional payment providers:
 * - Primary Rail: DOKU (PT Nusa Satu Inti Artha) — PRIMARY (Sole Active Sandbox Development Rail)
 * - FROZEN: iPaymu (PT iPaymu Digital Solusindo) — Retained for history/config; no transactions/activations
 * - REMOVED: Midtrans (PT Midtrans / GoTo Financial) — Removed from active operations; history preserved
 * - REMOVED: Xendit (PT Sinar Digital Terdepan) — Removed from active operations; history preserved
 * - REMOVED: RCB (Completely deleted from production architecture)
 */

const { PaymentProvider, CapabilityUnsupportedError } = require('./PaymentProvider');
const { DokuPaymentProvider, DOKU_STATUS, DOKU_ACCOUNT_STATUS, DOKU_ESCROW_STATUS } = require('./DokuPaymentProvider');
const { MidtransPaymentProvider, MIDTRANS_STATUS } = require('./MidtransPaymentProvider');
const { XenditPaymentProvider, XENDIT_STATUS } = require('./XenditPaymentProvider');
const { IPaymuProvider, IPAYMU_STATUS } = require('./IPaymuProvider');

class PaymentManager {
  constructor() {
    this.providers = new Map();
    this.historicalProviders = new Map();
    this.defaultProvider = 'doku';

    // 1. Primary Active Provider: DOKU (Sole Active Sandbox Gateway)
    this.registerProvider(new DokuPaymentProvider());

    // 2. Frozen Provider: iPaymu (Retained for historical data and config; no checkout routing)
    this.registerProvider(new IPaymuProvider({ frozen: true }));

    // 3. Removed Providers: Midtrans and Xendit (Preserved on disk for historical audit & data retention)
    this.historicalProviders.set('midtrans', new MidtransPaymentProvider());
    this.historicalProviders.set('xendit', new XenditPaymentProvider());

    // Register DeterministicTestProvider in test environment if present
    if (process.env.NODE_ENV === 'test') {
      try {
        const { DeterministicTestProvider } = require('./DeterministicTestProvider');
        this.registerProvider(new DeterministicTestProvider());
      } catch (e) {
        // Safe skip if test provider not present
      }
    }
  }

  registerProvider(providerInstance) {
    if (!(providerInstance instanceof PaymentProvider)) {
      throw new Error('Provider must inherit from PaymentProvider');
    }
    this.providers.set(providerInstance.getName().toLowerCase(), providerInstance);
  }

  getProvider(name = this.defaultProvider) {
    const key = (name || this.defaultProvider).toLowerCase();
    const provider = this.providers.get(key);
    if (!provider) {
      if (this.historicalProviders && this.historicalProviders.has(key)) {
        return this.historicalProviders.get(key);
      }
      throw new Error(`Payment provider '${name}' not supported or registered`);
    }
    return provider;
  }

  hasProvider(name) {
    if (!name) return false;
    const key = name.toLowerCase();
    // Only active, non-removed providers count as registered active providers
    return this.providers.has(key);
  }

  setDefaultProvider(name) {
    const key = (name || '').toLowerCase();
    if (key !== 'doku') {
      throw new Error(`Cannot set provider '${name}' as default. DOKU is the sole primary payment gateway.`);
    }
    this.defaultProvider = 'doku';
  }

  /**
   * Get all active providers, their status, capabilities, and channels
   * Only returns active checkout providers (excludes FROZEN and REMOVED providers)
   */
  getAvailablePaymentMethods() {
    const list = [];
    for (const [name, provider] of this.providers.entries()) {
      const statusObj = provider.getStatus ? provider.getStatus() : { status: 'UNKNOWN' };
      // Exclude FROZEN and REMOVED providers from active payment checkout methods
      if (statusObj.status === 'FROZEN' || statusObj.status === 'REMOVED' || provider.isFrozen) {
        continue;
      }
      list.push({
        provider: name,
        country: provider.getCountry(),
        countries: provider.getSupportedCountries ? provider.getSupportedCountries() : [provider.getCountry()],
        currencies: provider.getSupportedCurrencies ? provider.getSupportedCurrencies() : ['IDR'],
        status: statusObj.status,
        is_verified: statusObj.isVerified,
        health: provider.getHealth ? provider.getHealth() : { status: 'ACTIVE' },
        capabilities: provider.getCapabilities ? provider.getCapabilities() : null,
        channels: provider.getSupportedChannels()
      });
    }
    return list;
  }
}

const paymentManager = new PaymentManager();

module.exports = {
  PaymentManager,
  paymentManager,
  PaymentProvider,
  CapabilityUnsupportedError,
  DokuPaymentProvider,
  DOKU_STATUS,
  DOKU_ACCOUNT_STATUS,
  DOKU_ESCROW_STATUS,
  MidtransPaymentProvider,
  MIDTRANS_STATUS,
  XenditPaymentProvider,
  XENDIT_STATUS,
  IPaymuProvider,
  IPAYMU_STATUS
};

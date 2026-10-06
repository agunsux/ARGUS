/**
 * ARGUS Payment Gateway Registry (Section 0, 3, 16, 23)
 *
 * Central registry managing regional payment providers:
 * - Primary Rail: DOKU (PT Nusa Satu Inti Artha) — Escrow & Hold & Release Settlement
 * - Backup #1: Midtrans (PT Midtrans / GoTo Financial) — Snap, Iris, Core API
 * - Backup #2: Xendit (PT Sinar Digital Terdepan) — xenPlatform, Invoices, Disbursements
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
    this.defaultProvider = (process.env.DEFAULT_PAYMENT_PROVIDER || 'doku').toLowerCase();

    // Register primary and backup production providers
    this.registerProvider(new DokuPaymentProvider());
    this.registerProvider(new MidtransPaymentProvider());
    this.registerProvider(new XenditPaymentProvider());
    this.registerProvider(new IPaymuProvider());

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
    const provider = this.providers.get((name || this.defaultProvider).toLowerCase());
    if (!provider) {
      throw new Error(`Payment provider '${name}' not supported or registered`);
    }
    return provider;
  }

  hasProvider(name) {
    if (!name) return false;
    return this.providers.has(name.toLowerCase());
  }

  setDefaultProvider(name) {
    if (!this.hasProvider(name)) {
      throw new Error(`Cannot set unknown provider '${name}' as default`);
    }
    this.defaultProvider = name.toLowerCase();
  }

  /**
   * Get all active providers, their status, capabilities, and channels
   */
  getAvailablePaymentMethods() {
    const list = [];
    for (const [name, provider] of this.providers.entries()) {
      list.push({
        provider: name,
        country: provider.getCountry(),
        countries: provider.getSupportedCountries ? provider.getSupportedCountries() : [provider.getCountry()],
        currencies: provider.getSupportedCurrencies ? provider.getSupportedCurrencies() : ['IDR'],
        status: provider.getStatus ? provider.getStatus().status : 'UNKNOWN',
        is_verified: provider.getStatus ? provider.getStatus().isVerified : false,
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

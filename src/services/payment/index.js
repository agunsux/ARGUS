/**
 * ARGUS Payment Gateway Registry (Part 1, 16, 17)
 * 
 * Central registry managing regional payment providers:
 * - Primary / MVP: RCB (Indonesia - IDR)
 * - Secondary / Fallback: iPaymu (Indonesia - IDR)
 * - Extensible: DOKU, Midtrans, Xendit
 */

const { PaymentProvider, CapabilityUnsupportedError } = require('./PaymentProvider');
const { RCBPaymentProvider, RCB_STATUS } = require('./RCBPaymentProvider');
const { IPaymuProvider, IPAYMU_STATUS } = require('./IPaymuProvider');

class PaymentManager {
  constructor() {
    this.providers = new Map();
    this.defaultProvider = process.env.DEFAULT_PAYMENT_PROVIDER || 'rcb';

    // Register primary providers
    this.registerProvider(new RCBPaymentProvider());
    this.registerProvider(new IPaymuProvider());

    // Register DeterministicTestProvider in test environment if available
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
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) {
      throw new Error(`Payment provider '${name}' not supported or registered`);
    }
    return provider;
  }

  hasProvider(name) {
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
        status: provider.getStatus ? provider.getStatus().status : 'UNKNOWN',
        is_verified: provider.getStatus ? provider.getStatus().isVerified : false,
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
  RCBPaymentProvider,
  RCB_STATUS,
  IPaymuProvider,
  IPAYMU_STATUS
};

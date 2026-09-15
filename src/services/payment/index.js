/**
 * ARGUS Payment Gateway Registry
 * 
 * Central registry managing regional payment providers:
 * - Default: iPaymu (Indonesia - IDR)
 * - Extensible for ASEAN: HitPay (SG), 2C2P (TH/MY/SG), Xendit (ID/PH)
 */

const { PaymentProvider } = require('./PaymentProvider');
const { IPaymuProvider } = require('./IPaymuProvider');

class PaymentManager {
  constructor() {
    this.providers = new Map();
    this.defaultProvider = 'ipaymu';

    // Register primary Indonesia provider
    this.registerProvider(new IPaymuProvider());
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

  /**
   * Get all active providers and their channels
   */
  getAvailablePaymentMethods() {
    const list = [];
    for (const [name, provider] of this.providers.entries()) {
      list.push({
        provider: name,
        country: provider.getCountry(),
        status: provider.getStatus ? provider.getStatus().status : 'UNKNOWN',
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
  IPaymuProvider
};

# TIKUM / ARGUS — Provider-Independent Payment Architecture

## 1. Provider Abstraction Interface
The payment system is decoupled from any individual gateway. All gateways implement the canonical `PaymentProvider` interface:
```javascript
class PaymentProvider {
  getName();
  getCountry();
  getStatus();
  getSupportedChannels();
  isEscrowSupported(channelCode);
  async createPayment({ orderId, amount, currency, channel, buyer, requiresEscrow });
  async getPaymentStatus({ orderId, providerRef });
  async capture({ orderId, providerRef, amount });
  async refund({ orderId, providerRef, amount, reason });
  async cancel({ orderId, providerRef, reason });
  verifyWebhook(headers, body);
  parseWebhook(payload);
}
```

## 2. Multi-Provider Registry
The `PaymentManager` maintains active providers (e.g. `ipaymu` for Indonesia, extensible to `xendit`, `hitpay`, `2c2p` across ASEAN).

## 3. Production Safety Gates
While payment provider verification is pending, ARGUS enforces explicit safety gates:
- `NO_REAL_PAYMENT: true`
- `NO_REAL_SETTLEMENT: true`
- `NO_FAKE_PAYMENT_SUCCESS: true`
- `NO_FAKE_ESCROW_BALANCE: true`
- `NO_FAKE_GMV: true`

Calling payment operations in production returns:
`HTTP 503 — PAYMENT_PROVIDER_PENDING_VERIFICATION`.

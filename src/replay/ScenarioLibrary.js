/**
 * ScenarioLibrary — Phase 18 Historical Intelligence Laboratory
 * 
 * Provides predefined specifications/templates for various fraud patterns.
 */
class ScenarioLibrary {
  static getTemplates() {
    return {
      'marketplace-scam': {
        id: 'marketplace-scam',
        name: 'Marketplace Scam Scenario',
        description: 'Rapid low-value payments to an unverified merchant account',
        transactions: [
          { transactionId: 'tx-m1', price: 150000, actorRole: 'buyer' },
          { transactionId: 'tx-m2', price: 200000, actorRole: 'buyer' },
          { transactionId: 'tx-m3', price: 250000, actorRole: 'buyer' }
        ],
        risk: { riskScore: 40, riskLevel: 'MEDIUM' },
        inference: { prediction: 'FRAUD', probability: 0.75 },
        evidence: [{ id: 'evd-m1', type: 'merchant_complaint' }]
      },
      'investment-fraud': {
        id: 'investment-fraud',
        name: 'Investment Fraud Scenario',
        description: 'Large payment to high-yield investment scheme with zero historical trust',
        transactions: [
          { transactionId: 'tx-inv1', price: 25000000, actorRole: 'investor' }
        ],
        risk: { riskScore: 85, riskLevel: 'HIGH' },
        inference: { prediction: 'FRAUD', probability: 0.95 },
        evidence: []
      },
      'otp-theft': {
        id: 'otp-theft',
        name: 'OTP Theft Account Takeover',
        description: 'Sudden device change followed by immediate full balance transfer',
        transactions: [
          { transactionId: 'tx-otp1', price: 5000000, actorRole: 'sender' }
        ],
        risk: { riskScore: 90, riskLevel: 'HIGH' },
        inference: { prediction: 'FRAUD', probability: 0.98 },
        evidence: [{ id: 'evd-otp1', type: 'device_anomaly' }]
      },
      'apk-malware': {
        id: 'apk-malware',
        name: 'APK Malware Control takeover',
        description: 'Automated transfer via untrusted remote access app package',
        transactions: [
          { transactionId: 'tx-apk1', price: 8000000, actorRole: 'sender' }
        ],
        risk: { riskScore: 95, riskLevel: 'HIGH' },
        inference: { prediction: 'FRAUD', probability: 0.99 },
        evidence: [{ id: 'evd-apk1', type: 'malware_signature' }]
      },
      'courier-scam': {
        id: 'courier-scam',
        name: 'Courier Delivery Scam',
        description: 'Phishing payment request disguised as shipping/courier fee',
        transactions: [
          { transactionId: 'tx-cour1', price: 50000, actorRole: 'victim' }
        ],
        risk: { riskScore: 30, riskLevel: 'LOW' },
        inference: { prediction: 'FRAUD', probability: 0.65 },
        evidence: []
      },
      'romance-scam': {
        id: 'romance-scam',
        name: 'Romance Scam Scenario',
        description: 'Repeated high-value remittance to a newly linked overseas profile',
        transactions: [
          { transactionId: 'tx-rom1', price: 12000000, actorRole: 'sender' }
        ],
        risk: { riskScore: 70, riskLevel: 'MEDIUM' },
        inference: { prediction: 'FRAUD', probability: 0.8 },
        evidence: []
      },
      'fake-bank': {
        id: 'fake-bank',
        name: 'Fake Banking Portal Phishing',
        description: 'Full credentials entry on a domain spoofing official portal',
        transactions: [
          { transactionId: 'tx-fb1', price: 4000000, actorRole: 'customer' }
        ],
        risk: { riskScore: 88, riskLevel: 'HIGH' },
        inference: { prediction: 'FRAUD', probability: 0.92 },
        evidence: [{ id: 'evd-fb1', type: 'phishing_url' }]
      },
      'loan-scam': {
        id: 'loan-scam',
        name: 'Fake Loan Processing Fee',
        description: 'Upfront administrative fee payment to secure a non-existent loan',
        transactions: [
          { transactionId: 'tx-loan1', price: 1500000, actorRole: 'borrower' }
        ],
        risk: { riskScore: 65, riskLevel: 'MEDIUM' },
        inference: { prediction: 'FRAUD', probability: 0.72 },
        evidence: []
      },
      'qr-scam': {
        id: 'qr-scam',
        name: 'QR Code Spoofing',
        description: 'Payment scan redirection replacing a trusted merchant QR',
        transactions: [
          { transactionId: 'tx-qr1', price: 350000, actorRole: 'payer' }
        ],
        risk: { riskScore: 50, riskLevel: 'MEDIUM' },
        inference: { prediction: 'FRAUD', probability: 0.7 },
        evidence: [{ id: 'evd-qr1', type: 'qr_redirection' }]
      }
    };
  }

  static get(id) {
    const templates = ScenarioLibrary.getTemplates();
    return templates[id] || null;
  }
}

module.exports = ScenarioLibrary;

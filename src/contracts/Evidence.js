const BaseContract = require('./BaseContract');

/**
 * Evidence Contract
 * 
 * Enforces schema of an Evidence canonical object.
 */
class Evidence extends BaseContract {
  constructor(data = {}) {
    super(data);
    this.transactionId = data.transactionId || '';
    this.eventType = data.eventType || '';
    this.actorId = data.actorId || 'system';
    this.deviceFingerprint = data.deviceFingerprint || 'system';
    this.evidenceBundleId = data.evidenceBundleId || '';
    this.previousEvidenceId = data.previousEvidenceId || null;
    this.signature = data.signature || '';
    this.files = Array.isArray(data.files) ? data.files : [];
  }

  validate() {
    const res = super.validate();
    const errors = res.errors;

    if (typeof this.transactionId !== 'string' || !this.transactionId.trim()) {
      errors.push('transactionId must be a non-empty string');
    }
    if (typeof this.eventType !== 'string' || !this.eventType.trim()) {
      errors.push('eventType must be a non-empty string');
    }
    if (typeof this.actorId !== 'string' || !this.actorId.trim()) {
      errors.push('actorId must be a non-empty string');
    }
    if (typeof this.deviceFingerprint !== 'string' || !this.deviceFingerprint.trim()) {
      errors.push('deviceFingerprint must be a non-empty string');
    }
    if (typeof this.signature !== 'string' || !this.signature.trim()) {
      errors.push('signature must be a non-empty string');
    }
    if (!Array.isArray(this.files)) {
      errors.push('files must be an array');
    }

    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      transactionId: this.transactionId,
      eventType: this.eventType,
      actorId: this.actorId,
      deviceFingerprint: this.deviceFingerprint,
      evidenceBundleId: this.evidenceBundleId,
      previousEvidenceId: this.previousEvidenceId,
      signature: this.signature,
      files: this.files
    };
  }
}

module.exports = Evidence;

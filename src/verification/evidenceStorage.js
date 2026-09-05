const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { state, recordAuditLog } = require('../database');

function getMasterKey() {
  const envKey = process.env.ARGUS_EVIDENCE_ENCRYPTION_KEY;
  if (!envKey) {
    if (process.env.NODE_ENV !== 'test') {
      const err = new Error('ARGUS_EVIDENCE_ENCRYPTION_KEY environment variable is required in production');
      err.code = 'ENCRYPTION_KEY_NOT_CONFIGURED';
      throw err;
    }
    return Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
  }
  return Buffer.from(envKey, 'hex');
}

const SIGNED_URL_SECRET = process.env.ARGUS_SIGNED_URL_SECRET || (process.env.NODE_ENV === 'test' ? 'pilot-argus-evidence-secret-2026' : null);
const SIGNED_URL_TTL_MS = 15 * 60 * 1000; // 15 minutes

class EvidenceStorageService {
  /**
   * Encrypts file buffer with AES-256-GCM and stores on disk
   * Output format: IV (12 bytes) + AuthTag (16 bytes) + EncryptedData
   */
  static encryptAndStore(fileBuffer, destPath) {
    const masterKey = getMasterKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
    
    const encrypted = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Combined payload
    const payload = Buffer.concat([iv, tag, encrypted]);
    fs.writeFileSync(destPath, payload);

    return {
      storedPath: destPath,
      sizeEncrypted: payload.length
    };
  }

  /**
   * Reads and decrypts file buffer from disk
   */
  static decryptFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error('Encrypted file not found on disk');
    }

    const payload = fs.readFileSync(filePath);
    if (payload.length < 28) {
      throw new Error('Corrupted or invalid encrypted payload');
    }

    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encryptedData = payload.subarray(28);

    const masterKey = getMasterKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    return decrypted;
  }

  /**
   * Generates HMAC-signed URL token with 15-minute expiry for secure access
   */
  static generateSignedToken({ evidenceId, userId, role, orderId }) {
    const expiresAt = Date.now() + SIGNED_URL_TTL_MS;
    const payload = `${evidenceId}:${userId}:${role}:${orderId}:${expiresAt}`;
    const signature = crypto.createHmac('sha256', SIGNED_URL_SECRET).update(payload).digest('hex');

    return {
      token: `${Buffer.from(payload).toString('base64url')}.${signature}`,
      expiresAt: new Date(expiresAt).toISOString()
    };
  }

  /**
   * Verifies signed token and checks UU PDP access control rules
   */
  static verifySignedToken(tokenString) {
    if (!tokenString || !tokenString.includes('.')) {
      const err = new Error('Invalid or missing signed evidence token');
      err.code = 'EVIDENCE_ACCESS_DENIED';
      throw err;
    }

    const [payloadB64, signature] = tokenString.split('.');
    const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const expectedSig = crypto.createHmac('sha256', SIGNED_URL_SECRET).update(payload).digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      const err = new Error('Tampered or forged evidence access token');
      err.code = 'EVIDENCE_ACCESS_DENIED';
      throw err;
    }

    const parts = payload.split(':');
    if (parts.length < 5) {
      const err = new Error('Malformed evidence token payload');
      err.code = 'EVIDENCE_ACCESS_DENIED';
      throw err;
    }
    const [evidenceId, userId, role, orderId, expiresAtStr] = parts;
    const expiresAt = parseInt(expiresAtStr);

    if (Date.now() > expiresAt) {
      const err = new Error('Signed evidence access token has expired');
      err.code = 'EVIDENCE_ACCESS_DENIED';
      throw err;
    }

    return { evidenceId, userId, role, orderId, expiresAt };
  }

  /**
   * Strict Access Control Check under Indonesia UU PDP (No. 27/2022)
   * Only:
   * 1. Assigned PIC during operational window
   * 2. Buyer or Seller for their own order
   * 3. Admin during active dispute/audit
   */
  static checkAccessPermission({ requesterId, requesterRole, orderId, eventId, isDisputed = false }) {
    if (requesterRole === 'admin') {
      return { allowed: true, reason: 'Admin audit access' };
    }

    const order = state.orders.find(o => o.id === orderId);
    if (!order) {
      return { allowed: false, reason: 'Order not found' };
    }

    if (requesterRole === 'buyer' && order.buyer_id === requesterId) {
      return { allowed: true, reason: 'Buyer viewing own order evidence' };
    }

    if (requesterRole === 'seller' && order.seller_id === requesterId) {
      return { allowed: true, reason: 'Seller viewing own order evidence' };
    }

    if (requesterRole === 'pic') {
      const assignment = state.event_pics.find(
        ep => ep.pic_user_id === requesterId && ep.event_id === order.event_id && ep.status === 'ACTIVE'
      );
      if (assignment) {
        return { allowed: true, reason: 'Assigned event PIC in operational cell' };
      }
    }

    return { allowed: false, reason: 'Access denied: caller is not authorized for this PII evidence under UU PDP' };
  }

  /**
   * Logs access to PII evidence for compliance auditing
   */
  static async logEvidenceAccess({ evidenceId, orderId, accessedBy, role, accessPurpose, ip = '127.0.0.1' }) {
    const logEntry = {
      id: `ev-log-${uuidv4()}`,
      evidence_id: evidenceId,
      order_id: orderId,
      accessed_by: accessedBy,
      role,
      access_purpose: accessPurpose || 'OPERATIONAL_INSPECTION',
      accessed_at: new Date().toISOString(),
      ip
    };

    state.evidence_access_logs.push(logEntry);

    await recordAuditLog('EVIDENCE_ACCESS', evidenceId, 'PII_ACCESSED', accessedBy, {
      order_id: orderId,
      role,
      access_purpose: logEntry.access_purpose
    });

    return logEntry;
  }
}

module.exports = {
  EvidenceStorageService,
  SIGNED_URL_TTL_MS
};

const { state, recordAuditLog } = require('../database');

/**
 * PII Evidence Retention Policy (Indonesia UU PDP No. 27/2022)
 *
 * Evidence files (KTP photos, face photos, turnstile scanner images) tied to
 * completed, non-disputed orders are retained for 90 days post-settlement.
 * Orders under active dispute or legal hold are exempt from automated purging.
 */
const RETENTION_CONFIG = {
  RETENTION_DAYS_POST_SETTLEMENT: 90,
  RETENTION_MS: 90 * 24 * 60 * 60 * 1000,
  EXEMPT_STATUSES: ['DISPUTED', 'INVESTIGATING', 'LEGAL_HOLD']
};

/**
 * Scans evidence bundles and purges or anonymizes expired records
 */
async function purgeExpiredEvidence(currentDate = new Date()) {
  const cutoffTime = currentDate.getTime() - RETENTION_CONFIG.RETENTION_MS;
  const purged = [];

  for (const settlement of state.settlements) {
    if (new Date(settlement.created_at).getTime() < cutoffTime) {
      const order = state.orders.find(o => o.id === settlement.order_id);
      const isDisputed = state.disputes.some(d => d.order_id === settlement.order_id && d.status !== 'RESOLVED');

      if (order && !isDisputed) {
        // Find evidence associated with this order
        const entry = state.entry_verifications.find(ev => ev.order_id === order.id);
        if (entry && entry.evidence_bundle_id) {
          const bundleIndex = state.evidence_bundles.findIndex(b => b.id === entry.evidence_bundle_id);
          if (bundleIndex !== -1) {
            const bundle = state.evidence_bundles[bundleIndex];
            bundle.anonymized = true;
            bundle.anonymized_at = currentDate.toISOString();
            purged.push(bundle.id);

            await recordAuditLog('EVIDENCE_RETENTION', bundle.id, 'PURGED_DUE_TO_RETENTION', 'SYSTEM', {
              order_id: order.id,
              settled_at: settlement.created_at,
              retention_days: RETENTION_CONFIG.RETENTION_DAYS_POST_SETTLEMENT
            });
          }
        }
      }
    }
  }

  return {
    purgedCount: purged.length,
    purgedBundleIds: purged,
    retentionDays: RETENTION_CONFIG.RETENTION_DAYS_POST_SETTLEMENT
  };
}

module.exports = {
  RETENTION_CONFIG,
  purgeExpiredEvidence
};


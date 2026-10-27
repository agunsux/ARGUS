/**
 * TIKUM / ARGUS — Admin Transaction Control Center Service
 *
 * Operational and Financial Command Engine providing:
 * 1. Three-color transaction triage (RED = Hold / Action Required, YELLOW = In Progress / Pending,
 *    GREEN = Ready for Payout, PAID_OUT = Disbursed / Terminal).
 * 2. Durable truthful aggregations (Never fabricated; real database counts and sums).
 * 3. Paginated, filterable transaction oversight with operational factors and remaining milestones.
 * 4. Chronological audit timeline unifying orders, payments, tickets, PIC entries, incidents, disputes, and ledger entries.
 * 5. Strict least-privilege action handlers for administrative holds and payout execution.
 */

const { state, recordAuditLog } = require('../../database');
const { PayoutEligibilityEvaluator, COLOR_STATUS } = require('../settlement/PayoutEligibilityEvaluator');
const { SettlementService } = require('../settlementService');
const { IncidentService } = require('../../venue/IncidentService');
const { getUserRepository, getMarketplaceRepository, getMoneyRepository, isProductionRuntime } = require('../../storage');

function mergeUniqueById(primary = [], secondary = []) {
  const map = new Map();
  for (const item of primary) {
    if (item && item.id) map.set(item.id, item);
  }
  for (const item of secondary) {
    if (item && item.id && !map.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

class TransactionControlCenterService {
  /**
   * Hydrates all administrative entities across PostgreSQL and memory.
   */
  static async hydrateEntities() {
    const isProd = isProductionRuntime();
    const userRepo = getUserRepository();
    const marketplaceRepo = getMarketplaceRepository();
    const moneyRepo = getMoneyRepository();

    let repoUsers = [];
    let repoListings = [];
    let repoTickets = [];
    let repoOrders = [];
    let repoEscrows = [];
    let repoSettlements = [];
    let repoDisputes = [];

    try {
      [
        repoUsers,
        repoListings,
        repoTickets,
        repoOrders,
        repoEscrows,
        repoSettlements,
        repoDisputes
      ] = await Promise.all([
        userRepo && typeof userRepo.listAllUsers === 'function' ? userRepo.listAllUsers() : [],
        marketplaceRepo && typeof marketplaceRepo.listAllListings === 'function' ? marketplaceRepo.listAllListings(500) : [],
        marketplaceRepo && typeof marketplaceRepo.listAllTickets === 'function' ? marketplaceRepo.listAllTickets(500) : [],
        moneyRepo && typeof moneyRepo.listAllOrders === 'function' ? moneyRepo.listAllOrders(500) : [],
        moneyRepo && typeof moneyRepo.listAllEscrows === 'function' ? moneyRepo.listAllEscrows(500) : [],
        moneyRepo && typeof moneyRepo.listAllSettlements === 'function' ? moneyRepo.listAllSettlements(500) : [],
        moneyRepo && typeof moneyRepo.listAllDisputes === 'function' ? moneyRepo.listAllDisputes(500) : []
      ]);
    } catch (err) {
      if (isProd) throw err;
    }

    const allUsers = mergeUniqueById(repoUsers, state.users || []);
    const allListings = mergeUniqueById(repoListings, state.listings || []);
    const allTickets = mergeUniqueById(repoTickets, state.tickets || []);
    const allOrders = mergeUniqueById(repoOrders, state.orders || []);
    const allEscrows = mergeUniqueById(repoEscrows, state.escrows || []);
    const allSettlements = mergeUniqueById(repoSettlements, state.settlement_records || state.settlements || []);
    const allDisputes = mergeUniqueById(repoDisputes, state.disputes || []);
    const allIncidents = state.incidents || [];
    const allVerifications = state.entry_verifications || [];
    const allEvents = state.events || [];
    const allSellerProfiles = state.seller_profiles || [];
    const allAdminHolds = state.admin_holds || [];

    return {
      users: allUsers,
      listings: allListings,
      tickets: allTickets,
      orders: allOrders,
      escrows: allEscrows,
      settlements: allSettlements,
      disputes: allDisputes,
      incidents: allIncidents,
      verifications: allVerifications,
      events: allEvents,
      sellerProfiles: allSellerProfiles,
      adminHolds: allAdminHolds
    };
  }

  /**
   * Retrieves control center overview metrics and paginated evaluated transactions.
   */
  static async getControlCenterOverview({
    page = 1,
    limit = 20,
    status = 'ALL',
    search = '',
    eventId = null,
    sortBy = 'created_at',
    sortOrder = 'desc'
  } = {}) {
    const data = await this.hydrateEntities();
    const now = new Date();

    const evaluatedTransactions = [];
    let countRed = 0;
    let countYellow = 0;
    let countGreen = 0;
    let countPaidOut = 0;
    let totalHeldAmount = 0;
    let totalReadyPayoutAmount = 0;
    let totalDisbursedAmount = 0;

    for (const order of data.orders) {
      const orderId = order.id;
      const escrow = data.escrows.find(e => e.order_id === orderId) || null;
      const ticketId = order.ticket_id || (escrow ? escrow.ticket_id : null);
      const ticket = ticketId ? data.tickets.find(t => t.id === ticketId || t.ticket_id === ticketId) : null;
      const matchedEventId = order.event_id || order.canonical_event_id || (ticket ? (ticket.event_id || ticket.canonical_event_id) : null);
      const event = matchedEventId ? data.events.find(e => e.id === matchedEventId) : null;

      const buyer = data.users.find(u => u.id === order.buyer_id) || null;
      const seller = data.users.find(u => u.id === order.seller_id) || null;
      const sellerProfile = data.sellerProfiles.find(p => p.user_id === order.seller_id) || seller;

      const orderDisputes = data.disputes.filter(d => d.order_id === orderId);
      const orderIncidents = data.incidents.filter(i => i.order_id === orderId);
      const entryVerification = data.verifications.find(v => v.order_id === orderId) || null;
      const settlement = data.settlements.find(s => s.order_id === orderId) || null;
      const adminHold = data.adminHolds.find(h => h.order_id === orderId && (h.active === true || h.status === 'ACTIVE')) || null;

      const evaluation = PayoutEligibilityEvaluator.evaluate({
        order,
        escrow,
        ticket,
        event,
        sellerProfile,
        disputes: orderDisputes,
        incidents: orderIncidents,
        entryVerification,
        settlement,
        adminHold,
        now
      });

      // Update truthful aggregate sums and counts
      if (evaluation.colorStatus === COLOR_STATUS.RED) {
        countRed++;
        totalHeldAmount += evaluation.grossAmount;
      } else if (evaluation.colorStatus === COLOR_STATUS.YELLOW) {
        countYellow++;
        totalHeldAmount += evaluation.grossAmount;
      } else if (evaluation.colorStatus === COLOR_STATUS.GREEN) {
        countGreen++;
        totalReadyPayoutAmount += evaluation.netSellerPayout;
      } else if (evaluation.colorStatus === COLOR_STATUS.PAID_OUT) {
        countPaidOut++;
        totalDisbursedAmount += (settlement ? Number(settlement.amount || evaluation.netSellerPayout) : evaluation.netSellerPayout);
      }

      const item = {
        orderId,
        orderStatus: order.status,
        canonicalEventId: matchedEventId || 'N/A',
        eventTitle: event ? (event.title || event.name) : 'Unknown Event',
        eventDate: event ? (event.date || event.start_date || 'N/A') : 'N/A',
        buyerId: order.buyer_id,
        buyerName: buyer ? (buyer.name || buyer.email) : 'Buyer',
        sellerId: order.seller_id,
        sellerName: seller ? (seller.name || seller.email) : 'Seller',
        grossAmount: evaluation.grossAmount,
        netSellerPayout: evaluation.netSellerPayout,
        platformFee: evaluation.platformFee,
        currency: evaluation.currency,
        colorStatus: evaluation.colorStatus,
        badgeLabel: evaluation.badgeLabel,
        payoutEligible: evaluation.payoutEligible,
        isPaidOut: evaluation.isPaidOut,
        factors: evaluation.factors,
        evaluationReasons: evaluation.evaluationReasons,
        blockingIssues: evaluation.blockingIssues,
        actionRequired: evaluation.actionRequired,
        payoutReference: evaluation.payoutReference,
        disbursedAt: evaluation.disbursedAt,
        hasAdminHold: Boolean(adminHold || order.admin_hold),
        holdReason: adminHold ? adminHold.reason : (order.hold_reason || null),
        disputeCount: orderDisputes.length,
        incidentCount: orderIncidents.length,
        entryStatus: entryVerification ? entryVerification.status : 'NOT_RECORDED',
        createdAt: order.created_at || order.createdAt || new Date().toISOString(),
        updatedAt: order.updated_at || order.updatedAt || new Date().toISOString()
      };

      evaluatedTransactions.push(item);
    }

    // Apply filtering
    let filtered = evaluatedTransactions;

    if (status && status.toUpperCase() !== 'ALL') {
      const targetStatus = status.toUpperCase();
      filtered = filtered.filter(tx => tx.colorStatus === targetStatus);
    }

    if (eventId) {
      filtered = filtered.filter(tx => tx.canonicalEventId === eventId);
    }

    if (search && search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(tx =>
        tx.orderId.toLowerCase().includes(q) ||
        tx.buyerName.toLowerCase().includes(q) ||
        tx.sellerName.toLowerCase().includes(q) ||
        tx.eventTitle.toLowerCase().includes(q) ||
        (tx.payoutReference && tx.payoutReference.toLowerCase().includes(q))
      );
    }

    // Sort
    filtered.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const totalCount = filtered.length;
    const totalPages = Math.ceil(totalCount / limitNum) || 1;
    const paginated = filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    return {
      summary: {
        total_transactions: evaluatedTransactions.length,
        count_red: countRed,
        count_yellow: countYellow,
        count_green: countGreen,
        count_paid_out: countPaidOut,
        total_held_amount: totalHeldAmount,
        total_ready_payout_amount: totalReadyPayoutAmount,
        total_disbursed_amount: totalDisbursedAmount,
        currency: 'IDR'
      },
      transactions: paginated,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalPages,
        totalCount
      }
    };
  }

  /**
   * Retrieves unified chronological audit timeline for a specific order.
   */
  static async getTransactionTimeline(orderId) {
    const data = await this.hydrateEntities();
    const order = data.orders.find(o => o.id === orderId);
    if (!order) {
      const err = new Error(`Order '${orderId}' not found`);
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    const escrow = data.escrows.find(e => e.order_id === orderId) || null;
    const ticketId = order.ticket_id || (escrow ? escrow.ticket_id : null);
    const ticket = ticketId ? data.tickets.find(t => t.id === ticketId || t.ticket_id === ticketId) : null;
    const eventId = order.event_id || order.canonical_event_id || (ticket ? (ticket.event_id || ticket.canonical_event_id) : null);
    const event = eventId ? data.events.find(e => e.id === eventId) : null;
    const buyer = data.users.find(u => u.id === order.buyer_id) || null;
    const seller = data.users.find(u => u.id === order.seller_id) || null;
    const sellerProfile = data.sellerProfiles.find(p => p.user_id === order.seller_id) || seller;

    const orderDisputes = data.disputes.filter(d => d.order_id === orderId);
    const orderIncidents = data.incidents.filter(i => i.order_id === orderId);
    const entryVerification = data.verifications.find(v => v.order_id === orderId) || null;
    const settlement = data.settlements.find(s => s.order_id === orderId) || null;
    const adminHold = data.adminHolds.find(h => h.order_id === orderId && (h.active === true || h.status === 'ACTIVE')) || null;

    const evaluation = PayoutEligibilityEvaluator.evaluate({
      order,
      escrow,
      ticket,
      event,
      sellerProfile,
      disputes: orderDisputes,
      incidents: orderIncidents,
      entryVerification,
      settlement,
      adminHold
    });

    const timeline = [];

    // 1. Order Creation
    timeline.push({
      timestamp: order.created_at || order.createdAt || new Date().toISOString(),
      category: 'ORDER',
      action: 'ORDER_CREATED',
      title: 'Order Placed',
      actor: order.buyer_id,
      actorRole: 'buyer',
      description: `Purchase order created for ${event ? event.title : 'Event'} - Total: IDR ${Number(order.buyer_total || order.total_amount || 0).toLocaleString('id-ID')}`,
      metadata: { orderId, grossAmount: order.buyer_total || order.total_amount }
    });

    // 2. Escrow Funded / Payment Confirmation
    if (escrow && escrow.funded_at) {
      timeline.push({
        timestamp: escrow.funded_at,
        category: 'PAYMENT',
        action: 'PAYMENT_CONFIRMED',
        title: 'Payment Captured & Internal Platform Hold Activated',
        actor: 'PAYMENT_GATEWAY',
        actorRole: 'system',
        description: `Funds received via ${order.provider || 'gateway'}; held in Tikum internal platform ledger. Escrow ID: ${escrow.id}`,
        metadata: { escrowId: escrow.id, amount: escrow.amount, heldBy: escrow.held_by || 'TIKUM_PLATFORM_LEDGER' }
      });
    }

    // 3. Ticket Verification
    if (ticket) {
      timeline.push({
        timestamp: ticket.created_at || order.created_at,
        category: 'VERIFICATION',
        action: 'TICKET_STATUS_UPDATED',
        title: `Ticket Status: ${ticket.status}`,
        actor: ticket.seller_id,
        actorRole: 'seller',
        description: `Ticket asset ${ticket.id} (${ticket.ticket_type || 'STANDARD'}) in status ${ticket.status}`,
        metadata: { ticketId: ticket.id, barcodeHash: ticket.barcode_hash ? `${ticket.barcode_hash.substring(0, 8)}...` : null }
      });
    }

    // 4. Ticket Delivery / Transfer
    if (ticket && ['TRANSFERRED', 'DELIVERED', 'REDEEMED', 'USED'].includes(ticket.status)) {
      timeline.push({
        timestamp: ticket.transferred_at || ticket.updated_at || order.updated_at,
        category: 'DELIVERY',
        action: 'TICKET_TRANSFERRED',
        title: 'Ticket Delivered / Transferred to Buyer',
        actor: order.seller_id,
        actorRole: 'seller',
        description: 'Electronic ticket credentials transferred to buyer account',
        metadata: { ticketId: ticket.id }
      });
    }

    // 5. PIC Venue Entry / Field Gate Check-in
    if (entryVerification) {
      timeline.push({
        timestamp: entryVerification.verified_at || entryVerification.timestamp,
        category: 'VENUE_ENTRY',
        action: `GATE_ENTRY_${entryVerification.status}`,
        title: `Venue Gate Verification: ${entryVerification.status}`,
        actor: entryVerification.pic_id,
        actorRole: 'pic',
        description: `Gate: ${entryVerification.gate || 'Main Gate'} | Status: ${entryVerification.status} | Notes: ${entryVerification.notes || 'No notes'}`,
        metadata: {
          verificationId: entryVerification.id,
          gate: entryVerification.gate,
          picId: entryVerification.pic_id,
          nextAction: entryVerification.next_action
        }
      });
    }

    // 6. Incidents
    for (const inc of orderIncidents) {
      timeline.push({
        timestamp: inc.created_at,
        category: 'INCIDENT',
        action: `INCIDENT_${inc.type}`,
        title: `Incident Logged: ${inc.type}`,
        actor: inc.reporter_id,
        actorRole: inc.reporter_role || 'pic',
        description: `Severity: ${inc.severity} | Status: ${inc.status} | Description: ${inc.description}`,
        metadata: { incidentId: inc.incident_id || inc.id, severity: inc.severity, status: inc.status }
      });
      if (inc.resolution) {
        timeline.push({
          timestamp: inc.resolution.resolved_at,
          category: 'INCIDENT',
          action: 'INCIDENT_RESOLVED',
          title: `Incident Resolved: ${inc.type}`,
          actor: inc.resolution.resolved_by,
          actorRole: 'admin',
          description: `Outcome: ${inc.resolution.outcome} | Notes: ${inc.resolution.resolution_notes}`,
          metadata: { incidentId: inc.incident_id || inc.id }
        });
      }
    }

    // 7. Disputes
    for (const d of orderDisputes) {
      timeline.push({
        timestamp: d.created_at,
        category: 'DISPUTE',
        action: 'DISPUTE_OPENED',
        title: `Dispute Opened: ${d.reason}`,
        actor: d.buyer_id,
        actorRole: 'buyer',
        description: `Claim: ${d.claim_details || d.reason} | Status: ${d.status}`,
        metadata: { disputeId: d.dispute_id || d.id, status: d.status }
      });
      if (d.resolved_at) {
        timeline.push({
          timestamp: d.resolved_at,
          category: 'DISPUTE',
          action: 'DISPUTE_RESOLVED',
          title: `Dispute Resolved: ${d.outcome}`,
          actor: 'DISPUTE_OFFICER',
          actorRole: 'admin',
          description: `Decision: ${d.decision_notes || d.outcome}`,
          metadata: { disputeId: d.dispute_id || d.id, outcome: d.outcome }
        });
      }
    }

    // 8. Administrative Holds
    for (const hold of data.adminHolds.filter(h => h.order_id === orderId)) {
      timeline.push({
        timestamp: hold.created_at,
        category: 'HOLD',
        action: hold.active ? 'ADMIN_HOLD_PLACED' : 'ADMIN_HOLD_RELEASED',
        title: hold.active ? 'Administrative Hold Applied' : 'Administrative Hold Released',
        actor: hold.operator_id,
        actorRole: 'admin',
        description: hold.reason,
        metadata: { holdId: hold.id, operatorId: hold.operator_id }
      });
    }

    // 9. Settlement Disbursed
    if (settlement) {
      timeline.push({
        timestamp: settlement.disbursed_at || settlement.executed_at || settlement.created_at,
        category: 'PAYOUT',
        action: 'PAYOUT_DISBURSED',
        title: 'Seller Payout Executed',
        actor: settlement.officer_id || 'SYSTEM',
        actorRole: 'finance',
        description: `Amount IDR ${Number(settlement.amount).toLocaleString('id-ID')} disbursed via ${settlement.settlement_mode || 'MANUAL_BANK_TRANSFER'}. Reference: ${settlement.payout_ref}`,
        metadata: {
          settlementId: settlement.id,
          amount: settlement.amount,
          payoutRef: settlement.payout_ref,
          bankAccount: settlement.bank_account
        }
      });
    }

    // Sort chronologically ascending
    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return {
      orderId,
      order: {
        id: order.id,
        status: order.status,
        canonicalEventId: eventId,
        eventTitle: event ? event.title : 'Event',
        eventDate: event ? event.date : null,
        buyer: buyer ? { id: buyer.id, name: buyer.name, email: buyer.email } : { id: order.buyer_id },
        seller: seller ? { id: seller.id, name: seller.name, email: seller.email } : { id: order.seller_id },
        grossAmount: evaluation.grossAmount,
        netSellerPayout: evaluation.netSellerPayout,
        platformFee: evaluation.platformFee
      },
      currentEvaluation: evaluation,
      timeline
    };
  }

  /**
   * Places an administrative hold on an order (forces status to RED).
   */
  static async placeAdminHold({ orderId, reason, operatorId, notes = null }) {
    if (!reason || reason.trim().length < 4) {
      const err = new Error('Hold reason must be provided (minimum 4 characters)');
      err.code = 'INVALID_HOLD_REASON';
      throw err;
    }

    let order = (state.orders || []).find(o => o.id === orderId);
    if (!order) {
      try {
        const moneyRepo = getMoneyRepository();
        order = await moneyRepo.getOrderById(orderId);
      } catch (_) {}
    }
    if (!order) {
      const err = new Error(`Order '${orderId}' not found`);
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    order.admin_hold = true;
    order.hold_reason = reason.trim();
    order.hold_operator_id = operatorId;
    order.hold_placed_at = new Date().toISOString();

    if (!state.admin_holds) state.admin_holds = [];
    const holdRecord = {
      id: `hld-${Date.now()}`,
      order_id: orderId,
      active: true,
      status: 'ACTIVE',
      reason: reason.trim(),
      notes: notes || null,
      operator_id: operatorId,
      created_at: new Date().toISOString()
    };
    state.admin_holds.push(holdRecord);

    await recordAuditLog('ADMIN_HOLD', orderId, 'PLACED', operatorId, {
      reason: reason.trim(),
      notes
    });

    const timeline = await this.getTransactionTimeline(orderId);
    return {
      success: true,
      message: 'Administrative hold placed successfully',
      holdRecord,
      evaluation: timeline.currentEvaluation
    };
  }

  /**
   * Releases an administrative hold on an order.
   */
  static async releaseAdminHold({ orderId, reason, operatorId }) {
    let order = (state.orders || []).find(o => o.id === orderId);
    if (!order) {
      try {
        const moneyRepo = getMoneyRepository();
        order = await moneyRepo.getOrderById(orderId);
      } catch (_) {}
    }
    if (!order) {
      const err = new Error(`Order '${orderId}' not found`);
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    order.admin_hold = false;
    order.hold_reason = null;
    order.hold_released_at = new Date().toISOString();
    order.hold_released_by = operatorId;

    if (state.admin_holds) {
      for (const h of state.admin_holds) {
        if (h.order_id === orderId && h.active) {
          h.active = false;
          h.status = 'RELEASED';
          h.released_at = new Date().toISOString();
          h.released_by = operatorId;
          h.release_reason = reason;
        }
      }
    }

    await recordAuditLog('ADMIN_HOLD', orderId, 'RELEASED', operatorId, {
      reason: reason || 'Hold cleared by authorized operator'
    });

    const timeline = await this.getTransactionTimeline(orderId);
    return {
      success: true,
      message: 'Administrative hold released successfully',
      evaluation: timeline.currentEvaluation
    };
  }

  /**
   * Executes seller payout strictly gated by backend GREEN status.
   */
  static async executePayout({ orderId, operatorId, idempotencyKey = null, bankAccount = null }) {
    const { isPrelaunchListingMode } = require('../../config/marketplaceMode');
    if (isPrelaunchListingMode()) {
      const err = new Error('TIKUM belum membuka transaksi. Anda dapat mengajukan listing, tetapi pembelian dan pembayaran belum tersedia.');
      err.code = 'MARKETPLACE_PRELAUNCH_ONLY';
      err.status = 403;
      throw err;
    }

    const timeline = await this.getTransactionTimeline(orderId);
    const evalResult = timeline.currentEvaluation;

    if (evalResult.colorStatus !== COLOR_STATUS.GREEN) {
      const err = new Error(`Cannot execute payout: transaction is in ${evalResult.colorStatus} status (${evalResult.badgeLabel})`);
      err.code = 'PAYOUT_NOT_ELIGIBLE';
      err.colorStatus = evalResult.colorStatus;
      err.blockingIssues = evalResult.blockingIssues;
      err.evaluationReasons = evalResult.evaluationReasons;
      throw err;
    }

    const order = timeline.order;
    const effectiveKey = idempotencyKey || `payout-${orderId}-${Date.now()}`;

    const settlementResult = await SettlementService.executeSettlement({
      orderId,
      sellerId: order.seller.id,
      officerId: operatorId,
      idempotencyKey: effectiveKey,
      bankAccount
    });

    // Update order status
    const stateOrder = (state.orders || []).find(o => o.id === orderId);
    if (stateOrder) {
      stateOrder.status = 'SETTLED';
    }

    const updatedTimeline = await this.getTransactionTimeline(orderId);

    return {
      success: true,
      message: 'Seller payout executed successfully',
      settlement: settlementResult.settlement,
      idempotent: settlementResult.idempotent,
      evaluation: updatedTimeline.currentEvaluation
    };
  }
}

module.exports = {
  TransactionControlCenterService
};

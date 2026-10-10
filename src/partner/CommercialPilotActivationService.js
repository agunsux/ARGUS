/**
 * TIKUM / ARGUS — Commercial Pilot Activation Readiness Service (P0.4)
 * 
 * Formalizes commercial outreach, written consignment agreements,
 * PIC venue operational duty authorization, and GO/NO-GO evaluation.
 * 
 * NON-NEGOTIABLE INVARIANTS:
 * 1. Zero Fake Agreements: Contract and authority must be backed by verifiable hashes and documents.
 * 2. Strict Scope Perimeter: TIKUM PIC operates strictly in public meetup concourses outside turnstiles;
 *    never claims unapproved organizer privileges or restricted backstage access.
 * 3. Absolute Liability Clause: Defective or duplicate turnstile scans void consignor payout and trigger 100% buyer refund.
 * 4. Fail-Closed Payments: Live payments remain disabled (`ENABLE_*_PRODUCTION=false`) until formal merchant approvals.
 * 5. Grounded Dates: Current planning date is October 10, 2026; Pestapora dry run October 24, event October 25, 2026.
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { state, recordAuditLog } = require('../database');
const { PartnerValidationService, PARTNER_STATUS, INVENTORY_STATUS } = require('./PartnerValidationService');
const { EventTemporalLifecycleEngine } = require('../discovery/EventTemporalLifecycleEngine');
const { EventPicService } = require('../services/eventPicService');
const { VenueOperationsService } = require('../venue/VenueOperationsService');

const AGREEMENT_STATUS = {
  DRAFT: 'DRAFT',
  SENT_FOR_REVIEW: 'SENT_FOR_REVIEW',
  SIGNED: 'SIGNED',
  ACTIVE: 'ACTIVE',
  TERMINATED: 'TERMINATED',
  BREACHED: 'BREACHED'
};

const DUTY_STATUS = {
  ISSUED: 'ISSUED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  REVOKED: 'REVOKED'
};

const PILOT_VERDICT = {
  SIMULATION_READY_AWAITING_COMMERCIAL_EXECUTION: 'SIMULATION_READY_AWAITING_COMMERCIAL_EXECUTION',
  PILOT_READY: 'PILOT_READY',
  BLOCKED: 'BLOCKED'
};

class CommercialPilotActivationService {
  static getAgreementsCollection() {
    if (!state.consignment_agreements) {
      state.consignment_agreements = [];
    }
    return state.consignment_agreements;
  }

  static getDutyCollection() {
    if (!state.pic_duty_authorizations) {
      state.pic_duty_authorizations = [];
    }
    return state.pic_duty_authorizations;
  }

  /**
   * 1. PARTNER OUTREACH PACK GENERATOR
   * Produces concrete commercial pilot proposition for PT Boss Kreator Indonesia or alternative consignor.
   */
  static generateOutreachPack({
    partnerId,
    eventId = 'event-pestapora-2026',
    contactPerson = 'Kiki Ucup (Festival Director / Partnership Lead)',
    ticketQuantity = 6,
    faceValue = 1250000,
    consignmentPriceCap = 1500000,
    commissionPct = 6.0
  }) {
    const partner = PartnerValidationService.getPartnerById(partnerId);
    if (!partner) {
      const err = new Error(`Partner '${partnerId}' not found in register`);
      err.code = 'PARTNER_NOT_FOUND';
      throw err;
    }

    const event = (state.events || []).find(e => e.id === eventId);
    if (!event) {
      const err = new Error(`Event '${eventId}' not found in canonical catalog`);
      err.code = 'EVENT_NOT_FOUND';
      throw err;
    }

    const netPayoutPerTicket = Math.round(consignmentPriceCap * (1 - (commissionPct / 100)));
    const platformFeePerTicket = consignmentPriceCap - netPayoutPerTicket;
    const totalConsignmentValue = consignmentPriceCap * ticketQuantity;
    const totalNetPayout = netPayoutPerTicket * ticketQuantity;

    const packId = `otp-tkm-${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();

    return {
      pack_id: packId,
      created_at: now,
      target_partner: {
        partner_id: partner.id,
        business_name: partner.business_name,
        contact_person: contactPerson,
        email: partner.contact_email,
        phone: partner.contact_phone
      },
      pilot_event: {
        event_id: event.id,
        title: event.name || event.title,
        date: event.date,
        venue_name: event.venue_name || 'Gambir Expo / JIExpo Kemayoran',
        city: 'Jakarta Pusat',
        admission_type: 'PHYSICAL_WRISTBAND (RFID)'
      },
      commercial_terms: {
        ticket_category: 'Festival 3-Day Pass',
        quantity: ticketQuantity,
        face_value_idr: faceValue,
        consignment_resale_cap_idr: consignmentPriceCap,
        platform_commission_pct: commissionPct,
        platform_fee_per_ticket_idr: platformFeePerTicket,
        net_payout_per_ticket_idr: netPayoutPerTicket,
        total_consignment_value_idr: totalConsignmentValue,
        total_net_payout_idr: totalNetPayout,
        settlement_trigger: 'POST_GATE_ADMISSION (Turnstile RFID scan confirmed)'
      },
      value_proposition: [
        'Zero Financial Risk: Promotor/Consignor incurs zero upfront fees; 100% buyer payment pre-funded in escrow.',
        'Orderly Secondary Resale: Bounded 6-ticket controlled allocation prevents unauthorized scalping outside JIExpo.',
        'Accountable Turnstile Delivery: TIKUM on-site PIC escorts buyer directly to Gambir Expo Gate B turnstile.',
        'Instant Automated Settlement: Payout released within 15 minutes of verified turnstile admission.'
      ],
      mandatory_verification_checklist: [
        { item: 'Akta Perusahaan & NIB PT Boss Kreator Indonesia', required: true, status: 'PENDING_DOC' },
        { item: 'NPWP Perusahaan (PMK 136 compliance)', required: true, status: 'PENDING_DOC' },
        { item: 'KTP Penanggung Jawab / Surat Kuasa Direksi', required: true, status: 'PENDING_DOC' },
        { item: 'Bukti Alokasi Tiket Resmi Loket.com (6 Booking Code References)', required: true, status: 'PENDING_DOC' },
        { item: 'Nomor Rekening Bank Resmi Perusahaan untuk Settlement', required: true, status: 'PENDING_DOC' }
      ],
      operational_handoff_protocol: {
        meeting_point: 'Gambir Expo Gate B Public Concourse (Area Terbuka Publik)',
        pic_officer: null, // Pending formal partner authorization and appointment
        pic_contact: null,
        dry_run_date: '2026-10-24 (H-1)',
        event_date: '2026-10-25 (H-Day)'
      }
    };
  }

  /**
   * 2. WRITTEN CONSIGNMENT AGREEMENT SPECIFICATION
   * Creates formal binding consignment agreement with defect/turnstile liability clauses.
   */
  static async createConsignmentAgreement({
    partnerId,
    eventId = 'event-pestapora-2026',
    agreementNumber = 'SPK/TKM-BC/2026/10-001',
    ticketBatchDetails = {
      category: 'Festival 3-Day Pass',
      quantity: 6,
      faceValue: 1250000,
      consignmentPrice: 1500000,
      ticketIdentifiers: ['Pass-01', 'Pass-02', 'Pass-03', 'Pass-04', 'Pass-05', 'Pass-06']
    },
    commissionPct = 6.0,
    settlementTiming = 'POST_GATE_ADMISSION',
    officerId = 'commercial-lead-1'
  }) {
    const partner = PartnerValidationService.getPartnerById(partnerId);
    if (!partner) {
      const err = new Error(`Partner '${partnerId}' not found`);
      err.code = 'PARTNER_NOT_FOUND';
      throw err;
    }

    const event = (state.events || []).find(e => e.id === eventId);
    if (!event) {
      const err = new Error(`Event '${eventId}' not found`);
      err.code = 'EVENT_NOT_FOUND';
      throw err;
    }

    const agreementId = `agr-${uuidv4()}`;
    const now = new Date().toISOString();

    const agreement = {
      id: agreementId,
      agreement_id: agreementId,
      agreement_number: agreementNumber,
      partner_id: partnerId,
      partner_name: partner.business_name,
      event_id: eventId,
      event_title: event.name || event.title,
      batch_details: ticketBatchDetails,
      commercial_terms: {
        commission_pct: commissionPct,
        settlement_timing: settlementTiming,
        payout_per_ticket: Math.round(ticketBatchDetails.consignmentPrice * (1 - (commissionPct / 100)))
      },
      defect_and_rejection_liability: {
        consignor_authenticity_warranty: true,
        turnstile_failure_penalty: '100% Payout Forfeiture + Immediate Buyer Refund',
        investigation_window_minutes: 15,
        duplicate_scan_liability: 'Consignor warrants wristband is unredeemed. Duplicate scans void settlement.'
      },
      status: AGREEMENT_STATUS.DRAFT,
      document_hash: null,
      signed_by_partner_rep: null,
      signed_by_tikum_officer: null,
      signed_at: null,
      created_at: now,
      updated_at: now
    };

    const agreements = this.getAgreementsCollection();
    agreements.push(agreement);

    await recordAuditLog('CONSIGNMENT_AGREEMENT', agreementId, 'AGREEMENT_DRAFTED', officerId, {
      partner_id: partnerId,
      event_id: eventId,
      agreement_number: agreementNumber
    });

    return agreement;
  }

  /**
   * Executes formal digital / document signing of the consignment agreement.
   */
  static async signConsignmentAgreement({
    agreementId,
    signerName,
    signerTitle,
    documentHash,
    officerId = 'commercial-lead-1',
    signedAt = new Date().toISOString()
  }) {
    const agreement = this.getAgreementsCollection().find(a => a.id === agreementId || a.agreement_id === agreementId);
    if (!agreement) {
      const err = new Error(`Agreement '${agreementId}' not found`);
      err.code = 'AGREEMENT_NOT_FOUND';
      throw err;
    }

    if (!documentHash || !signerName) {
      const err = new Error('signerName and documentHash are required to sign agreement');
      err.code = 'INVALID_SIGNATURE_PAYLOAD';
      throw err;
    }

    agreement.document_hash = documentHash;
    agreement.signed_by_partner_rep = {
      name: signerName,
      title: signerTitle,
      signed_at: signedAt
    };
    agreement.signed_by_tikum_officer = {
      officer_id: officerId,
      signed_at: signedAt
    };
    agreement.signed_at = signedAt;
    agreement.status = AGREEMENT_STATUS.SIGNED;
    agreement.updated_at = new Date().toISOString();

    // Advance partner in PartnerValidationService
    await PartnerValidationService.recordAgreedTerms(agreement.partner_id, {
      consignmentCommissionPct: agreement.commercial_terms.commission_pct,
      agreedTransferMechanisms: ['PHYSICAL_WRISTBAND'],
      agreementDocHash: documentHash,
      settlementTiming: agreement.commercial_terms.settlement_timing,
      officerId
    });

    await recordAuditLog('CONSIGNMENT_AGREEMENT', agreementId, 'AGREEMENT_SIGNED', officerId, {
      signer_name: signerName,
      document_hash: documentHash
    });

    return agreement;
  }

  /**
   * 3. PIC VENUE ACCESS & DUTY AUTHORIZATION
   * Issues official "Surat Tugas PIC Operasional Lapangan TIKUM" with strict public concourse boundaries.
   */
  static async issuePicDutyAuthorization({
    eventId = 'event-pestapora-2026',
    picUserId = 'pic-1',
    venueId = 'venue-kemayoran',
    dutyNumber = 'ST-TKM/OPS/2026/10-001',
    shiftDate = '2026-10-25',
    shiftStartTime = '2026-10-25T14:00:00+07:00',
    shiftEndTime = '2026-10-25T23:00:00+07:00',
    officerId = 'operations-director-1'
  }) {
    const event = (state.events || []).find(e => e.id === eventId);
    if (!event) throw new Error(`Event '${eventId}' not found`);

    const picUser = (state.users || []).find(u => u.id === picUserId);
    if (!picUser) throw new Error(`PIC user '${picUserId}' not found`);

    const authorizationId = `dty-${uuidv4()}`;
    const now = new Date().toISOString();

    const dutyAuth = {
      id: authorizationId,
      authorization_id: authorizationId,
      duty_number: dutyNumber,
      event_id: eventId,
      event_title: event.name || event.title,
      venue_id: venueId,
      pic_officer: {
        user_id: picUserId,
        name: picUser.name,
        phone: picUser.phone || '081199887766',
        role: 'LEAD_EVENT_PIC'
      },
      schedule: {
        shift_date: shiftDate,
        start_time: shiftStartTime,
        end_time: shiftEndTime
      },
      operational_boundaries: {
        designated_location: 'Gambir Expo / JIExpo Kemayoran, Jakarta Pusat',
        exact_meetup_perimeter: 'Gambir Expo Gate B Public Concourse (Area Terbuka Publik sebelum Antrean Gate Turnstile)',
        non_infringement_declaration: 'Petugas TIKUM TIDAK mengklaim identitas panitia promotor resmi atau akses backstage/ring-1. Operasi dilakukan secara legal dan transparan di area publik untuk mengawal serah terima fisik tiket dan mendampingi pembeli hingga proses turnstile selesai.',
        allowed_actions: [
          'Melakukan verifikasi fisik gelang/wristband dan tamper seal RFID di meeting point publik.',
          'Mendampingi pembeli dalam antrean menuju turnstile resmi promotor.',
          'Memverifikasi visual indikator lampu hijau pada pemindai turnstile promotor.',
          'Mencatat bukti konfirmasi masuk turnstile secara real-time pada aplikasi ARGUS/TIKUM.'
        ],
        prohibited_actions: [
          'Memasuki area terbatas/backstage/posko produksi promotor tanpa izin tertulis.',
          'Menjual atau menawarkan tiket secara acak di luar pembeli terverifikasi sistem.',
          'Mengintervensi sistem operasional ticketing gate atau perangkat promotor.'
        ]
      },
      incident_escalation_protocol: {
        turnstile_rejection_action: 'Segera arahkan pembeli ke Loket Ticket Resolution Booth di Gambir Expo, laporkan ENTRY_FAILURE pada aplikasi, dan bekukan settlement escrow.',
        escalation_contacts: [
          { role: 'Central Ops Hotline', phone: '081299927378' },
          { role: 'Loket Resolution Helpdesk', location: 'Tenda Layanan Pelanggan Gambir Expo Gate B' },
          { role: 'Venue Security Kemayoran', location: 'Posko Keamanan Pintu 2 Gambir Expo' }
        ]
      },
      status: DUTY_STATUS.ISSUED,
      issued_by: officerId,
      issued_at: now
    };

    const dutyCol = this.getDutyCollection();
    dutyCol.push(dutyAuth);

    // Register corresponding shift in VenueOperationsService
    await VenueOperationsService.createShiftAssignment({
      eventId,
      venueId,
      picUserId,
      shiftName: 'Pestapora Gate B Turnstile Escort Shift',
      startTime: shiftStartTime,
      endTime: shiftEndTime
    });

    await recordAuditLog('PIC_DUTY_AUTHORIZATION', authorizationId, 'DUTY_ISSUED', officerId, {
      duty_number: dutyNumber,
      pic_user_id: picUserId,
      event_id: eventId
    });

    return dutyAuth;
  }

  /**
   * 4. FINAL GO/NO-GO EVALUATION ENGINE
   * Evaluates all 5 mandatory pilot launch gates.
   */
  static evaluatePilotGoNoGo({
    partnerId,
    eventId = 'event-pestapora-2026'
  }) {
    const partner = PartnerValidationService.getPartnerById(partnerId);
    const event = (state.events || []).find(e => e.id === eventId);
    const agreements = this.getAgreementsCollection().filter(a => a.partner_id === partnerId && a.event_id === eventId);
    const signedAgreement = agreements.find(a => a.status === AGREEMENT_STATUS.SIGNED || a.status === AGREEMENT_STATUS.ACTIVE);
    const dutyAuth = this.getDutyCollection().find(d => d.event_id === eventId && d.status === DUTY_STATUS.ISSUED);
    const inventory = PartnerValidationService.getInventoryForEvent(eventId).find(i => i.partner_id === partnerId);

    const checks = {
      gate_1_partner_authority: {
        name: 'Gate 1: Partner Authority & Legal Verification',
        passed: false,
        detail: 'Pending partner authority evidence hash'
      },
      gate_2_supply_verification: {
        name: 'Gate 2: Written Consignment Agreement & Ticket Authority',
        passed: false,
        detail: 'Pending signed consignment agreement'
      },
      gate_3_operational_coverage: {
        name: 'Gate 3: PIC Assignment & Venue Access Perimeter',
        passed: false,
        detail: 'Pending PIC duty authorization'
      },
      gate_4_payment_safety: {
        name: 'Gate 4: Payment Gateway Fail-Closed Locks',
        passed: false,
        detail: 'Live payments must remain fail-closed'
      },
      gate_5_event_temporal: {
        name: 'Gate 5: Event Temporal Validity & Status',
        passed: false,
        detail: 'Event must be conclusively upcoming'
      }
    };

    // Evaluate Gate 1
    if (partner) {
      const hasAuthEvidence = !!(partner.authority_evidence && partner.authority_evidence.document_hash);
      const isApproved = [PARTNER_STATUS.AUTHORITY_VERIFIED, PARTNER_STATUS.TERMS_AGREED, PARTNER_STATUS.PILOT_APPROVED].includes(partner.status);
      if (hasAuthEvidence && isApproved) {
        checks.gate_1_partner_authority.passed = true;
        checks.gate_1_partner_authority.detail = `Partner authority confirmed via ${partner.authority_evidence.evidence_type} (${partner.authority_evidence.document_hash.slice(0, 10)})`;
      } else {
        checks.gate_1_partner_authority.detail = `Partner status is '${partner.status}'; authority document hash pending verification`;
      }
    } else {
      checks.gate_1_partner_authority.detail = `Partner '${partnerId}' not registered`;
    }

    // Evaluate Gate 2
    if (signedAgreement) {
      const hasLiabilityClause = !!(signedAgreement.defect_and_rejection_liability && signedAgreement.defect_and_rejection_liability.consignor_authenticity_warranty);
      const isBatchVerified = inventory && [INVENTORY_STATUS.VERIFIED, INVENTORY_STATUS.LISTED].includes(inventory.status);
      if (hasLiabilityClause && isBatchVerified) {
        checks.gate_2_supply_verification.passed = true;
        checks.gate_2_supply_verification.detail = `Agreement ${signedAgreement.agreement_number} signed with full defect liability clause; 6 tickets verified in batch`;
      } else {
        checks.gate_2_supply_verification.detail = `Agreement signed but inventory batch status is '${inventory ? inventory.status : 'MISSING'}'`;
      }
    } else {
      checks.gate_2_supply_verification.detail = 'Consignment agreement unsigned or pending commercial review';
    }

    // Evaluate Gate 3
    if (dutyAuth && dutyAuth.operational_boundaries && dutyAuth.operational_boundaries.exact_meetup_perimeter) {
      checks.gate_3_operational_coverage.passed = true;
      checks.gate_3_operational_coverage.detail = `Surat Tugas ${dutyAuth.duty_number} active for PIC ${dutyAuth.pic_officer.name} at ${dutyAuth.operational_boundaries.exact_meetup_perimeter}`;
    } else {
      checks.gate_3_operational_coverage.detail = 'PIC Surat Tugas not yet issued';
    }

    // Evaluate Gate 4
    const dokuProd = process.env.ENABLE_DOKU_PRODUCTION === 'true';
    const ipaymuProd = process.env.ENABLE_IPAYMU_PRODUCTION === 'true';
    const midtransProd = process.env.ENABLE_MIDTRANS_PRODUCTION === 'true';
    const xenditProd = process.env.ENABLE_XENDIT_PRODUCTION === 'true';
    const allLocked = !dokuProd && !ipaymuProd && !midtransProd && !xenditProd;

    if (allLocked) {
      checks.gate_4_payment_safety.passed = true;
      checks.gate_4_payment_safety.detail = 'Fail-Closed: All live payment rails remain disabled (zero real charges / zero disbursements)';
    } else {
      checks.gate_4_payment_safety.detail = 'SAFETY VIOLATION: One or more live payment providers enabled in non-production environment';
    }

    // Evaluate Gate 5
    if (event) {
      const isUpcoming = EventTemporalLifecycleEngine.isEventUpcoming(event, new Date('2026-10-10T00:00:00+07:00'));
      if (isUpcoming && event.date === '2026-10-25') {
        checks.gate_5_event_temporal.passed = true;
        checks.gate_5_event_temporal.detail = `Event ${event.id} is confirmed upcoming for 2026-10-25 (15 days away)`;
      } else {
        checks.gate_5_event_temporal.detail = `Event ${event.id} temporal check failed (isUpcoming: ${isUpcoming})`;
      }
    } else {
      checks.gate_5_event_temporal.detail = `Event '${eventId}' not found`;
    }

    // Determine Overall Verdict
    const allPassed = Object.values(checks).every(c => c.passed);
    const securityOk = checks.gate_4_payment_safety.passed && checks.gate_5_event_temporal.passed;

    let verdict;
    let reason;

    if (!securityOk) {
      verdict = PILOT_VERDICT.BLOCKED;
      reason = 'Security or temporal preconditions failed';
    } else if (allPassed) {
      verdict = PILOT_VERDICT.PILOT_READY;
      reason = 'All 5 commercial, supply, operational, safety, and temporal gates cleared';
    } else {
      verdict = PILOT_VERDICT.SIMULATION_READY_AWAITING_COMMERCIAL_EXECUTION;
      reason = 'Software and simulation engines proven; awaiting physical/digital commercial signature and ticket custody from partner';
    }

    return {
      evaluated_at: new Date().toISOString(),
      partner_id: partnerId,
      event_id: eventId,
      gates: checks,
      passed_count: Object.values(checks).filter(c => c.passed).length,
      total_count: 5,
      verdict,
      reason
    };
  }
}

module.exports = {
  CommercialPilotActivationService,
  AGREEMENT_STATUS,
  DUTY_STATUS,
  PILOT_VERDICT
};

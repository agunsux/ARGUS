/**
 * TIKUM — TypeScript Definitions for Structured Bilingual Dictionaries
 * Enforces strict key parity between Indonesian (`id`) and English (`en`)
 */

export interface CommonDictionary {
  appName: string;
  tagline: string;
  corporateAttribution: string;
  verified: string;
  unverified: string;
  loading: string;
  back: string;
  close: string;
  save: string;
  cancel: string;
  confirm: string;
  submit: string;
  search: string;
  filter: string;
  status: string;
  date: string;
  time: string;
  venue: string;
  price: string;
  seat: string;
  quantity: string;
  details: string;
  indonesia: string;
  all: string;
  seeMore: string;
  seeLess: string;
  copied: string;
  copyLink: string;
  requiredField: string;
  optional: string;
}

export interface NavDictionary {
  home: string;
  events: string;
  featuredEvents: string;
  allEvents: string;
  concerts: string;
  sports: string;
  festivals: string;
  theater: string;
  comedy: string;
  howItWorks: string;
  buyerProtection: string;
  sellerProtection: string;
  ticketVerification: string;
  escrow: string;
  disputes: string;
  track: string;
  submitListing: string;
  sellTicket: string;
  offers: string;
  myTickets: string;
  account: string;
  login: string;
  signup: string;
  logout: string;
  adminConsole: string;
  support: string;
  blog: string;
  pastEvents: string;
  pricingAndFees: string;
  productsAndServices: string;
  buyerGuide: string;
  signInSignUp: string;
  backToHome: string;
}

export interface LandingDictionary {
  heroTitle: string;
  heroSubtitle: string;
  ctaSearch: string;
  ctaSell: string;
  spotlightTitle: string;
  spotlightSubtitle: string;
  howItWorksTitle: string;
  step1Title: string;
  step1Desc: string;
  step2Title: string;
  step2Desc: string;
  step3Title: string;
  step3Desc: string;
  step4Title: string;
  step4Desc: string;
  step5Title: string;
  step5Desc: string;
  zeroFakeTitle: string;
  zeroFakeDesc: string;
  prelaunchNoticeTitle: string;
  prelaunchNoticeDesc: string;
}

export interface PricingDictionary {
  platformServiceFee: string;
  sellerFeeTitle: string;
  sellerFeeDesc: string;
  buyerFeeTitle: string;
  buyerFeeDesc: string;
  listingFee: string;
  vatLabel: string;
  totalPayment: string;
  payoutEstimate: string;
  breakdownTitle: string;
  calcTitle: string;
  ticketPriceLabel: string;
  maxMarkupNotice: string;
}

export interface DealCreateDictionary {
  pageTitle: string;
  pageSubtitle: string;
  zeroQrCallout: string;
  wizardStep1: string;
  wizardStep2: string;
  wizardStep3: string;
  wizardStep4: string;
  eventSelectLabel: string;
  eventSelectPlaceholder: string;
  seatInfoLabel: string;
  seatInfoPlaceholder: string;
  quantityLabel: string;
  faceValueLabel: string;
  faceValueSub: string;
  sellingPriceLabel: string;
  sellingPriceSub: string;
  barcodeLabel: string;
  barcodePlaceholder: string;
  barcodeSub: string;
  protocolLabel: string;
  protocolQr: string;
  protocolWristband: string;
  protocolIdentity: string;
  protocolEscort: string;
  kycSectionTitle: string;
  kycSectionDesc: string;
  ktpLabel: string;
  selfieLabel: string;
  evidenceLabel: string;
  evidenceSub: string;
  pdpConsent: string;
  sellerIdLabel: string;
  sellerIdSub: string;
  submitBtn: string;
  submitting: string;
  mode1Notice: string;
  mode2Notice: string;
}

export interface DealRoomDictionary {
  pageTitle: string;
  pageSubtitle: string;
  simBannerTitle: string;
  simBannerDesc: string;
  orderProtectionPill: string;
  ticketDetailsTitle: string;
  seatInfoLabel: string;
  listingIdLabel: string;
  listingStatusLabel: string;
  sellerKycLabel: string;
  eventDateLabel: string;
  eventVenueLabel: string;
  orderActionTitle: string;
  mode1FundHandling: string;
  mode2FundHandling: string;
  paymentMethodTitle: string;
  paymentChannelQris: string;
  paymentChannelVa: string;
  paymentChannelCard: string;
  picMeetingPointInstruction: string;
  termsBindingNotice: string;
  termsCheckbox: string;
  simulateSubmit: string;
  realSubmit: string;
  orderSuccessTitle: string;
  orderSuccessDesc: string;
  orderIdLabel: string;
  orderStatusLabel: string;
  escrowStatusLabel: string;
  entryInstruction: string;
  entryInstructionDesc: string;
  trackOrderBtn: string;
}

export interface VerificationDictionary {
  stageATitle: string;
  stageADesc: string;
  stageBTitle: string;
  stageBDesc: string;
  zeroQrNotice: string;
  antiDuplicationTitle: string;
  antiDuplicationDesc: string;
  kycTitle: string;
  kycDesc: string;
  pdpTitle: string;
  pdpDesc: string;
}

export interface PicOpsDictionary {
  title: string;
  subtitle: string;
  tierATitle: string;
  tierADesc: string;
  tierBTitle: string;
  tierBDesc: string;
  tierCTitle: string;
  tierCDesc: string;
  dualHandshakeTitle: string;
  dualHandshakeDesc: string;
  noShowRuleTitle: string;
  noShowRuleDesc: string;
  gateHoursNotice: string;
}

export interface EvidenceBundleDictionary {
  title: string;
  subtitle: string;
  bundleIdLabel: string;
  bundleHashLabel: string;
  timestampLabel: string;
  artifactsTitle: string;
  purchaseInvoice: string;
  identityDocument: string;
  barcodeHash: string;
  authorizationLetter: string;
  paymentSettlementRecord: string;
  handoverReceipt: string;
  gateCheckLog: string;
  investigationPhoto: string;
  disputeResolutionRecord: string;
  integrityVerified: string;
}

export interface DisputeDictionary {
  title: string;
  subtitle: string;
  reasonGateRejection: string;
  reasonSellerNoShow: string;
  reasonBuyerNoShow: string;
  reasonCategoryMismatch: string;
  adjudicationProcess: string;
  adjudicationDesc: string;
  resolutionTimeline: string;
  buyerFavoredOutcome: string;
  sellerFavoredOutcome: string;
}

export interface TermsDictionary {
  pageTitle: string;
  lastUpdated: string;
  legalNotice: string;
  governingLanguageClause: string;
}

export interface PrivacyDictionary {
  pageTitle: string;
  subtitle: string;
  lastUpdated: string;
  pdpCompliance: string;
  encryptionNotice: string;
  retentionNotice: string;
}

export interface FaqDictionary {
  pageTitle: string;
  subtitle: string;
  categoryGeneral: string;
  categoryVerification: string;
  categoryPayment: string;
  categoryPic: string;
  categoryDisputes: string;
}

export interface RefundPolicyDictionary {
  pageTitle: string;
  subtitle: string;
  lastUpdated: string;
  eligibilityTitle: string;
  nonEligibilityTitle: string;
  processTitle: string;
}

export interface StatusDictionary {
  OWNERSHIP_EVIDENCE_REVIEWED: string;
  STAGE_A: string;
  STAGE_B: string;
  VENUE_ASSISTED: string;
  POLICY_UNVERIFIED: string;
  TIER_A: string;
  TIER_B: string;
  TIER_C: string;
  PENDING_VERIFICATION: string;
  APPROVED_PRELAUNCH: string;
  ACTIVE: string;
  RESERVED: string;
  SOLD: string;
  PENDING_PAYMENT: string;
  PAID: string;
  ENTRY_CONFIRMED: string;
  SETTLED: string;
  DISPUTED: string;
  REFUNDED: string;
  CANCELLED: string;
  PENDING: string;
  ACCEPTED: string;
  REJECTED: string;
  EXPIRED: string;
}

export interface BrandDictionary {
  name: string;
  tagline: string;
  slogan: string;
  corporateAttribution: string;
  copyright: string;
  byline: string;
  subtitle: string;
  metaTitle: string;
  metaDescription: string;
}

export interface MetaDictionary {
  title: string;
  description: string;
}

export interface FooterDictionary {
  managedBy: string;
  operationalOffice: string;
  officialContact: string;
  servicesAndLegal: string;
  faq: string;
  terms: string;
  refundPolicy: string;
  privacyPolicy: string;
  contactUs: string;
  how: string;
  buyerProt: string;
  verifInfo: string;
  escrow: string;
  copyrightNotice: string;
}

export interface ErrorsDictionary {
  generic: string;
  network: string;
  unauthorized: string;
  forbidden: string;
  notFound: string;
  invalidInput: string;
  ticketAlreadySold: string;
  barcodeDuplicate: string;
  priceOutOfRange: string;
  kycRequired: string;
  orderExpired: string;
}

export interface TikumDictionarySchema {
  common: CommonDictionary;
  nav: NavDictionary;
  landing: LandingDictionary;
  pricing: PricingDictionary;
  dealCreate: DealCreateDictionary;
  dealRoom: DealRoomDictionary;
  verification: VerificationDictionary;
  picOps: PicOpsDictionary;
  evidenceBundle: EvidenceBundleDictionary;
  dispute: DisputeDictionary;
  terms: TermsDictionary;
  privacy: PrivacyDictionary;
  faq: FaqDictionary;
  refundPolicy: RefundPolicyDictionary;
  status: StatusDictionary;
  brand: BrandDictionary;
  meta: MetaDictionary;
  footer: FooterDictionary;
  errors: ErrorsDictionary;
}

declare const id: TikumDictionarySchema;
declare const en: TikumDictionarySchema;

export { id, en };
export default TikumDictionarySchema;

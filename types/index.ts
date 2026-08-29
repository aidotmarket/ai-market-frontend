// ============================================================================
// Auth types — matches backend app/schemas/user.py
// ============================================================================

export type UserRole = 'buyer' | 'seller' | 'model_provider' | 'admin';
export type UserStatus = 'pending' | 'active' | 'suspended' | 'deleted';

export interface User {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  email_verified_at: string | null;
  totp_enabled: boolean;
  auth_methods: string[];
  primary_auth: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface PreAuthRequiredResponse {
  pre_auth_token: string;
  requires_2fa: true;
  expires_in: number;
}

export type LoginResult = TokenResponse | PreAuthRequiredResponse;

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  role?: UserRole;
}

export interface TOTPSetupResponse {
  secret: string;
  qr_uri: string;
  setup_session_id: string;
  expires_in: number;
}

export interface TOTPVerifySetupResponse {
  backup_codes: string[];
}

export interface GenerateReauthTokenResponse {
  message: string;
}

export interface ReauthResponse {
  reauth_token: string;
}

// ============================================================================
// Listing types — matches backend app/schemas/listing.py
// ============================================================================

export type ListingStatus = 'draft' | 'enhanced' | 'pending_review' | 'published' | 'unlisted' | 'suspended' | 'archived';
export type PricingType = 'one_time' | 'subscription' | 'both';
export type ComplianceStatus = 'not_checked' | 'low_risk' | 'medium_risk' | 'high_risk';
export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'mistral' | 'local';
export type TrustLevel = 'L0' | 'L1' | 'L2' | 'L3';
export type VerificationStatus = 'unverified' | 'verified' | 'premium';
export type ListingType = 'queryable' | 'raw';
export type FulfillmentType = 'ai_queryable' | 'file_download' | 'pipeline_invocation' | 'model_access' | 'reference';

export type VerificationSkippedReason = 'permission_denied' | 'unsupported_type' | 'timeout';
type DecimalLeadingDigit = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
type LowercaseHexDigit = '0' | DecimalLeadingDigit | 'a' | 'b' | 'c' | 'd' | 'e' | 'f';
export type VerificationObjectId = `${LowercaseHexDigit}${Lowercase<string>}`;
export type VerificationNullRate = `${0 | 1}.${number}` | 'suppressed_low_occupancy';
type PositiveIntegerString = DecimalLeadingDigit | `${DecimalLeadingDigit}${bigint}`;
export type VerificationSchemaColumnType =
  | 'string'
  | 'integer'
  | 'float'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'binary'
  | 'unknown';

export interface VerificationSchemaColumn {
  name: string;
  type: VerificationSchemaColumnType;
}

export interface VerificationSchemaObject {
  object_id: VerificationObjectId;
  columns: VerificationSchemaColumn[];
}

export interface VerificationRowCount {
  object_id: VerificationObjectId;
  count: number;
  method: 'exact' | 'catalog_estimate' | `deterministic_sample_estimate(${PositiveIntegerString})`;
}

export interface VerificationCoverage {
  objects_discovered: number;
  objects_scanned: number;
  objects_skipped_by_reason: Record<VerificationSkippedReason, number>;
  skipped: Array<{
    object_id: VerificationObjectId;
    reason: VerificationSkippedReason;
  }>;
}

export interface VerificationApproxDistinct {
  algorithm: 'hll-sha256-v1';
  estimate: number;
  relative_error_ppm: number;
}

export interface VerificationFactColumn {
  position: number;
  null_rate: VerificationNullRate;
  approx_distinct_count: VerificationApproxDistinct | 'suppressed_low_occupancy';
  length_histogram: number[] | 'suppressed_low_occupancy' | null;
  numeric_range_buckets: number[] | 'suppressed_low_occupancy' | null;
}

export interface VerificationFactObject {
  object_id: VerificationObjectId;
  columns: VerificationFactColumn[];
}

export interface PublishedScanFindings {
  publication_state: 'PUBLISHED';
  artifact_version: 'data-verification-public-artifact-v1';
  verification_series_id: string;
  epoch_id: string;
  listing_id: string;
  title: string;
  scan_date_utc: string;
  scanned_at_utc: string;
  completed_at_utc: string;
  duration_ms: number;
  published_at_utc: string;
  spec: {
    id: string;
    version: '1';
    hash: string;
    depth_class: 'complete_standard_v1';
    canonicalization_version: 'python-json-sort-compact-v1';
  };
  execution: {
    agent_version: string;
    connector_type: 'eolymp';
    connector_version: 'eolymp-v1';
    content_sha256_reference: string;
  };
  methods: {
    row_count_algorithm_version: 'exact-v1';
    distinct_algorithm_version: 'hll-sha256-v1';
    histogram_version: 'fixed-buckets-v1';
    numeric_bucket_version: 'fixed-buckets-v1';
  };
  coverage: VerificationCoverage;
  deterministic_facts: VerificationFactObject[];
  fingerprint_hash: string;
  narrative_state: 'grounded' | 'withheld_grounding_failed';
  narrative: string | null;
  listing_claim_comparison: string | null;
  narrative_notice: string | null;
  seller_context_provided: boolean;
  preview_requested: boolean;
  schema_preview?: VerificationSchemaObject[];
  row_counts?: VerificationRowCount[];
  attestation: string;
  disclaimer: string;
}

export interface WithdrawnScanFindings {
  publication_state: 'WITHDRAWN';
  withdrawn_at_utc: string;
  marker: string;
}

export type ScanFindings = PublishedScanFindings | WithdrawnScanFindings;

export interface ListingListItem {
  id: string;
  slug: string;
  title: string;
  short_description: string | null;
  price: number;
  pricing_type: PricingType;
  access_window_days: number;
  category: string;
  tags: string[];
  privacy_score: number | null;
  listing_type: ListingType;
  fulfillment_type: FulfillmentType;
  task_category: string | null;
  domain_tags: string[] | null;
  model_provider: ModelProvider | null;
  trust_level: TrustLevel;
  view_count: number;
  created_at: string;
}

export interface ListingPublicListItem {
  id: string;
  slug: string;
  title: string;
  short_description: string | null;
  category: string;
  tags: string[];
  fulfillment_type: string;
  task_category: string | null;
  domain_tags: string[] | null;
  pricing: {
    price: number;
    pricing_type: string;
    subscription_price_monthly: number | null;
  };
  price: number | null;
  privacy_score: number | null;
  privacy_scan_status: 'scanned' | 'not_scanned';
  trust_level: string;
  view_count: number;
  published_at: string | null;
  purchasable: boolean;
  purchase_hold_reason: string | null;
}

export interface ListingPublicListResponse {
  items: ListingPublicListItem[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
  jsonld: Record<string, unknown> | null;
}

export type ListingVersionStatus = 'active' | 'superseded' | 'quarantined';

export interface ListingVersion {
  version_id: string;
  version_label: string;
  published_at: string;
  object_count: number;
  total_size_bytes: number;
  status: ListingVersionStatus;
}

export interface ListingDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  short_description: string | null;
  publisher: {
    display_name: string;
    trust_level: string;
  };
  pricing: {
    price: number;
    pricing_type: PricingType;
    subscription_price_monthly: number | null;
  };
  license: string | null;
  category: string;
  secondary_categories: string[] | null;
  tags: string[];
  task_category: string | null;
  domain_tags: string[] | null;
  schema_summary: {
    columns: string[] | null;
    column_count: number | null;
    sample_types: Record<string, string> | null;
  } | null;
  row_count: number | null;
  data_format: string | null;
  update_frequency: string | null;
  coverage: {
    temporal: string | null;
    spatial: string | null;
  } | null;
  privacy_score: number | null;
  privacy_scan_status: 'scanned' | 'not_scanned';
  searchability_score: number;
  trust_level: TrustLevel;
  is_accessible_for_free: boolean;
  view_count: number;
  inquiry_count: number;
  noindex: boolean;
  purchasable: boolean;
  purchase_hold_reason: string | null;
  created_at: string;
  updated_at: string | null;
  published_at: string | null;
  fulfillment_type: FulfillmentType;
  scan_findings: ScanFindings | null;
  jsonld: Record<string, unknown> | null;
}

// ============================================================================
// Search types — matches backend app/api/v1/endpoints/search.py
// ============================================================================

export interface SearchRequest {
  query: string;
  category?: string;
  min_price?: number;
  max_price?: number;
  min_privacy_score?: number;
  compliance_status?: string;
  fulfillment_type?: FulfillmentType | FulfillmentType[];
  limit?: number;
  offset?: number;
}

export interface SearchResultItem {
  id: string;
  title: string | null;
  slug: string;
  description: string | null;
  short_description: string | null;
  category: string;
  price: number;
  privacy_score: number | null;
  compliance_status: string | null;
  data_format: string | null;
  source_row_count: number | null;
  tags: string[] | null;
}

export interface PriceFacet {
  min: number;
  max: number;
  avg?: number;
}

export interface FacetInfo {
  categories: Record<string, number>;
  price: PriceFacet;
}

export interface SearchResponse {
  results: SearchResultItem[];
  total: number;
  query: string;
  facets: FacetInfo;
  fallback?: boolean;
}

// ============================================================================
// Stripe Connect types — matches backend app/api/v1/endpoints/connect.py
// ============================================================================

export interface StripeOnboardingResponse {
  url: string;
}

export interface StripeConnectStatus {
  payouts_enabled: boolean;
  details_submitted: boolean;
  charges_enabled?: boolean;
}

export interface StripeLoginLinkResponse {
  url: string;
}

// ============================================================================
// Seller dashboard types — matches backend app/api/v1/endpoints/seller.py
// ============================================================================

export type SellerOrderStatus =
  | 'created'
  | 'paid'
  | 'in_escrow'
  | 'pending_delivery'
  | 'delivered'
  | 'completed'
  | 'disputed'
  | 'resolved'
  | 'delivery_failed'
  | 'refunded'
  | 'cancelled';

export interface SellerStats {
  period: string;
  total_listings: number;
  total_views: number;
  total_inquiries: number;
  total_sales: number;
  period_sales: number;
  period_revenue_cents: number;
  period_revenue_display: string;
  pending_fulfillments: number;
  conversion_rate: number;
}

export interface SellerFinancials {
  total_revenue: number;
  pending_payouts: number;
  completed_payouts: number;
}

export interface SellerOrder {
  id: string;
  order_number: string;
  listing_id: string;
  listing_title: string;
  buyer_email: string;
  amount_cents: number;
  seller_amount_cents: number;
  status: SellerOrderStatus;
  needs_action: boolean;
  created_at: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
}

// ============================================================================
// Listing creation types
// ============================================================================

export interface CreateListingRequest {
  title?: string;
  description: string;
  short_description?: string;
  category: string;
  tags?: string[];
  price: number;
  pricing_type: PricingType;
  data_format?: string;
  source_row_count?: number;
  schema_info?: Record<string, string>;
  license?: string;
}

export interface UpdateListingRequest {
  status?: ListingStatus;
  title?: string;
  description?: string;
  short_description?: string;
  category?: string;
  tags?: string[];
  price?: number;
  pricing_type?: PricingType;
  data_format?: string;
  source_row_count?: number;
  schema_info?: Record<string, string>;
  license?: string;
}

// ============================================================================
// Seller Wizard types — AI enhancement & preview
// ============================================================================

export interface EnhanceResponse {
  title?: string;
  description?: string;
  short_description?: string;
  tags?: string[];
  category?: string;
  suggested_price?: number;
  pricing_type?: PricingType;
}

export interface SchemaColumn {
  name: string;
  type: string;
  pii_flag: boolean;
  description: string;
}

export interface ListingPreview {
  id: string;
  title?: string;
  description: string;
  short_description: string | null;
  category: string;
  tags: string[];
  price: number;
  pricing_type: PricingType;
  data_format: string | null;
  row_count: number | null;
  schema: SchemaColumn[];
  pii_score: number;
  compliance_frameworks: string[];
  compliance_status: ComplianceStatus;
  ai_generated_fields: string[];
}

export interface SellerListingItem {
  id: string;
  title?: string;
  status: ListingStatus;
  category: string;
  price: number;
  pricing_type: PricingType;
  view_count: number;
  created_at: string;
}

// ============================================================================
// Checkout types — matches backend app/api/v1/endpoints/checkout.py
// ============================================================================

export interface CheckoutCreateRequest {
  listing_id: string;
  version_id?: string;
  success_url?: string;
  cancel_url?: string;
}

export interface CheckoutCreateResponse {
  checkout_url: string;
  session_id: string;
}

export interface CheckoutVerifyResponse {
  status: 'pending' | 'completed' | 'expired';
  order_id?: string;
  listing_title?: string;
  amount?: number;
  transaction_id?: string;
  tx_number?: string;
}

// ============================================================================
// Buyer order types — matches backend app/api/v1/endpoints/orders.py
// ============================================================================

export type OrderStatus =
  | 'pending_fulfillment'
  | 'fulfilled'
  | 'refunded'
  | 'disputed'
  | 'payment_failed';

export interface BuyerOrder {
  id: string;
  listing_id: string;
  listing_title: string;
  seller_name: string | null;
  amount: number;
  status: OrderStatus;
  created_at: string;
  updated_at: string | null;
  access_expires_at?: string | null;
  access_expired?: boolean;
  purchased_version?: PurchasedVersion | null;
  newer_version_available?: boolean;
}

export interface BuyerOrderDetail extends BuyerOrder {
  buyer_id: string;
  seller_id: string;
  access_url?: string | null;
  download_count?: number;
}

export interface PurchasedVersion {
  version_id?: string;
  id?: string;
  version_label?: string;
  label?: string;
  published_at?: string;
  object_count?: number;
  total_size_bytes?: number;
  status?: ListingVersionStatus | string;
}

export interface OrderEvent {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
}

export interface LegacyOrderDownloadResponse {
  download_url: string;
  expires_at?: string;
  download_number?: number;
  downloads_remaining?: number;
  s3_download_urls?: S3DownloadFile[];
}

export interface S3ScopedDeliveryCredentials {
  access_key_id: string;
  secret_access_key: string;
  session_token: string;
  expiration: string;
  bucket: string;
  prefix: string | null;
  region?: string | null;
  sync_command_hint: string;
}

export interface S3ScopedDeliveryResponse {
  delivery_type: 's3_scoped_credential';
  s3_scoped_delivery: S3ScopedDeliveryCredentials;
  download_number: number;
  downloads_remaining: number;
}

export type OrderDownloadResponse = LegacyOrderDownloadResponse | S3ScopedDeliveryResponse;

export interface OrderAccessResponse {
  has_access?: boolean;
  access_url?: string | null;
  expires_at?: string;
  downloads_remaining?: number;
  s3_download_urls?: S3DownloadFile[];
}

export interface S3DownloadFile {
  path: string;
  presigned_url: string;
  expires_at: string;
}

export interface OrderRefreshResponse {
  status: 'current_valid' | 'refresh_requested' | string;
  message?: string;
  expires_at?: string;
  access_url?: string;
  request_id?: string;
}

// ============================================================================
// Transaction types — matches backend app/api/v1/endpoints/transactions.py
// ============================================================================

export type TransactionStatus =
  | 'initiated'
  | 'quoted'
  | 'accepted'
  | 'checkout_pending'
  | 'paid'
  | 'fulfilling'
  | 'delivered'
  | 'confirmed'
  | 'settled';

export interface Transaction {
  id: string;
  order_id: string | null;
  tx_number: string;
  status: TransactionStatus;
  buyer_type: string;
  amount_cents: number;
  currency: string;
  platform_fee_cents: number;
  seller_amount_cents: number;
  listing_title?: string;
  seller_name?: string;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  settled_at: string | null;
  events?: TransactionEvent[];
}

export interface TransactionEvent {
  id: string;
  event_type: string;
  actor_type: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
}

export interface DeliverRequest {
  proof_type: string;
  notes?: string;
}

// ============================================================================
// Conversation / Inquiry types — matches backend InquiryService
// ============================================================================

export type MessageRole = 'buyer' | 'seller' | 'allai' | 'system';

export type ConversationStatus =
  | 'auto_answered'
  | 'escalated'
  | 'awaiting_seller'
  | 'seller_replied'
  | 'resolved';

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
}

export interface ConversationListItem {
  id: string;
  listing_id: string;
  listing_title: string;
  status: ConversationStatus;
  last_message_at: string;
  last_message_preview: string | null;
  unread_by_buyer: number;
  unread_by_seller: number;
  created_at: string;
}

export interface ConversationDetail {
  id: string;
  listing_id: string;
  listing_title: string;
  buyer_id: string;
  seller_id: string;
  status: ConversationStatus;
  last_message_at: string;
  unread_by_buyer: number;
  unread_by_seller: number;
  messages: ConversationMessage[];
  created_at: string;
}

// ============================================================================
// Data Request types — matches backend app/schemas/data_request.py
// ============================================================================

export type DataRequestStatus = 'draft' | 'open' | 'matched' | 'responses_received' | 'fulfilled' | 'closed' | 'expired';
export type DataRequestUrgency = 'low' | 'normal' | 'high' | 'urgent';
export type RequestPublicationDecision = 'eligible' | 'action_required' | 'needs_review' | 'ineligible';
export type RequestPublicationReason =
  | 'eligible'
  | 'email_verification_required'
  | 'public_consent_required'
  | 'public_content_changed'
  | 'contact_or_personal_data_detected'
  | 'automated_check_unavailable'
  | 'safety_uncertain'
  | 'synthetic_identity'
  | 'moderation_rejected'
  | 'consent_withdrawn'
  | 'request_not_open'
  | 'request_expired';

export interface DataRequestListItem {
  id: string;
  slug: string;
  title?: string;
  description: string;
  categories: string[];
  urgency: DataRequestUrgency;
  price_range_min: number | null;
  price_range_max: number | null;
  currency: string;
  status: DataRequestStatus;
  response_count: number;
  buyer_display_name: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface DataRequestDetail extends DataRequestListItem {
  format_preferences: string[];
  regulatory_requirements?: string[];
  provenance_requirements: string | null;
  published_at: string | null;
  expires_at?: string | null;
  jsonld?: Record<string, unknown>;
  indexing?: { index: boolean; robots: string };
  buyer_id: string;
  public_consent_status?: 'required' | 'consented' | 'withdrawn';
  public_consent_at?: string | null;
  public_consent_policy_version?: string | null;
  required_public_consent_policy_version?: string;
  public_content_hash?: string | null;
  publication_decision?: RequestPublicationDecision;
  publication_reason?: RequestPublicationReason;
  publication_decision_version?: number;
  publication_next_action?: string;
}

export interface CreateDataRequestPayload {
  title?: string;
  description: string;
  categories?: string[];
  format_preferences?: string[];
  regulatory_requirements?: string[];
  price_range_min?: number;
  price_range_max?: number;
  currency?: string;
  urgency?: DataRequestUrgency;
  provenance_requirements?: string;
}

export interface DataRequestResponse {
  id: string;
  request_id: string;
  responder_id: string;
  proposal: string;
  proposed_price: number | null;
  timeline: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
}

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
  refresh_token: string;
  token_type: string;
}

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
  role: UserRole;
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

export interface ListingListItem {
  id: string;
  slug: string;
  title?: string;
  short_description: string | null;
  price: number;
  pricing_type: PricingType;
  category: string;
  tags: string[];
  privacy_score: number;
  data_format?: string | null;
  model_provider: ModelProvider;
  trust_level: TrustLevel;
  quality_score: number;
  verification_status: VerificationStatus;
  view_count: number;
  created_at: string;
}

export interface ListingDetail {
  id: string;
  slug: string;
  title?: string;
  description: string;
  short_description: string | null;
  publisher: { name: string; id: string } | null;
  pricing: {
    price: number;
    pricing_type: PricingType;
    subscription_price_monthly: number | null;
  } | null;
  license: string | null;
  category: string;
  secondary_categories: string[] | null;
  tags: string[];
  schema_summary: string | { columns: string[]; column_count: number; sample_types: Record<string, string> } | null;
  row_count: number | null;
  data_format: string | null;
  update_frequency: string | null;
  coverage: Record<string, unknown> | null;
  privacy_score: number;
  quality_score: number;
  searchability_score: number | null;
  compliance_status: ComplianceStatus;
  compliance_frameworks: string[] | null;
  trust_level: TrustLevel;
  verification_status: VerificationStatus;
  is_accessible_for_free: boolean;
  view_count: number;
  inquiry_count: number;
  noindex: boolean;
  created_at: string;
  updated_at: string | null;
  published_at: string | null;
  jsonld?: Record<string, unknown>;
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
  limit?: number;
  offset?: number;
}

export interface SearchResultItem {
  id: string;
  title?: string;
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
  created_at?: string | null;
  verification_status?: VerificationStatus;
  view_count?: number;
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

export interface SellerStats {
  total_listings: number;
  published_listings: number;
  total_views: number;
  total_inquiries: number;
  total_sales: number;
  total_revenue: number;
}

export interface SellerFinancials {
  total_revenue: number;
  pending_payouts: number;
  completed_payouts: number;
}

export interface SellerOrder {
  id: string;
  listing_id: string;
  listing_title: string;
  buyer_email: string;
  amount: number;
  status: string;
  created_at: string;
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
}

export interface BuyerOrderDetail extends BuyerOrder {
  access_url?: string | null;
  access_expires_at?: string | null;
  download_count?: number;
}

export interface OrderEvent {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
}

export interface OrderDownloadResponse {
  download_url: string;
  expires_at?: string;
}

export interface OrderAccessResponse {
  has_access: boolean;
  access_url?: string;
  expires_at?: string;
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

export type DataRequestStatus = 'draft' | 'open' | 'responses_received' | 'fulfilled' | 'closed' | 'expired';
export type DataRequestUrgency = 'low' | 'medium' | 'high' | 'urgent';

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
  format_preferences: string | null;
  provenance_requirements: string | null;
  published_at: string | null;
  owner_id: string;
}

export interface CreateDataRequestPayload {
  title?: string;
  description: string;
  categories?: string[];
  format_preferences?: string;
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

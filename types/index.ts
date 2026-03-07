// ============================================================================
// Auth types — matches backend app/schemas/user.py
// ============================================================================

export type UserRole = 'buyer' | 'seller' | 'admin';
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

// ============================================================================
// Listing types — matches backend app/schemas/listing.py
// ============================================================================

export type ListingStatus = 'draft' | 'pending_review' | 'published' | 'suspended' | 'archived';
export type PricingType = 'one_time' | 'subscription' | 'both';
export type ComplianceStatus = 'not_checked' | 'low_risk' | 'medium_risk' | 'high_risk';
export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'mistral' | 'local';
export type TrustLevel = 'L0' | 'L1' | 'L2' | 'L3';
export type VerificationStatus = 'unverified' | 'verified' | 'premium';

export interface ListingListItem {
  id: string;
  slug: string;
  title: string;
  short_description: string | null;
  price: number;
  pricing_type: PricingType;
  category: string;
  tags: string[];
  privacy_score: number;
  model_provider: ModelProvider;
  trust_level: TrustLevel;
  quality_score: number;
  verification_status: VerificationStatus;
  view_count: number;
  created_at: string;
}

export interface ListingDetail {
  id: string;
  seller_id: string;
  slug: string;
  status: ListingStatus;
  title: string;
  description: string;
  short_description: string | null;
  price: number;
  pricing_type: PricingType;
  subscription_price_monthly: number | null;
  model_provider: ModelProvider;
  category: string;
  secondary_categories: string[] | null;
  tags: string[];
  schema_info: Record<string, unknown>;
  privacy_score: number;
  compliance_status: ComplianceStatus;
  compliance_details: Record<string, unknown> | null;
  trust_level: TrustLevel;
  quality_score: number;
  verification_status: VerificationStatus;
  view_count: number;
  inquiry_count: number;
  purchase_count: number;
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
  title: string;
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

export interface FacetInfo {
  categories: Record<string, number>;
  price: Record<string, number>;
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
  title: string;
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
  title: string;
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
  title: string;
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

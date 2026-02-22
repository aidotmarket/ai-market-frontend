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

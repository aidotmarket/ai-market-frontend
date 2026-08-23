import type { FeaturedItem } from '../lib/api';
import type { SearchResultItem, VerificationRowCount } from './index';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Expect<Value extends true> = Value;
type OptionalKeys<Value> = {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  [Key in keyof Value]-?: {} extends Pick<Value, Key> ? Key : never;
}[keyof Value];

type SearchResultItemFields = Expect<Equal<
  keyof SearchResultItem,
  | 'id'
  | 'title'
  | 'slug'
  | 'description'
  | 'short_description'
  | 'category'
  | 'price'
  | 'privacy_score'
  | 'compliance_status'
  | 'data_format'
  | 'source_row_count'
  | 'tags'
>>;

type FeaturedItemFields = Expect<Equal<
  keyof FeaturedItem,
  | 'listing_id'
  | 'seller_id'
  | 'slug'
  | 'title'
  | 'summary'
  | 'canonical_url'
  | 'locale'
  | 'source'
  | 'slot'
  | 'price'
  | 'placement_id'
>>;

type SearchResultItemOptionalFields = Expect<Equal<
  OptionalKeys<SearchResultItem>,
  never
>>;

type FeaturedItemOptionalFields = Expect<Equal<
  OptionalKeys<FeaturedItem>,
  never
>>;

const searchResultItemFixture = {
  id: 'listing-1',
  title: 'Example dataset',
  slug: 'example-dataset',
  description: null,
  short_description: null,
  category: 'business',
  price: 25,
  privacy_score: null,
  compliance_status: null,
  data_format: null,
  source_row_count: null,
  tags: null,
} satisfies SearchResultItem;

const featuredItemFixture = {
  listing_id: '11111111-1111-1111-1111-111111111111',
  seller_id: '22222222-2222-2222-2222-222222222222',
  slug: 'example-dataset',
  title: 'Example dataset',
  summary: null,
  canonical_url: 'https://ai.market/listings/example-dataset',
  locale: 'en',
  source: 'curated',
  slot: 0,
  price: {
    currency: null,
    amount: null,
    label: 'On request',
    on_request: true,
  },
  placement_id: null,
} satisfies FeaturedItem;

const validSampleEstimate: VerificationRowCount['method'] = 'deterministic_sample_estimate(10)';

// @ts-expect-error The backend accepts positive integer sample sizes only.
const zeroSampleEstimate: VerificationRowCount['method'] = 'deterministic_sample_estimate(0)';
// @ts-expect-error The backend rejects negative sample sizes.
const negativeSampleEstimate: VerificationRowCount['method'] = 'deterministic_sample_estimate(-1)';
// @ts-expect-error The backend rejects fractional sample sizes.
const fractionalSampleEstimate: VerificationRowCount['method'] = 'deterministic_sample_estimate(1.5)';

void validSampleEstimate;
void zeroSampleEstimate;
void negativeSampleEstimate;
void fractionalSampleEstimate;
void searchResultItemFixture;
void featuredItemFixture;
void (null as unknown as SearchResultItemFields);
void (null as unknown as FeaturedItemFields);
void (null as unknown as SearchResultItemOptionalFields);
void (null as unknown as FeaturedItemOptionalFields);

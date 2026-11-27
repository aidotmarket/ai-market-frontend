export const VERIFIED_DOMAIN_CHIP = 'Verified domain';
export const VERIFIED_DOMAIN_EXPLANATION = "This seller has a verified email address at a web domain whose control ai.market checked by DNS. It does not verify the seller's name, legal identity or data quality.";
export const verifiedDomainAriaLabel = () => `${VERIFIED_DOMAIN_CHIP}. ${VERIFIED_DOMAIN_EXPLANATION}`;

export const NO_RATINGS_YET = 'No ratings yet';
export const SELLER_RATINGS_UNAVAILABLE = 'Seller ratings unavailable';
export const SELLER_RATINGS_LABEL = 'Seller ratings';
export const sellerRatingText = (average: number, count: number) => `${average}/5 from ${count} ${count === 1 ? 'rating' : 'ratings'}`;

export const COMPANY_NAME_FORM_LABEL = 'Company name setting';
export const COMPANY_NAME_TOGGLE_LABEL = "Show my company's name and company rating on my listings";
export const COMPANY_NAME_TOGGLE_NOTE = "Your company's administrator must also choose to show the name.";
export const COMPANY_NAME_SAVE = 'Save company name setting';
export const COMPANY_NAME_SAVING = 'Saving company name setting...';
export const COMPANY_NAME_SAVED = 'Company name setting saved.';
export const COMPANY_NAME_SAVE_FAILED = 'Could not update the company name setting. Please try again.';

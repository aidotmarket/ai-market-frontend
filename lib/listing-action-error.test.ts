import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ACTION_AUTH_REFRESH } from './action-auth-error';
import { listingDraftError, formatListingActionError, LISTING_ACTION_FALLBACK, LISTING_ACTION_WORKSPACE } from './listing-action-error';

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

const readinessGap = {
  error: 'capability_required', capability: 'seller', persisted_status: 'active',
  missing_steps: ['stripe_payouts_live'], reason: 'readiness_gap',
};

it.each([readinessGap, { detail: readinessGap }, { detail: { ...readinessGap, code: 'capability_required' } }])
('maps seller readiness errors to setup guidance: %j', data => {
  expect(formatListingActionError({ response: { data } })).toEqual({
    message: 'Finish seller setup first: Stripe payouts, then try again.', setupHref: '/dashboard',
  });
});

it('uses readable shared step labels and hides unknown step identifiers', () => {
  expect(formatListingActionError({ response: { data: { ...readinessGap,
    missing_steps: ['profile_name', 'company_name', 'totp_enabled', 'stripe_payouts_live', 'internal_step'],
  } } })).toEqual({
    message: 'Finish seller setup first: Profile name, Company name, 2FA, Stripe payouts, remaining setup steps, then try again.',
    setupHref: '/dashboard',
  });
});

it('keeps unknown structured details in the console only', () => {
  const error = { response: { data: { error: 'internal_error', secret: 'backend diagnostic' } } };
  expect(formatListingActionError(error)).toEqual({ message: "That didn't work. Please try again or contact support." });
  expect(console.error).toHaveBeenCalledExactlyOnceWith('Listing action failed', error);
});

it.each(['This listing has active orders.', { response: { data: 'This listing has active orders.' } }])
('preserves a plain string error: %j', error => {
  expect(formatListingActionError(error)).toEqual({ message: 'This listing has active orders.' });
});

it('maps network errors to the generic sentence and logs the original error', () => {
  const error = new Error('Network Error');
  expect(formatListingActionError(error)).toEqual({ message: LISTING_ACTION_FALLBACK });
  expect(console.error).toHaveBeenCalledExactlyOnceWith('Listing action failed', error);
});

it.each([
  { detail: { code: 'capability_required', message: '<b>unsafe</b>' } },
  { code: 'capability_required' },
  { code: 'capability_required', detail: { code: 'other' } },
])('dashboard_unpublish_capability_object_is_sentence: %j', data => {
  expect(formatListingActionError({ response: { status: 409, data } })).toEqual({
    message: LISTING_ACTION_WORKSPACE, workspaceHref: '/dashboard/seller-workspace',
  });
});

it('dashboard_unpublish_string_detail', () => {
  expect(formatListingActionError({ response: { data: { detail: '  This listing has active orders.  ' } } }))
    .toEqual({ message: '  This listing has active orders.  ' });
});

it.each([
  {}, [], { message: 'Object message' }, ['Array message'], null, undefined, 42, false,
  '', '  ', '<script>alert(1)</script>', '<img src=x onerror=alert(1)>',
  '{"code":"unknown"}', '["unknown"]', '[object Object]', 'unsafe\u0000text',
])('dashboard_unpublish_malformed_detail_uses_fallback: %j', detail => {
  expect(formatListingActionError({ response: { data: { detail } } }))
    .toEqual({ message: LISTING_ACTION_FALLBACK });
});

it.each([undefined, null, new Error('Network failure'), { response: { data: '<html>failure</html>' } }])
('uses fallback for unknown failures: %j', error => {
  expect(formatListingActionError(error)).toEqual({ message: LISTING_ACTION_FALLBACK });
});

it.each([
  { detail: 'RECENT_LOGIN_REQUIRED' },
  { detail: { code: 'REAUTH_REQUIRED' } },
  { code: 'insufficient_assurance' },
  { error: 'SECOND_FACTOR_REQUIRED' },
])('preserves authentication refresh handling: %j', data => {
  expect(formatListingActionError({ response: { data } })).toEqual({ message: ACTION_AUTH_REFRESH });
});

it('never stringifies arbitrary response data', () => {
  const toString = () => { throw new Error('Must not coerce'); };
  const toJSON = () => { throw new Error('Must not stringify'); };
  expect(formatListingActionError({ response: { data: { detail: { toString, toJSON } } } }))
    .toEqual({ message: LISTING_ACTION_FALLBACK });
});

it.each(['DRAFT_IN_PROGRESS','DRAFT_ALREADY_PUBLISHED'])('uses the plain backend sentence for %s',code=>{
 expect(listingDraftError({response:{data:{detail:{code,message:'A plain sentence.'}}}})).toEqual({message:'A plain sentence.',alreadyPublished:code==='DRAFT_ALREADY_PUBLISHED'});
 expect(formatListingActionError({response:{status:409,data:{detail:{code,message:'A plain sentence.'}}}})).toEqual({message:'A plain sentence.'});
});
it.each([{},[],null,42,'{"code":"oops"}','[object Object]','bad\u0000text','<b>text</b>'])('rejects malformed draft messages: %j',message=>{
 expect(listingDraftError({response:{data:{detail:{code:'DRAFT_ALREADY_PUBLISHED',message}}}})).toBeNull();
 expect(formatListingActionError({response:{status:409,data:{detail:{code:'DRAFT_IN_PROGRESS',message}}}})).toEqual({message:LISTING_ACTION_FALLBACK});
});

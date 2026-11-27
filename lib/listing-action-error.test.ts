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
  expect(formatListingActionError(error)).toEqual({ message: LISTING_ACTION_FALLBACK });
  expect(console.error).toHaveBeenCalledExactlyOnceWith('Listing action failed', error);
});

it('maps network errors to the generic sentence and logs the original error', () => {
  const error = new Error('Network Error');
  expect(formatListingActionError(error)).toEqual({ message: LISTING_ACTION_FALLBACK });
  expect(console.error).toHaveBeenCalledExactlyOnceWith('Listing action failed', error);
});

it.each([408, 429, 500, 503])('keeps retry guidance for HTTP %i', status => {
  const error = { response: { status, data: { detail: 'Private backend diagnostic' } } };
  expect(formatListingActionError(error)).toEqual({ message: LISTING_ACTION_FALLBACK });
});

it.each([400, 403, 404, 409])('uses fixed refusal copy for HTTP %i', status => {
  const error = { response: { status, data: {
    status: 503, message: 'Private backend diagnostic', detail: { message: 'Internal validation failure' },
  } } };
  expect(formatListingActionError(error)).toEqual({
    message: "This listing can't be updated. Contact support if you need help.",
  });
  expect(formatListingActionError(error, 'delete')).toEqual({
    message: "This listing can't be deleted. Contact support if you need help.",
  });
});

it('gives the seller fixed correction guidance for HTTP 422 listing updates', () => {
  const error = { response: { status: 422, data: { detail: [
    { loc: ['body', 'title'], msg: 'Synthetic title validation diagnostic', type: 'value_error' },
  ] } } };
  expect(formatListingActionError(error)).toEqual({ message: 'Check the listing details and try again.' });
  expect(formatListingActionError(error, 'delete')).toEqual({
    message: "This listing can't be deleted. Contact support if you need help.",
  });
});

it('uses refresh guidance for a final HTTP 401', () => {
  const error = { response: { status: 401, data: { detail: 'Synthetic authentication diagnostic' } } };
  expect(formatListingActionError(error)).toEqual({ message: ACTION_AUTH_REFRESH });
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

it('matches the active-orders conflict from the dashboard fixture', () => {
  expect(formatListingActionError({ response: { status: 409, data: { detail: 'This listing has active orders.' } } }))
    .toEqual({ message: 'This listing has active orders. Wait until those orders are resolved before changing the listing.' });
});

it.each([
  'This listing has active orders.',
  { response: { status: 409, data: { detail: 'This listing has active orders. Internal order ID: 123' } } },
  { response: { status: 409, data: { detail: { message: 'This listing has active orders.' } } } },
  { response: { status: 409, data: 'This listing has active orders.' } },
  { response: { status: 503, data: { detail: 'This listing has active orders.' } } },
])('does not infer active orders outside the exact conflict contract: %j', error => {
  expect(formatListingActionError(error).message).not.toContain('active orders');
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

it.each(['DRAFT_IN_PROGRESS','DRAFT_ALREADY_PUBLISHED'])('uses customer copy for %s',code=>{
 expect(listingDraftError({response:{data:{detail:{code,message:'A plain sentence.'}}}})).toEqual({message:code==='DRAFT_ALREADY_PUBLISHED'?'This draft has already been published. Start another listing to choose new files.':'You already have a listing draft in progress. Open Seller Workspace to finish it before starting another.',alreadyPublished:code==='DRAFT_ALREADY_PUBLISHED'});
 expect(formatListingActionError({response:{status:409,data:{detail:{code,message:'A plain sentence.'}}}})).toEqual({message:code==='DRAFT_ALREADY_PUBLISHED'?'This draft has already been published. Start another listing to choose new files.':'You already have a listing draft in progress. Open Seller Workspace to finish it before starting another.'});
});
it.each([{},[],null,42,'{"code":"oops"}','[object Object]','bad\u0000text','<b>text</b>'])('rejects malformed draft messages: %j',message=>{
 expect(listingDraftError({response:{data:{detail:{code:'DRAFT_ALREADY_PUBLISHED',message}}}})).toBeNull();
 expect(formatListingActionError({response:{status:409,data:{detail:{code:'DRAFT_IN_PROGRESS',message}}}})).toEqual({message:"This listing can't be updated. Contact support if you need help."});
});

it.each([
 ['This listing is managed in Seller Workspace. To stop new sales, open Seller Workspace, choose Manage listings, then Pause new sales.', 'Pause new sales'],
 ['This listing is managed in Seller Workspace. To sell it again, open Seller Workspace, choose Manage listings, then Resume sales.', 'Resume sales'],
])('maps real Workspace refusal: %s', (detail, action) => {
 const result = formatListingActionError({response:{status:409,data:{detail}}});
 expect(result.workspaceHref).toBe('/dashboard/seller-workspace');
 expect(result.message).toContain(action);
 expect(result.message).not.toContain('Try again');
});

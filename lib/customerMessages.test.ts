import { expect, it } from 'vitest';
import { customerRefusal, TWO_FACTOR_REFUSALS, INQUIRY_REFUSALS, customerLoadError, customerActionError } from './customerMessages';

it('names the failed read and gives a next step without server details', () => {
  expect(customerLoadError('listings')).toBe("We couldn't load your listings just now. Try again, or contact support if it keeps happening.");
});
it('names the failed action and gives a next step', () => {
  expect(customerActionError('save your listing')).toBe("We couldn't save your listing just now. Try again, or contact support if it keeps happening.");
});

it.each([
  ['Invalid verification code', "That code didn't match"],
  ['Too many verification attempts. Wait up to 10 minutes, then restart 2FA setup.', 'Wait up to 10 minutes'],
  ['2FA setup session expired', 'Restart two-factor authentication setup'],
])('maps 2FA refusal %s', (detail, expected) => {
  expect(customerRefusal({response:{data:{detail}}}, TWO_FACTOR_REFUSALS, 'generic')).toContain(expected);
});
it.each([
  ['Message held for review. Please revise and try again.', 'Please revise your message'],
  ['Message could not be safely mediated. Please revise and try again.', 'Please revise your message'],
  ['Inquiry is closed', 'This conversation is closed'],
  ['Already waiting for seller response', 'already waiting for a reply'],
])('maps inquiry refusal %s', (detail, expected) => {
  expect(customerRefusal({response:{data:{detail}}}, INQUIRY_REFUSALS, 'generic')).toContain(expected);
});
it.each(['private diagnostic', [{msg:'private validation text'}], {message:'private diagnostic'}, null])('never echoes unknown detail %j', detail => {
  expect(customerRefusal({response:{data:{detail}}}, INQUIRY_REFUSALS, 'generic')).toBe('generic');
});
it('matches a code without trusting its message', () => {
  expect(customerRefusal({response:{data:{detail:{code:'known',message:'private diagnostic'}}}}, {known:'Customer guidance'}, 'generic')).toBe('Customer guidance');
});

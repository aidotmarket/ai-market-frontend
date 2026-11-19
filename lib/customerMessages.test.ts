import { expect, it } from 'vitest';
import { customerLoadError, customerActionError } from './customerMessages';

it('names the failed read and gives a next step without server details', () => {
  expect(customerLoadError('listings')).toBe("We couldn't load your listings just now. Try again, or contact support if it keeps happening.");
});
it('names the failed action and gives a next step', () => {
  expect(customerActionError('save your listing')).toBe("We couldn't save your listing just now. Try again, or contact support if it keeps happening.");
});

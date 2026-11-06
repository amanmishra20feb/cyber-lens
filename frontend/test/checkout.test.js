import test from 'node:test';
import assert from 'node:assert/strict';
import { cvvError, expiryError, formatCard, formatExpiry, luhn, upiIdError, validateCard, validateUpi } from '../src/components/checkoutRules.js';

const NOW = new Date(2026, 10, 6); // 6 Nov 2026, fixed so these tests never go stale

test('luhn: accepts published test card numbers and rejects a single wrong digit', () => {
  for (const ok of ['4242424242424242', '4111111111111111', '378282246310005', '4242 4242 4242 4242']) assert.equal(luhn(ok), true, ok);
  for (const bad of ['4242424242424241', '4111111111111112', '378282246310006', '', 'abcd']) assert.equal(luhn(bad), false, bad);
});

test('formatCard and formatExpiry: group as typed, cap the length, and let Backspace delete the slash', () => {
  assert.equal(formatCard('4242424242424242'), '4242 4242 4242 4242');
  assert.equal(formatCard('4242a42'), '4242 42');
  assert.equal(formatCard('1'.repeat(30)), '1111 1111 1111 1111 111'); // 19 digits at most
  assert.equal(formatExpiry('1'), '1');
  assert.equal(formatExpiry('12'), '12'); // no trailing slash, so deleting works
  assert.equal(formatExpiry('123'), '12/3');
  assert.equal(formatExpiry('12/2799'), '12/27');
});

test('expiryError: a card is valid through the last day of its month, and the year is sane', () => {
  assert.equal(expiryError('11/26', NOW), null); // this month
  assert.equal(expiryError('10/26', NOW), 'This card has expired.');
  assert.equal(expiryError('01/30', NOW), null);
  assert.match(expiryError('13/27', NOW), /01 to 12/);
  assert.match(expiryError('00/27', NOW), /01 to 12/);
  assert.match(expiryError('12/2', NOW), /MM\/YY/);
  assert.match(expiryError('', NOW), /MM\/YY/);
  assert.match(expiryError('01/60', NOW), /too far/);
});

test('cvvError and upiIdError: accept real shapes, reject malformed input', () => {
  assert.equal(cvvError('123'), null);
  assert.equal(cvvError('1234'), null);
  for (const bad of ['', '12', '12345', '12a']) assert.ok(cvvError(bad), bad);
  for (const ok of ['name@oksbi', 'first.last-1@ybl', '9876543210@paytm', ' name@bank ']) assert.equal(upiIdError(ok), null, ok);
  for (const bad of ['name', 'name@', '@bank', 'na me@bank', 'a@b@c', 'a@b', 'name@bank1', '']) assert.ok(upiIdError(bad), bad);
});

test('validateCard and validateUpi: report every failing field, and nothing else', () => {
  assert.deepEqual(validateCard({ number: '4242 4242 4242 4242', expiry: '12/27', cvv: '123', name: 'Test User' }, NOW), {});
  assert.deepEqual(Object.keys(validateCard({ number: '4242 4242 4242 4241', expiry: '01/20', cvv: '1', name: ' ' }, NOW)), ['number', 'expiry', 'cvv', 'name']);
  assert.deepEqual(validateUpi({ app: 'GPay', id: '' }), {}); // an app alone is enough
  assert.deepEqual(validateUpi({ app: '', id: 'name@ybl' }), {}); // so is a valid ID
  assert.deepEqual(Object.keys(validateUpi({ app: '', id: '' })), ['upi']);
  assert.deepEqual(Object.keys(validateUpi({ app: 'GPay', id: 'not-an-id' })), ['upi']); // a typed ID must be well formed
});

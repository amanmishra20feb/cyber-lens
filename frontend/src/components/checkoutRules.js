// Pure validation and formatting for the mock checkout. Nothing here sends or stores anything.
// Each *Error function returns a message the user can act on, or null when the value is fine.

export const digits = (text) => text.replace(/\D/g, '');

// Luhn check: double every second digit from the right, subtract 9 from doubles over 9, the sum must end in 0.
export function luhn(number) {
  const d = digits(number);
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return d.length > 0 && sum % 10 === 0;
}

// shortcut: groups of four for every card; Amex's 4-6-5 grouping is not applied. Add brand detection if real payments arrive.
export const formatCard = (input) => digits(input).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');

// The slash only appears once a third digit is typed, so Backspace can always delete it.
export function formatExpiry(input) {
  const d = digits(input).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function cardNumberError(value) {
  const d = digits(value);
  if (!d) return 'Enter the card number.';
  if (d.length < 13 || d.length > 19) return 'Card numbers have 13 to 19 digits.';
  return luhn(d) ? null : 'This card number does not look right. Check each digit.';
}

export function expiryError(value, now = new Date()) {
  const match = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return 'Enter the expiry as MM/YY.';
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return 'The month must be 01 to 12.';
  if (now >= new Date(year, month, 1)) return 'This card has expired.'; // valid through the last day of its month
  if (year > now.getFullYear() + 20) return 'That expiry is too far ahead. Check the year.';
  return null;
}

export const cvvError = (value) => (/^\d{3,4}$/.test(value) ? null : 'The security code has 3 or 4 digits.');

export const cardNameError = (value) => (value.trim().length >= 2 ? null : 'Enter the name on the card.');

// A UPI ID (VPA) is a handle, "@", then the bank or app name: name@bank.
export const upiIdError = (value) => (/^[a-z0-9._-]{2,64}@[a-z]{2,32}$/i.test(value.trim()) ? null : 'Enter a UPI ID like name@bank.');

// Returns {field: message} for every field that fails; an empty object means the card details are valid.
export function validateCard({ number, expiry, cvv, name }, now = new Date()) {
  const errors = { number: cardNumberError(number), expiry: expiryError(expiry, now), cvv: cvvError(cvv), name: cardNameError(name) };
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
}

// A UPI payment needs a chosen app or a UPI ID; a typed ID must be well formed even when an app is chosen.
export function validateUpi({ app, id }) {
  if (id.trim()) return upiIdError(id) ? { upi: upiIdError(id) } : {};
  return app ? {} : { upi: 'Choose a UPI app or enter your UPI ID.' };
}

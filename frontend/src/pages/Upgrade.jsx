import { useState } from 'react';
import { Link } from 'react-router';
import { useMe } from '../auth.jsx';
import { PageTitle } from '../components/PageTitle.jsx';
import { formatCard, formatExpiry, validateCard, validateUpi } from '../components/checkoutRules.js';

// Mock checkout: validates in the browser and then says payments are not enabled. Nothing is sent or stored.
// The inputs deliberately have no `name`, so even if this handler were missing the browser could not submit them anywhere.
const UPI_APPS = ['GPay', 'PhonePe', 'Paytm', 'FamPay', 'BHIM'];
const FIELD_ID = { number: 'card-number', expiry: 'card-expiry', cvv: 'card-cvv', name: 'card-name', upi: 'upi-id' };
const EMPTY_CARD = { number: '', expiry: '', cvv: '', name: '' };
const EMPTY_UPI = { app: '', id: '' };
const inputClass = 'mt-1.5 h-12 w-full rounded-lg border border-rule bg-surface px-4 text-[16px] placeholder:text-muted aria-invalid:border-sev-critical';

function Field({ id, label, error, ...input }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[14px] text-muted">{label}</label>
      <input id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className={inputClass} {...input} />
      {error && <p id={`${id}-error`} className="mt-1.5 text-sev-critical">{error}</p>}
    </div>
  );
}

function Plan({ name, note, items }) {
  return (
    <div className="rounded-xl bg-surface p-5">
      <h3 className="text-[18px] font-medium">{name} <span className="text-[15px] font-normal text-muted">· {note}</span></h3>
      <ul className="mt-3 space-y-1.5 text-muted">{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}

export function UpgradePage() {
  const { data: user } = useMe();
  const [method, setMethod] = useState('upi');
  const [upi, setUpi] = useState(EMPTY_UPI);
  const [card, setCard] = useState(EMPTY_CARD);
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(false);

  const edited = () => { setDone(false); setErrors({}); };
  const submit = (e) => {
    e.preventDefault();
    const found = method === 'upi' ? validateUpi(upi) : validateCard(card);
    setErrors(found);
    setDone(false);
    const first = Object.keys(found)[0];
    if (first) return document.getElementById(FIELD_ID[first])?.focus();
    setCard(EMPTY_CARD); // a demo keeps nothing: drop everything that was typed
    setUpi(EMPTY_UPI);
    setDone(true);
  };

  if (!user) return null;
  return (
    <>
      <PageTitle>Upgrade to Pro</PageTitle>
      <h1 className="text-[28px] font-medium">Upgrade to Pro</h1>
      {user.role !== 'free' ? (
        <p className="mt-4 text-muted">
          {user.role === 'admin' ? 'Admins already have Pro access.' : 'You already have Pro.'}{' '}
          <Link to="/app" className="text-ink underline underline-offset-4">Back to scans</Link>
        </p>
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
          <section aria-labelledby="plans">
            <h2 id="plans" className="text-[22px] font-medium">₹499 a month</h2>
            <p className="mt-2 max-w-[56ch] text-muted">Checkout is a demo for now: nothing is charged, and nothing you type here leaves this page.</p>
            <div className="mt-6 space-y-4">
              <Plan name="Free" note="your plan" items={['3 scans a day', 'Semgrep, Gitleaks and OSV-Scanner', 'Repo map and finding triage']} />
              <Plan name="Pro" note="₹499 a month" items={['25 scans a day', 'Everything in Free', 'AI explanation and fix for each finding (not enabled yet)']} />
            </div>
          </section>

          <form onSubmit={submit} noValidate aria-labelledby="pay" className="rounded-xl bg-surface p-6">
            <h2 id="pay" className="text-[22px] font-medium">Payment</h2>
            <div className="mt-4 flex gap-1" role="group" aria-label="Payment method">
              {[['upi', 'UPI'], ['card', 'Card']].map(([value, label]) => (
                <button key={value} type="button" aria-pressed={method === value} onClick={() => { setMethod(value); edited(); }} className={`h-10 rounded-lg px-4 ${method === value ? 'bg-control font-medium text-ink' : 'text-muted hover:text-ink'}`}>{label}</button>
              ))}
            </div>

            {method === 'upi' ? (
              <div className="mt-5 space-y-5">
                <fieldset>
                  <legend className="text-[14px] text-muted">Pay with a UPI app</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {UPI_APPS.map((app) => (
                      <button key={app} type="button" aria-pressed={upi.app === app} onClick={() => { edited(); setUpi({ ...upi, app: upi.app === app ? '' : app }); }} className={`h-10 rounded-lg px-4 ${upi.app === app ? 'bg-ink font-medium text-bg' : 'bg-control hover:opacity-80'}`}>{app}</button>
                    ))}
                  </div>
                </fieldset>
                <Field id="upi-id" label="Or enter your UPI ID" placeholder="name@bank" autoComplete="off" spellCheck={false} autoCapitalize="none" value={upi.id} error={errors.upi} onChange={(e) => { edited(); setUpi({ ...upi, id: e.target.value }); }} />
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <Field id="card-number" label="Card number" placeholder="1234 5678 9012 3456" inputMode="numeric" autoComplete="cc-number" maxLength={23} value={card.number} error={errors.number} onChange={(e) => { edited(); setCard({ ...card, number: formatCard(e.target.value) }); }} />
                <div className="grid grid-cols-2 gap-4">
                  <Field id="card-expiry" label="Expiry" placeholder="MM/YY" inputMode="numeric" autoComplete="cc-exp" maxLength={5} value={card.expiry} error={errors.expiry} onChange={(e) => { edited(); setCard({ ...card, expiry: formatExpiry(e.target.value) }); }} />
                  <Field id="card-cvv" label="Security code" type="password" inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={card.cvv} error={errors.cvv} onChange={(e) => { edited(); setCard({ ...card, cvv: e.target.value.replace(/\D/g, '') }); }} />
                </div>
                <Field id="card-name" label="Name on card" autoComplete="cc-name" maxLength={60} value={card.name} error={errors.name} onChange={(e) => { edited(); setCard({ ...card, name: e.target.value }); }} />
              </div>
            )}

            <button type="submit" className="mt-6 h-12 w-full rounded-lg bg-ink text-[16px] font-medium text-bg hover:opacity-90">Pay now</button>
            <p className="mt-3 text-[14px] text-muted">Demo checkout: nothing is charged, sent or saved.</p>
            <div role="status">
              {done && <p className="mt-4 rounded-lg bg-raised p-4">Payments are not enabled yet. Ask an admin to grant Pro. Nothing was sent or saved, and what you typed was cleared.</p>}
            </div>
          </form>
        </div>
      )}
    </>
  );
}

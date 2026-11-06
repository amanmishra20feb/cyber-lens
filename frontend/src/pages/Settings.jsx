import { useState } from 'react';
import { useMe } from '../auth.jsx';
import { PageTitle } from '../components/PageTitle.jsx';

const PLAN_TEXT = { free: 'Free (3 scans a day)', pro: 'Pro (25 scans a day)', admin: 'Admin (no daily limit)' };

const THEMES = [
  { value: 'light', label: 'Light', note: 'Best on a projector.' },
  { value: 'dark', label: 'Dark', note: 'Easier on the eyes at night.' },
];

function Appearance() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const choose = (value) => {
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem('theme', value); } catch { /* private mode: the choice just won't persist */ }
    setTheme(value);
  };
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="sr-only">Theme</legend>
      {THEMES.map((t) => (
        <label key={t.value} className={`cursor-pointer rounded-lg p-4 ${theme === t.value ? 'bg-control' : 'bg-raised hover:bg-control'} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]`}>
          <input type="radio" name="theme" value={t.value} checked={theme === t.value} onChange={() => choose(t.value)} className="sr-only" />
          <span className="block font-medium">{t.label}</span>
          <span className="block text-[14px] text-muted">{t.note}</span>
        </label>
      ))}
    </fieldset>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="grid gap-4 border-t border-rule py-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12">
      <div>
        <h2 className="text-[18px] font-medium">{title}</h2>
        <p className="mt-1 text-muted">{description}</p>
      </div>
      <div className="rounded-xl bg-surface p-4">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const { data: user } = useMe();
  return (
    <>
      <PageTitle>Settings</PageTitle>
      <h1 className="text-[28px] font-medium">Settings</h1>
      <div className="mt-6">
        <Section title="Appearance" description="Choose how Cyberlens looks. Saved in this browser.">
          <Appearance />
        </Section>
        <Section title="Account" description="Your sign-in details. Changing them is not available yet.">
          <dl className="space-y-3">
            {[['Name', user?.name], ['Email', user?.email], ['Plan', PLAN_TEXT[user?.role]]].map(([k, v]) => (
              <div key={k} className="flex gap-4">
                <dt className="w-20 shrink-0 text-muted">{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
    </>
  );
}

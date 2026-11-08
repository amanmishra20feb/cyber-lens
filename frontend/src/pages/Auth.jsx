import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { useMe } from '../auth.jsx';
import { Logo } from '../components/Logo.jsx';
import { PageTitle } from '../components/PageTitle.jsx';

const field = 'mt-2 block h-10 w-full rounded-lg border border-rule bg-surface px-3 text-[15px] text-ink placeholder:text-muted';

export function AuthPage({ mode }) {
  const signup = mode === 'signup';
  const { data: user } = useMe();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // only redirect to paths inside the app, never to another site
  const next = params.get('next')?.startsWith('/app') ? params.get('next') : '/app';

  if (user) return <Navigate to={next} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await api(signup ? '/auth/signup' : '/auth/login', { body: Object.fromEntries(new FormData(e.currentTarget)) });
      queryClient.setQueryData(['me'], user);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <main className="page-in mx-auto flex min-h-dvh max-w-[400px] flex-col justify-center px-4 py-12">
      {/* shifted left so the name, not the icon, lines up with the centred text */}
      <div className="mb-10 flex -translate-x-5.5 justify-center">
        <Logo className="h-13" />
      </div>
      <PageTitle>{signup ? 'Create your account' : 'Sign in'}</PageTitle>
      <h1 className="text-center text-[22px] font-medium">{signup ? 'Create your account' : 'Sign in'}</h1>
      <p className="mt-1 text-center text-muted">{signup ? 'Scan public GitHub repos for security problems.' : 'Welcome back.'}</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        {signup && (
          <label className="block font-medium">
            Name
            <input name="name" required maxLength={80} autoComplete="name" className={field} />
          </label>
        )}
        <label className="block font-medium">
          Email
          <input name="email" type="email" required autoComplete="email" className={field} />
        </label>
        <label className="block font-medium">
          Password
          <input name="password" type="password" required minLength={8} maxLength={72} autoComplete={signup ? 'new-password' : 'current-password'} aria-describedby={signup ? 'pw-hint' : undefined} className={field} />
          {signup && <span id="pw-hint" className="mt-1 block text-[14px] font-normal text-muted">At least 8 characters.</span>}
        </label>
        {error && <p role="alert" className="text-sev-critical">{error}</p>}
        <button disabled={busy} className="h-10 w-full rounded-lg bg-ink font-medium text-bg hover:opacity-90 disabled:opacity-60">
          {busy ? (signup ? 'Creating account…' : 'Signing in…') : signup ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-center text-muted">
        {signup ? 'Already have an account? ' : 'New to Cyberlens? '}
        <Link to={signup ? '/login' : '/signup'} className="text-ink underline underline-offset-4">
          {signup ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </main>
  );
}

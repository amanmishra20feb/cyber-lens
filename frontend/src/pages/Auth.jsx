import { Link, Navigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { useMe } from '../auth.jsx';
import { Logo } from '../components/Logo.jsx';
import { PageTitle } from '../components/PageTitle.jsx';

// Google's own four-colour mark; its sign-in guidelines ask for it on the button
const GoogleG = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className="size-5">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const GOOGLE_ERRORS = {
  google_denied: 'Google sign-in was cancelled.',
  google_failed: 'Google sign-in did not finish. Try again.',
  google_email: 'Google did not confirm that email address. Use another account.',
  google_exists: 'An account with this email already exists. Sign in with its password.',
};

const field = 'mt-2 block h-12 w-full rounded-lg border border-rule bg-surface px-4 text-[16px] text-ink placeholder:text-muted';

export function AuthPage({ mode }) {
  const signup = mode === 'signup';
  const { data: user } = useMe();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  // only redirect to paths inside the app, never to another site
  const next = params.get('next')?.startsWith('/app') ? params.get('next') : '/app';
  const keepNext = next === '/app' ? '' : `?next=${encodeURIComponent(next)}`;

  const { data: providers } = useQuery({ queryKey: ['providers'], queryFn: () => api('/auth/providers'), staleTime: Infinity });
  const googleError = GOOGLE_ERRORS[params.get('error')];

  // once the user is known, the redirect below takes over
  const auth = useMutation({
    mutationFn: (body) => api(signup ? '/auth/signup' : '/auth/login', { body }),
    onSuccess: ({ user }) => queryClient.setQueryData(['me'], user),
  });

  if (user) return <Navigate to={next} replace />;

  const submit = (e) => {
    e.preventDefault();
    auth.mutate(Object.fromEntries(new FormData(e.currentTarget)));
  };

  return (
    <main className="page-in mx-auto flex min-h-dvh max-w-[460px] flex-col justify-center px-4 py-12">
      {/* shifted left so the name, not the icon, lines up with the centred text */}
      <div className="mb-10 flex -translate-x-6.5 justify-center">
        <Logo className="h-15" />
      </div>
      <PageTitle>{signup ? 'Create your account' : 'Sign in'}</PageTitle>
      <h1 className="text-center text-[30px] font-medium">{signup ? 'Create your account' : 'Sign in'}</h1>
      <p className="mt-2 text-center text-[17px] text-muted">{signup ? 'Scan public GitHub repos for security problems.' : 'Welcome back.'}</p>
      {googleError && <p role="alert" className="mt-6 text-center text-sev-critical">{googleError}</p>}
      <form onSubmit={submit} className="mt-10 space-y-5">
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
        {auth.error && <p role="alert" className="text-sev-critical">{auth.error.message}</p>}
        <button disabled={auth.isPending} className="h-12 w-full rounded-lg bg-ink text-[17px] font-medium text-bg hover:opacity-90 disabled:opacity-60">
          {auth.isPending ? (signup ? 'Creating account…' : 'Signing in…') : signup ? 'Create account' : 'Sign in'}
        </button>
      </form>
      {providers?.google && (
        <>
          <p className="my-6 flex items-center gap-3 text-muted before:h-px before:flex-1 before:bg-rule after:h-px after:flex-1 after:bg-rule">or</p>
          <a href={`/api/auth/google?next=${encodeURIComponent(next)}`} className="flex h-12 w-full items-center justify-center gap-3 text-[17px] rounded-lg border border-rule bg-surface font-medium text-ink hover:bg-raised">
            <GoogleG />
            Continue with Google
          </a>
        </>
      )}
      <p className="mt-6 text-center text-muted">
        {signup ? 'Already have an account? ' : 'New to Cyberlens? '}
        <Link to={(signup ? '/login' : '/signup') + keepNext} className="text-ink underline underline-offset-4">
          {signup ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </main>
  );
}

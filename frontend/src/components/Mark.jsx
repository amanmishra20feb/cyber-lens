// Cyberlens logo: a lens over four tiles
export function Mark({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="2" width="9" height="9" rx="2" fill="currentColor" />
      <rect x="13" y="2" width="9" height="9" rx="2" fill="currentColor" opacity=".35" />
      <rect x="2" y="13" width="9" height="9" rx="2" fill="currentColor" opacity=".35" />
      <circle cx="17.5" cy="17.5" r="4.5" fill="none" stroke="var(--brand)" strokeWidth="2.5" />
    </svg>
  );
}

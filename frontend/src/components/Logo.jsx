// The logo files hold the mark and the name; one per theme, the other is hidden in styles.css.
export function Logo({ className = '' }) {
  return ['light', 'dark'].map((theme) => (
    <img key={theme} src={`/logo-${theme}.svg`} alt="Cyberlens" className={`logo-${theme} ${className}`} />
  ));
}

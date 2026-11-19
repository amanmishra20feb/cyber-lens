import { SEVERITY_TEXT } from '../format.js';

export const FILL = { critical: 'bg-sev-critical', high: 'bg-sev-high', medium: 'bg-sev-medium', low: 'bg-sev-low' };

// always the word next to the marker, never colour alone
export function Severity({ level }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-[3px] ${FILL[level]}`} />
      {SEVERITY_TEXT[level]}
    </span>
  );
}

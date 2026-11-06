const COLOR = { critical: 'bg-sev-critical', high: 'bg-sev-high', medium: 'bg-sev-medium', low: 'bg-sev-low' };
const LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

// Severity is always the word plus the rounded marker, never colour alone.
export function Severity({ level }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-[3px] ${COLOR[level]}`} />
      {LABEL[level]}
    </span>
  );
}

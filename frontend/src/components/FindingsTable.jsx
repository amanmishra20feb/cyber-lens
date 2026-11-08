import { useLayoutEffect, useRef, useState } from 'react';
import { ENGINE_NAMES, OWASP_2025, SEVERITIES, STATUS_LABEL } from '../format.js';
import { FindingDrawer } from './FindingDrawer.jsx';
import { Severity } from './Severity.jsx';

const FILTERS = {
  severity: { label: 'Severity', values: (f) => [f.severity], text: (v) => v[0].toUpperCase() + v.slice(1), order: SEVERITIES },
  engine: { label: 'Engine', values: (f) => f.engines, text: (v) => ENGINE_NAMES[v] ?? v },
  owasp: { label: 'OWASP', values: (f) => f.owasp, text: (v) => `${v} ${OWASP_2025[v] ?? ''}` },
};
const NO_FILTER = { severity: '', engine: '', owasp: '' };
// Rows highlight as one rounded pill. The divider is a pseudo-element, because a border would curve at the rounded corners.
const cell = 'relative py-3 align-top transition-colors before:transition-opacity before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-rule group-hover:bg-raised group-hover:before:opacity-0 group-focus-within:bg-raised group-focus-within:before:opacity-0';

// The whole list is already loaded, so filtering happens here. Tab counts follow the filters.
export function Findings({ findings, file, onFile }) {
  const [tab, setTab] = useState('open');
  const [filters, setFilters] = useState(NO_FILTER);
  const [openId, setOpenId] = useState(null);
  const openAt = useRef(0); // row position when the drawer opened
  const table = useRef(null);
  const tabs = useRef(null);

  // the highlight is measured because tab widths change with their counts
  useLayoutEffect(() => {
    const pill = tabs.current.firstChild;
    const place = () => {
      const active = tabs.current?.querySelector('[aria-pressed=true]');
      if (!active) return;
      pill.style.width = `${active.offsetWidth}px`;
      pill.style.transform = `translateX(${active.offsetLeft}px)`;
    };
    place();
    void pill.offsetWidth; // so the first position does not animate
    pill.classList.add('tab-slide');
    document.fonts.ready.then(place);
  });

  const matching = findings.filter((f) => (!file || f.file === file) && Object.entries(FILTERS).every(([k, d]) => !filters[k] || d.values(f).includes(filters[k])));
  const rows = matching.filter((f) => f.status === tab);
  const count = (status) => matching.filter((f) => f.status === status).length;
  const filtered = !!file || Object.values(filters).some(Boolean);
  const open = openId && findings.find((f) => f.id === openId);

  const options = (key) => {
    const { values, order } = FILTERS[key];
    const all = [...new Set(findings.flatMap(values))];
    return order ? order.filter((v) => all.includes(v)) : all.sort();
  };
  const openFinding = (id, index) => { openAt.current = index; setOpenId(id); };
  // triage can move the row out of this tab, so focus whichever row is now in its place
  const closeDrawer = () => {
    setOpenId(null);
    requestAnimationFrame(() => {
      if (document.activeElement !== document.body) return;
      const buttons = table.current?.querySelectorAll('[data-row]');
      buttons?.[Math.min(openAt.current, buttons.length - 1)]?.focus();
    });
  };
  // up/down arrows move between rows; Enter already works because each row is a button
  const move = (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!step) return;
    const buttons = [...e.currentTarget.querySelectorAll('[data-row]')];
    const next = buttons[buttons.indexOf(document.activeElement) + step];
    if (next) { e.preventDefault(); next.focus(); }
  };

  return (
    <>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div ref={tabs} className="relative flex gap-1" role="group" aria-label="Status">
          <span aria-hidden="true" className="absolute inset-y-0 left-0 rounded-lg bg-control" />
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={`relative h-9 rounded-lg px-3 ${tab === value ? 'font-medium text-ink' : 'text-muted hover:text-ink'}`}>
              {label} <span className="num">{count(value)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {Object.entries(FILTERS).map(([key, { label, text }]) => (
            <label key={key} className="block text-[14px] text-muted">
              {label}
              <select value={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })} className="mt-1 block h-9 max-w-52 rounded-lg border border-rule bg-surface px-3 text-[15px] text-ink">
                <option value="">All</option>
                {options(key).map((v) => <option key={v} value={v}>{text(v)}</option>)}
              </select>
            </label>
          ))}
        </div>
      </div>

      {file && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 text-muted">
          Only findings in <span className="break-all text-ink">{file}</span>
          <button type="button" onClick={() => onFile(null)} className="text-ink underline underline-offset-4">Show all files</button>
        </p>
      )}

      {rows.length === 0 ? (
        <p className="mt-6 text-muted" role="status">
          {filtered ? `No ${STATUS_LABEL[tab].toLowerCase()} findings match these filters. ` : `No ${STATUS_LABEL[tab].toLowerCase()} findings. `}
          {filtered && <button type="button" onClick={() => { setFilters(NO_FILTER); onFile(null); }} className="text-ink underline underline-offset-4">Clear filters</button>}
        </p>
      ) : (
        <table className="mt-4 w-full table-fixed border-separate border-spacing-0 text-left">
          <thead className="text-[14px] text-muted">
            <tr>
              <th scope="col" className="w-28 py-2 pl-3 pr-4 font-normal">Severity</th>
              <th scope="col" className="py-2 pr-4 font-normal">Finding</th>
              <th scope="col" className="hidden w-[30%] py-2 pr-4 font-normal md:table-cell">Location</th>
              <th scope="col" className="hidden w-24 py-2 pr-3 font-normal md:table-cell">OWASP</th>
            </tr>
          </thead>
          <tbody ref={table} onKeyDown={move}>
            {rows.map((f, index) => {
              const where = `${f.file}${f.line ? `:${f.line}` : ''}`;
              return (
                <tr key={f.id} onClick={() => openFinding(f.id, index)} className="group cursor-pointer">
                  <td className={`${cell} rounded-l-xl pl-3 pr-4 before:left-3`}><Severity level={f.severity} /></td>
                  <td className={`${cell} pr-4 max-md:rounded-r-xl max-md:pr-3 max-md:before:right-3`}>
                    <button type="button" data-row className="text-left font-medium hover:underline underline-offset-4">{f.title}</button>
                    <span className="mt-1 block truncate text-muted md:hidden">{where}</span>
                  </td>
                  <td className={`${cell} hidden truncate pr-4 text-muted md:table-cell`} title={where}>{where}</td>
                  <td className={`${cell} num hidden pr-3 text-muted md:table-cell md:rounded-r-xl md:before:right-3`}>{f.owasp.join(', ') || '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {open && <FindingDrawer key={open.id} finding={open} onClose={closeDrawer} />}
    </>
  );
}

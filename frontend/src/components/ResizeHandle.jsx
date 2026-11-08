export const SIDEBAR = { min: 224, max: 420, initial: 240, step: 16 };
export const clampWidth = (width) => Math.min(SIDEBAR.max, Math.max(SIDEBAR.min, Math.round(width)));

// Sidebar resize handle (desktop only). Arrow keys move it (Shift = faster), Home/End jump to the limits,
// Enter or double-click resets. The sidebar starts at x = 0, so clientX is the new width.
export function ResizeHandle({ width, onChange }) {
  const key = (e) => {
    const step = (e.shiftKey ? 3 : 1) * SIDEBAR.step;
    const next = { ArrowLeft: width - step, ArrowRight: width + step, Home: SIDEBAR.min, End: SIDEBAR.max, Enter: SIDEBAR.initial }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onChange(clampWidth(next));
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR.min}
      aria-valuemax={SIDEBAR.max}
      tabIndex={0}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) onChange(clampWidth(e.clientX)); }}
      onKeyDown={key}
      onDoubleClick={() => onChange(SIDEBAR.initial)}
      className="absolute inset-y-0 -right-[3px] z-20 hidden w-[7px] cursor-col-resize touch-none hover:bg-ink/10 focus-visible:bg-ink/10 active:bg-ink/15 md:block"
    />
  );
}

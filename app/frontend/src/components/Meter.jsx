const clampPct = (v) => Math.max(0, Math.min(100, Number(v) || 0));

/** Bare meter bar. */
export default function Meter({ value, accent, height, style }) {
  return (
    <div className="meter" style={{ '--acc': accent, height, ...style }}>
      <i style={{ width: `${clampPct(value)}%` }} />
    </div>
  );
}

/** Meter with value number to the right (table cells). */
export function MeterRow({ value, accent, suffix = '' }) {
  return (
    <div className="mrow" style={{ '--acc': accent }}>
      <div className="meter" style={{ flex: 1 }}>
        <i style={{ width: `${clampPct(value)}%` }} />
      </div>
      <span className="num mut" style={{ fontSize: 12 }}>{Math.round(Number(value) || 0)}{suffix}</span>
    </div>
  );
}

/** Labeled meter (stat lists). */
export function LabeledMeter({ label, value, accent, display }) {
  return (
    <div className="mlabeled" style={{ '--acc': accent }}>
      <div className="t"><span>{label}</span><b>{display ?? `${Math.round(Number(value) || 0)}%`}</b></div>
      <div className="meter"><i style={{ width: `${clampPct(value)}%` }} /></div>
    </div>
  );
}

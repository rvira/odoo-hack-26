export default function Pill({ tone = 'mut', children }) {
  return <span className={`pill p-${tone}`}>{children}</span>;
}

export function Chip({ children, mono }) {
  return <span className={mono ? 'chip mono' : 'chip'}>{children}</span>;
}

/* Functional states use the framework triples (ok/warn/dgr — DESIGN_FRAMEWORK
 * §2.3): warning doubles as "pending", danger is overdue/blocked/rejected only.
 * Lifecycle stages keep pillar identity (soc/gov) where they carry it. */
const STATUS = {
  pending: ['Pending', 'warn'],
  approved: ['Approved', 'ok'],
  rejected: ['Rejected', 'dgr'],
  open: ['Open', 'warn'],
  overdue: ['Overdue ⏰', 'dgr'],
  resolved: ['Resolved', 'ok'],
  in_progress: ['In progress', 'sec'],
  under_review: ['Under review', 'gov'],
  active: ['Active', 'ok'],
  on_track: ['On track', 'ok'],
  at_risk: ['At risk', 'warn'],
  missed: ['Missed', 'dgr'],
  completed: ['Completed', 'ok'],
  draft: ['Draft', 'mut'],
  archived: ['Archived', 'mut'],
};

/** Maps an API status string (any case / spaces / underscores) to a status pill. */
export function StatusPill({ status }) {
  const key = String(status ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  const hit = STATUS[key];
  if (hit) return <Pill tone={hit[1]}>{hit[0]}</Pill>;
  return <Pill tone="mut">{String(status ?? '—')}</Pill>;
}

export function SeverityPill({ severity }) {
  const s = String(severity ?? '').toLowerCase();
  const tone = s === 'high' || s === 'critical' ? 'dgr' : s === 'medium' ? 'warn' : 'mut';
  const label = s ? s[0].toUpperCase() + s.slice(1) : '—';
  return <Pill tone={tone}>{label}</Pill>;
}

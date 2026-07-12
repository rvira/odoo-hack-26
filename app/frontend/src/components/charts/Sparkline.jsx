export default function Sparkline({ values, color = 'var(--env)' }) {
  const vals = (values || []).map(Number);
  if (vals.length < 2) return null;
  const hi = Math.max(...vals), lo = Math.min(...vals), r = hi - lo || 1;
  const w = 60 / (vals.length - 1);
  const pts = vals.map((v, i) => `${(i * w).toFixed(1)},${(14 - ((v - lo) / r) * 11).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" viewBox="0 0 60 16" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,16 ${pts} 60,16`} fill={color} opacity=".1" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Simple bar chart with x labels, ported from the wireframe's barChart(). */
export default function BarChart({ values, labels, color = 'var(--env)', max }) {
  const vals = (values || []).map(Number);
  const hi = max || Math.max(...vals, 1);
  const w = 100 / (vals.length || 1);
  return (
    <div>
      <svg className="chart" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="bar chart">
        {[10, 20, 30].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="var(--line2)" strokeWidth=".4" />
        ))}
        {vals.map((v, i) => {
          const h = (v / hi) * 34;
          return <rect key={i} x={(i * w + w * 0.22).toFixed(2)} y={(38 - h).toFixed(2)}
            width={(w * 0.56).toFixed(2)} height={h.toFixed(2)} rx="1.2" fill={color} />;
        })}
      </svg>
      {labels && (
        <div className="xlbls">{labels.map((m, i) => <span key={i}>{m}</span>)}</div>
      )}
    </div>
  );
}

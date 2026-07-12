/**
 * Conic-gradient donut, like the wireframe.
 * parts: [{ value, color }] — slice size proportional to value.
 * center: text shown in the hole (supports \n line breaks via CSS pre-line).
 */
export default function Donut({ parts, center, size = 132 }) {
  const usable = parts.filter((p) => Number(p.value) > 0);
  const total = usable.reduce((a, p) => a + Number(p.value), 0) || 1;
  let acc = 0;
  const stops = usable.map((p) => {
    const from = (acc / total) * 100;
    acc += Number(p.value);
    return `${p.color} ${from.toFixed(1)}% ${((acc / total) * 100).toFixed(1)}%`;
  }).join(',');
  return (
    <div className="donut" data-c={center}
      style={{ width: size, height: size, background: usable.length ? `conic-gradient(${stops})` : 'var(--line2)' }} />
  );
}

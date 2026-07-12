import { useState } from 'react';

/* Catmull-Rom → cubic bezier, ported from the wireframe's smoothD(). */
export function smoothD(vals, X, Y) {
  const p = vals.map((v, i) => [X(i), Y(v)]);
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} `
      + `${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} `
      + `${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Multi-series smoothed line chart with toggleable legend chips, target line
 * and hover tooltips — ported from the wireframe's scoreTrendPanel().
 * series: [{ key, label, color, values, bold? }]
 */
export default function TrendChart({ months, series, target, height = 215 }) {
  const [hidden, setHidden] = useState({});
  const [showTarget, setShowTarget] = useState(target != null);
  const toggle = (key) => setHidden((h) => ({ ...h, [key]: !h[key] }));

  const vis = series.filter((s) => !hidden[s.key] && s.values && s.values.length);
  const n = months.length;
  const X = (i) => i * (100 / (n - 1));

  const legend = (
    <div className="lgd" style={{ marginTop: 12 }} role="group" aria-label="Toggle series">
      {series.map((s) => (
        <button key={s.key} type="button" className={hidden[s.key] ? 'off' : ''} onClick={() => toggle(s.key)}>
          <i style={{ background: s.color }} /><span>{s.label}</span>
        </button>
      ))}
      {target != null && (
        <button type="button" className={showTarget ? '' : 'off'} onClick={() => setShowTarget(!showTarget)}>
          <i className="dash" /><span>Target {target}</span>
        </button>
      )}
    </div>
  );

  if (!vis.length) {
    return (
      <div>
        <p className="hint" style={{ padding: '40px 0', textAlign: 'center' }}>
          All series hidden — click a chip below to plot one.
        </p>
        {legend}
      </div>
    );
  }

  const flat = vis.flatMap((s) => s.values.map(Number));
  let lo = Math.min(...flat) - 3, hi = Math.max(...flat) + 3;
  if (showTarget && target != null) { lo = Math.min(lo, target - 3); hi = Math.max(hi, target + 3); }
  const Y = (v) => 2 + (1 - (v - lo) / (hi - lo)) * 42;
  const step = (hi - lo) > 26 ? 10 : 5;
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);

  const hsW = 100 / (n - 1);

  return (
    <div>
      <div className="tchart">
        <div className="ylbls">
          {ticks.map((v) => <span key={v} style={{ top: `${(Y(v) / 48 * 100).toFixed(1)}%` }}>{v}</span>)}
        </div>
        <svg className="chart" viewBox="0 0 100 48" preserveAspectRatio="none" role="img"
          aria-label="12 month trend" style={{ height }}>
          {ticks.map((v) => (
            <line key={v} x1="0" y1={Y(v).toFixed(1)} x2="100" y2={Y(v).toFixed(1)}
              stroke="var(--line2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {showTarget && target != null && (
            <line x1="0" y1={Y(target).toFixed(1)} x2="100" y2={Y(target).toFixed(1)}
              stroke="var(--ink)" strokeWidth="1.3" strokeDasharray="5 4" opacity=".4" vectorEffect="non-scaling-stroke" />
          )}
          {vis.map((s) => (
            <path key={s.key} d={smoothD(s.values.map(Number), X, Y)} fill="none" stroke={s.color}
              strokeWidth={s.bold ? 2.6 : 1.7} opacity={s.bold ? 1 : 0.85}
              strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
          {vis.map((s) => s.values.map((v, i) => (
            <circle key={`${s.key}-${i}`} cx={X(i).toFixed(1)} cy={Y(Number(v)).toFixed(1)} r="1" fill={s.color} />
          )))}
        </svg>
        <div className="hotspots">
          {months.map((m, i) => {
            const left = Math.max(0, X(i) - hsW / 2);
            const width = Math.min(100 - left, hsW);
            const clamp = i < 2 ? { left: 0, transform: 'none' }
              : i > n - 3 ? { left: 'auto', right: 0, transform: 'none' } : {};
            return (
              <div className="hs" key={i} style={{ left: `${left}%`, width: `${width}%` }}>
                <div className="tip" style={clamp}>
                  <b>{m}</b>
                  {vis.map((s, j) => (
                    <span key={s.key}>
                      {j > 0 && <br />}
                      <i style={{ background: s.color }} />{s.label} <b style={{ display: 'inline' }}>{s.values[i]}</b>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="xlbls" style={{ marginLeft: 30 }}>
        {months.map((m, i) => <span key={i}>{m}</span>)}
      </div>
      {legend}
    </div>
  );
}

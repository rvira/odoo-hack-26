import Sparkline from './charts/Sparkline.jsx';

export default function KpiCard({ label, value, accent = 'var(--env)', suffix = '', delta, spark }) {
  return (
    <div className="kpi" style={{ '--acc': accent }}>
      <p className="lbl">{label}</p>
      <p className="val">{value}{suffix ? <small>{suffix}</small> : null}</p>
      {delta && (
        <p className={`delta ${delta.dir}`}>
          {delta.dir === 'down' ? '▼' : delta.dir === 'up' ? '▲' : ''} {delta.text}
        </p>
      )}
      {spark && spark.length > 1 && <Sparkline values={spark} color={accent} />}
    </div>
  );
}

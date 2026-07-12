export default function Toggle({ title, sub, on, onChange }) {
  return (
    <div className="toggle" onClick={() => onChange(!on)} role="switch" aria-checked={!!on} tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!on); } }}>
      <div className="tl">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </div>
      <span className={`sw${on ? ' on' : ''}`} />
    </div>
  );
}

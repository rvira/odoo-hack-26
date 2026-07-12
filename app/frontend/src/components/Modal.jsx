export default function Modal({ title, sub, onClose, serverError, children, footer }) {
  return (
    <div className="modal-bg" role="dialog" aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <h2>{title}</h2>
        {sub && <p className="sub">{sub}</p>}
        {serverError && <p className="servererr">⚠️ {serverError}</p>}
        {children}
        {footer && <div className="foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, error, children }) {
  return (
    <div className={`field${error ? ' err' : ''}`}>
      {label && <label>{label}</label>}
      {children}
      {error && <p className="msg">{error}</p>}
    </div>
  );
}

/**
 * Kanban board matching the wireframe.
 * columns: [{ name, dotColor, cards: [{ key, body, onClick? }] }]
 * Cards with onClick get pointer + hover-lift styling and keyboard support.
 */
export default function Kanban({ columns }) {
  return (
    <div className="kanban">
      {columns.map((col) => (
        <div className="kcol" key={col.name}>
          <h3>
            <span className="dot" style={{ background: col.dotColor }} />
            {col.name}
            <span className="n">{col.cards.length}</span>
          </h3>
          {col.cards.length === 0
            ? <div className="kempty">No challenges</div>
            : col.cards.map((c) => (
              <div className={`kcard${c.onClick ? ' clickable' : ''}`} key={c.key}
                onClick={c.onClick}
                role={c.onClick ? 'button' : undefined}
                tabIndex={c.onClick ? 0 : undefined}
                onKeyDown={c.onClick
                  ? (e) => {
                    if (e.target !== e.currentTarget) return; // let inner buttons act
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.onClick(); }
                  }
                  : undefined}>
                {c.body}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Kanban board matching the wireframe.
 * columns: [{ name, dotColor, cards: [{ key, body, onClick?, draggable? }] }]
 * Cards with onClick get pointer + hover-lift styling and keyboard support.
 * Pass onDropCard(cardKey, toColumn) to enable HTML5 drag & drop; only cards
 * flagged draggable can be picked up (the buttons on cards keep working).
 */
export default function Kanban({ columns, onDropCard }) {
  return (
    <div className="kanban">
      {columns.map((col) => (
        <div className="kcol" key={col.name}
          onDragOver={onDropCard ? (e) => e.preventDefault() : undefined}
          onDrop={onDropCard
            ? (e) => {
              e.preventDefault();
              const key = e.dataTransfer.getData('text/plain');
              if (key) onDropCard(key, col.name);
            }
            : undefined}>
          <h3>
            <span className="dot" style={{ background: col.dotColor }} />
            {col.name}
            <span className="n">{col.cards.length}</span>
          </h3>
          {col.cards.length === 0
            ? <div className="kempty">No challenges</div>
            : col.cards.map((c) => (
              <div className={`kcard${c.onClick ? ' clickable' : ''}`} key={c.key}
                draggable={Boolean(onDropCard && c.draggable)}
                onDragStart={onDropCard && c.draggable
                  ? (e) => e.dataTransfer.setData('text/plain', String(c.key))
                  : undefined}
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

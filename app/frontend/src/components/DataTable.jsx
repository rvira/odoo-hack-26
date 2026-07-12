/**
 * Horizontal-scrolling table matching the wireframe.
 * columns: ["Ref", "Date", ...]
 * rows: [{ key, className?, cells: [node, ...] }]
 */
export default function DataTable({ columns, rows, empty = 'No records yet.' }) {
  return (
    <div className="tscroll">
      <table>
        <thead>
          <tr>{columns.map((c, i) => <th key={i}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="mut" style={{ textAlign: 'center', padding: '18px 10px' }}>{empty}</td></tr>
          ) : rows.map((r) => (
            <tr key={r.key} className={r.className || undefined}>
              {r.cells.map((cell, i) => <td key={i} className={r.cellClass ? r.cellClass[i] : undefined}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Horizontal-scrolling table matching the wireframe.
 * columns: ["Ref", "Date", ...] — or { label, num: true } for numeric columns,
 * which right-aligns the header to line up with the right-aligned .num cells.
 * rows: [{ key, className?, cells: [node, ...] }]
 */
export default function DataTable({ columns, rows, empty = 'No records yet.' }) {
  const cols = columns.map((c) => (typeof c === 'string' ? { label: c } : c));
  return (
    <div className="tscroll">
      <table>
        <thead>
          <tr>{cols.map((c, i) => <th key={i} className={c.num ? 'num' : undefined}>{c.label}</th>)}</tr>
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

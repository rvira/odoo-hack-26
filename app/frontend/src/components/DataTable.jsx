import { useState } from 'react';

/**
 * Horizontal-scrolling table matching the wireframe.
 * columns: ["Ref", "Date", ...] — or { label, num: true } for numeric columns,
 * which right-aligns the header to line up with the right-aligned .num cells.
 * rows: [{ key, className?, cells: [node, ...] }]
 * Long tables paginate client-side (pageSize rows per page, default 10).
 */
export default function DataTable({ columns, rows, empty = 'No records yet.', pageSize = 10 }) {
  const cols = columns.map((c) => (typeof c === 'string' ? { label: c } : c));
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const p = Math.min(page, pages - 1); // clamp if rows shrank after a reload
  const visible = rows.slice(p * pageSize, (p + 1) * pageSize);

  return (
    <div className="tscroll">
      <table>
        <thead>
          <tr>{cols.map((c, i) => <th key={i} className={c.num ? 'num' : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="mut" style={{ textAlign: 'center', padding: '18px 10px' }}>{empty}</td></tr>
          ) : visible.map((r) => (
            <tr key={r.key} className={r.className || undefined}>
              {r.cells.map((cell, i) => <td key={i} className={r.cellClass ? r.cellClass[i] : undefined}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {pages > 1 && (
        <div className="pager">
          <span>{p * pageSize + 1}–{Math.min((p + 1) * pageSize, rows.length)} of {rows.length}</span>
          <button className="btn out sm" disabled={p === 0} onClick={() => setPage(p - 1)}>‹ Prev</button>
          <span className="pager-page">{p + 1} / {pages}</span>
          <button className="btn out sm" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next ›</button>
        </div>
      )}
    </div>
  );
}

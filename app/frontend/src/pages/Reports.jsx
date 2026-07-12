import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, apiDownload } from '../api.js';
import { useApi } from '../hooks.js';
import Tabs from '../components/Tabs.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import { Field } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';

const TABS = [
  ['summary', 'ESG Summary'],
  ['environmental', 'Environmental'],
  ['social', 'Social'],
  ['governance', 'Governance'],
  ['builder', 'Custom Builder'],
];

function ExportButton({ kind }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await apiDownload(`/reports/${kind}/export?format=csv`, `${kind}-report.csv`);
      toast('⬇ CSV exported — check your downloads');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
      <button className="btn pri sm" disabled={busy} onClick={run}>{busy ? 'Exporting…' : 'Export CSV'}</button>
    </div>
  );
}

function Summary() {
  const { data, error, loading } = useApi('/reports/summary');
  if (loading) return <p className="loading">Loading summary…</p>;
  if (error) return <p className="loaderr">⚠️ {error}</p>;
  const s = data.scores;
  return (
    <>
      <div className="grid g4">
        <KpiCard label="Environmental" value={Math.round(s.E)} accent="var(--env)" suffix=" / 100" />
        <KpiCard label="Social" value={Math.round(s.S)} accent="var(--soc)" suffix=" / 100" />
        <KpiCard label="Governance" value={Math.round(s.G)} accent="var(--gov)" suffix=" / 100" />
        <KpiCard label="Overall ESG" value={Math.round(s.overall)} accent="var(--ink)" suffix=" / 100" />
      </div>
      <section className="card">
        <h2>ESG Summary</h2>
        <p className="sub">Executive overview — all scores with department comparison</p>
        <DataTable columns={['Department', { label: 'E', num: true }, { label: 'S', num: true }, { label: 'G', num: true }, { label: 'Total', num: true }]}
          rows={data.dept_scores.map((d) => ({
            key: d.department,
            cells: [
              <span className="b">{d.department}</span>,
              <span className="num">{Math.round(d.E)}</span>,
              <span className="num">{Math.round(d.S)}</span>,
              <span className="num">{Math.round(d.G)}</span>,
              <span className="b num">{Math.round(d.total)}</span>,
            ],
          }))} />
        <ExportButton kind="summary" />
      </section>
    </>
  );
}

function Environmental() {
  const { data, error, loading } = useApi('/reports/environmental');
  if (loading) return <p className="loading">Loading report…</p>;
  if (error) return <p className="loaderr">⚠️ {error}</p>;
  return (
    <section className="card">
      <h2>Environmental Report</h2>
      <p className="sub">Emissions by scope, goal progress and source breakdown</p>
      <DataTable columns={['Scope', { label: 'Emissions (YTD)', num: true }, { label: 'Share', num: true }]}
        rows={data.by_scope.map((s) => ({
          key: s.label,
          cells: [
            <span className="b">{s.label}</span>,
            <span className="num">{s.tonnes} t</span>,
            <span className="num">{s.pct}%</span>,
          ],
        }))} />
      <ExportButton kind="environmental" />
    </section>
  );
}

function MetricsReport({ kind, title, sub }) {
  const { data, error, loading } = useApi(`/reports/${kind}`);
  if (loading) return <p className="loading">Loading report…</p>;
  if (error) return <p className="loaderr">⚠️ {error}</p>;
  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="sub">{sub}</p>
      <DataTable columns={['Metric', { label: 'Value', num: true }]}
        rows={data.metrics.map(([label, value]) => ({
          key: label,
          cells: [<span className="b">{label}</span>, <span className="num">{value}</span>],
        }))} />
      <ExportButton kind={kind} />
    </section>
  );
}

const MODULE_OPTIONS = [
  ['', 'All modules'],
  ['environmental', 'Environmental'],
  ['social', 'Social'],
  ['governance', 'Governance'],
  ['gamification', 'Gamification'],
];

function Builder() {
  const toast = useToast();
  const { data: departments } = useApi('/departments');
  const [form, setForm] = useState({ date_from: '', date_to: '', department_id: '', module: '' });
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const run = async () => {
    setBusy(true);
    try {
      const body = {};
      if (form.date_from) body.date_from = form.date_from;
      if (form.date_to) body.date_to = form.date_to;
      if (form.department_id) body.department_id = Number(form.department_id);
      if (form.module) body.module = form.module;
      const res = await api('/reports/builder', { method: 'POST', body });
      setRows(res.rows || []);
      toast(`▶ Report ran — ${res.rows ? res.rows.length : 0} rows match`);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  // download the previewed rows as CSV; cells starting with =+-@ are quoted
  // so spreadsheet apps treat them as text, not formulas
  const download = () => {
    const guard = (v) => {
      const s = String(v ?? '').replaceAll('"', '""');
      return /^[=+\-@]/.test(s) ? `'${s}` : s;
    };
    const lines = [
      ['Date', 'Department', 'Module', 'Metric', 'Value'],
      ...rows.map((r) => [r.date, r.department, r.module, r.metric, r.value]),
    ].map((cells) => cells.map((c) => `"${guard(c)}"`).join(','));
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ecosphere-custom-report.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast('⬇ CSV downloaded');
  };

  return (
    <section className="card">
      <h2>Custom Report Builder</h2>
      <p className="sub">Combine any filters, preview, then export</p>
      <div className="grid g3">
        <Field label="From date">
          <input type="date" value={form.date_from} onChange={set('date_from')} />
        </Field>
        <Field label="To date">
          <input type="date" value={form.date_to} onChange={set('date_to')} />
        </Field>
        <Field label="Department">
          <select value={form.department_id} onChange={set('department_id')}>
            <option value="">All departments</option>
            {(departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Module">
          <select value={form.module} onChange={set('module')}>
            {MODULE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <button className="btn pri sm" disabled={busy} onClick={run}>{busy ? 'Running…' : '▶ Run report'}</button>
        <button className="btn out sm" disabled={!rows || rows.length === 0} onClick={download}
          title={!rows ? 'Run the report first' : rows.length === 0 ? 'No rows to download' : undefined}>
          ⬇ Download CSV
        </button>
      </div>
      {rows && (
        <div style={{ marginTop: 16 }}>
          <h2>Preview — {rows.length} row{rows.length === 1 ? '' : 's'} match</h2>
          <DataTable columns={['Date', 'Department', 'Module', 'Metric', { label: 'Value', num: true }]} empty="No rows match these filters."
            rows={rows.map((r, i) => ({
              key: i,
              cells: [r.date, r.department, r.module, r.metric, <span className="num">{r.value}</span>],
            }))} />
        </div>
      )}
    </section>
  );
}

export default function Reports() {
  const { tab = 'summary' } = useParams();
  const bodies = {
    summary: <Summary />,
    environmental: <Environmental />,
    social: <MetricsReport kind="social" title="Social Report" sub="Diversity, participation and training" />,
    governance: <MetricsReport kind="governance" title="Governance Report" sub="Policies, audits and compliance posture" />,
    builder: <Builder />,
  };
  return (
    <>
      <Tabs base="/reports" tabs={TABS} accent="pri" label="Reporting sections" />
      {bodies[tab] || bodies.summary}
    </>
  );
}

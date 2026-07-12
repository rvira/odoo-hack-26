import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import Tabs from '../components/Tabs.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Pill, { Chip, StatusPill } from '../components/Pill.jsx';
import { MeterRow, LabeledMeter } from '../components/Meter.jsx';
import Modal, { Field } from '../components/Modal.jsx';
import BarChart from '../components/charts/BarChart.jsx';
import Donut from '../components/charts/Donut.jsx';
import { useToast } from '../components/Toast.jsx';

const TABS = [
  ['transactions', 'Carbon Transactions'],
  ['goals', 'Goals'],
  ['products', 'Products (SKU)'],
  ['envdash', 'Environmental Dashboard'],
];

const SOURCES = [
  ['', 'All sources'],
  ['purchase', 'Purchase'],
  ['manufacturing', 'Manufacturing'],
  ['expense', 'Expense'],
  ['fleet', 'Fleet'],
];

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// avoid "Manufacturing · Manufacturing order…" when the description already names the source
const sourceLabel = (t) => (t.source_desc.toLowerCase().startsWith(t.source_type)
  ? t.source_desc
  : `${cap(t.source_type)} · ${t.source_desc}`);

/* ---------- Carbon Transactions ---------- */

function NewTransactionModal({ onClose, onSaved }) {
  const toast = useToast();
  const { data: departments } = useApi('/departments');
  const { data: factors } = useApi('/emission-factors');
  const [form, setForm] = useState({
    source_type: 'purchase', source_desc: '', department_id: '', scope: '1',
    quantity: '', unit: '', emission_factor_id: '', date: '',
  });
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickFactor = (e) => {
    const id = e.target.value;
    const f = (factors || []).find((x) => String(x.id) === id);
    setForm((prev) => ({ ...prev, emission_factor_id: id, unit: f ? f.unit : prev.unit, scope: f ? String(f.scope) : prev.scope }));
  };

  const save = async () => {
    setServerError('');
    setBusy(true);
    try {
      await api('/carbon-transactions', {
        method: 'POST',
        body: {
          source_type: form.source_type,
          source_desc: form.source_desc.trim(),
          department_id: Number(form.department_id),
          scope: Number(form.scope),
          quantity: Number(form.quantity),
          unit: form.unit.trim(),
          emission_factor_id: Number(form.emission_factor_id),
          date: form.date,
        },
      });
      toast('✅ Carbon transaction recorded');
      onSaved();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New carbon transaction" sub="The server validates quantity, unit and date before saving."
      onClose={onClose} serverError={serverError}
      footer={<>
        <button className="btn out" onClick={onClose}>Cancel</button>
        <button className="btn pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save transaction'}</button>
      </>}>
      <Field label="Source type *">
        <select value={form.source_type} onChange={set('source_type')}>
          {SOURCES.slice(1).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Source description *">
        <input value={form.source_desc} onChange={set('source_desc')} placeholder="e.g. Diesel — delivery fleet" maxLength={200} />
      </Field>
      <Field label="Department *">
        <select value={form.department_id} onChange={set('department_id')}>
          <option value="">Select…</option>
          {(departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <Field label="Emission factor *">
        <select value={form.emission_factor_id} onChange={pickFactor}>
          <option value="">Select…</option>
          {(factors || []).map((f) => (
            <option key={f.id} value={f.id}>{f.name} — {f.kgco2e_per_unit} kg/{f.unit}</option>
          ))}
        </select>
      </Field>
      <div className="grid g2" style={{ gap: 10 }}>
        <Field label="Scope *">
          <select value={form.scope} onChange={set('scope')}>
            <option value="1">Scope 1</option><option value="2">Scope 2</option><option value="3">Scope 3</option>
          </select>
        </Field>
        <Field label="Quantity *">
          <input type="number" min="0" step="any" value={form.quantity} onChange={set('quantity')} placeholder="820" />
        </Field>
      </div>
      <div className="grid g2" style={{ gap: 10 }}>
        <Field label="Unit *">
          <input value={form.unit} onChange={set('unit')} placeholder="litre" maxLength={30} />
        </Field>
        <Field label="Date *">
          <input type="date" value={form.date} onChange={set('date')} />
        </Field>
      </div>
    </Modal>
  );
}

function Transactions() {
  const [source, setSource] = useState('');
  const [showNew, setShowNew] = useState(false);
  const path = source ? `/carbon-transactions?source=${encodeURIComponent(source)}` : '/carbon-transactions';
  const { data, error, loading, reload } = useApi(path);

  return (
    <section className="card">
      <h2>Carbon Transactions</h2>
      <p className="sub">Every operational record becomes a carbon transaction automatically</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 13 }}>
        <div className="filters">
          {SOURCES.map(([v, l]) => (
            <button key={v} className={source === v ? 'on' : ''} onClick={() => setSource(v)}>{l}</button>
          ))}
        </div>
        <button className="btn pri sm" onClick={() => setShowNew(true)}>+ New transaction</button>
      </div>
      {loading && <p className="loading">Loading transactions…</p>}
      {error && <p className="loaderr">⚠️ {error}</p>}
      {data && (
        <DataTable
          columns={['Ref', 'Source record', 'Department', 'Scope', 'Quantity', 'Emission factor', 'CO₂e', 'Date']}
          rows={data.map((t) => ({
            key: t.id,
            cells: [
              <span className="mono">{t.ref}</span>,
              <span className="b">{sourceLabel(t)}</span>,
              t.department,
              <Chip>Scope {t.scope}</Chip>,
              <span className="num">{t.quantity} {t.unit}</span>,
              <span className="mut">{t.factor_display}</span>,
              <span className="b num">{Number(t.kgco2e).toLocaleString()} kg</span>,
              <span className="mut">{t.date}</span>,
            ],
          }))} />
      )}
      {showNew && (
        <NewTransactionModal onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); reload(); }} />
      )}
    </section>
  );
}

/* ---------- Goals ---------- */

function NewGoalModal({ onClose, onSaved }) {
  const toast = useToast();
  const { data: departments } = useApi('/departments');
  const [form, setForm] = useState({ name: '', department_id: '', target_value: '', deadline: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Mirrors the wireframe's saveGoal() inline rules; the server enforces the same.
  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required.';
    if (!form.department_id) errs.department_id = 'Pick a department.';
    if (!(Number(form.target_value) > 0)) errs.target_value = 'Target must be a number greater than 0.';
    if (!form.deadline || new Date(form.deadline) <= new Date()) errs.deadline = 'Deadline must be in the future.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    setServerError('');
    if (!validate()) return;
    setBusy(true);
    try {
      await api('/goals', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          department_id: Number(form.department_id),
          target_value: Number(form.target_value),
          deadline: form.deadline,
        },
      });
      toast('✅ Goal saved — tracking starts immediately');
      onSaved();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New sustainability goal" sub="All fields validate before save — the server enforces the same rules."
      onClose={onClose} serverError={serverError}
      footer={<>
        <button className="btn out" onClick={onClose}>Cancel</button>
        <button className="btn pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save goal'}</button>
      </>}>
      <Field label="Goal name *" error={errors.name}>
        <input value={form.name} onChange={set('name')} placeholder="e.g. Reduce fleet emissions 20%" maxLength={120} />
      </Field>
      <Field label="Department *" error={errors.department_id}>
        <select value={form.department_id} onChange={set('department_id')}>
          <option value="">Select…</option>
          {(departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <Field label="Target reduction (tCO₂e) *" error={errors.target_value}>
        <input type="number" min="0" step="any" value={form.target_value} onChange={set('target_value')} placeholder="500" />
      </Field>
      <Field label="Deadline *" error={errors.deadline}>
        <input type="date" value={form.deadline} onChange={set('deadline')} />
      </Field>
    </Modal>
  );
}

function Goals() {
  const { data, error, loading, reload } = useApi('/goals');
  const [showNew, setShowNew] = useState(false);

  const stats = useMemo(() => {
    const goals = data || [];
    const active = goals.filter((g) => String(g.status).toLowerCase() !== 'completed').length;
    const good = goals.filter((g) => ['on track', 'completed'].includes(String(g.status).toLowerCase())).length;
    const avg = goals.length ? Math.round(goals.reduce((a, g) => a + Number(g.progress || 0), 0) / goals.length) : 0;
    return { active, good, avg, total: goals.length };
  }, [data]);

  return (
    <>
      <div className="grid g3">
        <KpiCard label="Active goals" value={stats.active} accent="var(--env)" />
        <KpiCard label="On track / completed" value={stats.good} accent="var(--env)" suffix={` of ${stats.total}`} />
        <KpiCard label="Avg progress" value={stats.avg} accent="var(--env)" suffix="%" />
      </div>
      <section className="card">
        <h2>Sustainability goals</h2>
        <p className="sub">Targets tracked against live carbon transactions</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button className="btn pri sm" onClick={() => setShowNew(true)}>+ New goal</button>
        </div>
        {loading && <p className="loading">Loading goals…</p>}
        {error && <p className="loaderr">⚠️ {error}</p>}
        {data && (
          <DataTable columns={['Goal', 'Department', 'Target CO₂', 'Current', 'Progress', 'Deadline', 'Status']}
            rows={data.map((g) => ({
              key: g.id,
              cells: [
                <span className="b">{g.name}</span>,
                g.department,
                <span className="num">{g.target_value} t</span>,
                <span className="num">{g.current_value} t</span>,
                <div style={{ minWidth: 140 }}><MeterRow value={g.progress} /></div>,
                <span className="mut">{g.deadline}</span>,
                <StatusPill status={g.status} />,
              ],
            }))} />
        )}
      </section>
      {showNew && <NewGoalModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); reload(); }} />}
    </>
  );
}

/* ---------- Products (SKU) ---------- */

function Products() {
  const { data, error, loading } = useApi('/products');
  return (
    <section className="card">
      <h2>Product ESG profiles — per SKU</h2>
      <p className="sub">ESG information linked to products — feeds purchase & manufacturing carbon transactions</p>
      {loading && <p className="loading">Loading products…</p>}
      {error && <p className="loaderr">⚠️ {error}</p>}
      {data && (
        <DataTable columns={['SKU', 'Product', 'Embodied CO₂e', 'ESG weightage', 'Recyclable', 'Rating']}
          rows={data.map((s) => ({
            key: s.id,
            cells: [
              <span className="mono">{s.sku}</span>,
              <span className="b">{s.name}</span>,
              <span className="num">{s.co2_per_unit} kg/unit</span>,
              s.weightage
                ? <Pill tone="env">{String(s.weightage).includes('×') ? s.weightage : `${s.weightage}×`}</Pill>
                : <span className="mut">— default 1.0×</span>,
              <div style={{ minWidth: 120 }}><MeterRow value={s.recyclable_pct} /></div>,
              <span className="b">{s.rating}</span>,
            ],
          }))} />
      )}
      <p className="hint">✦ <b>ESG weightage is optional per SKU</b> — when set, it skews that product's contribution to carbon roll-ups and the product ESG rating. Unset SKUs default to 1.0×.</p>
    </section>
  );
}

/* ---------- Environmental Dashboard ---------- */

const SCOPE_COLORS = ['var(--env)', 'var(--soc)', 'var(--gov)'];

function EnvDash() {
  const { data, error, loading } = useApi('/environmental/summary');
  if (loading) return <p className="loading">Loading environmental summary…</p>;
  if (error) return <p className="loaderr">⚠️ {error}</p>;
  const d = data;
  return (
    <>
      <div className="grid g3">
        <KpiCard label="YTD emissions" value={d.ytd_tonnes} accent="var(--env)" suffix=" tCO₂e" />
        <KpiCard label="vs annual target" value={d.vs_target_pct} accent="var(--env)" suffix="% used" />
        <KpiCard label="Intensity" value={d.intensity} accent="var(--env)" suffix=" t / employee" />
      </div>
      <div className="split">
        <section className="card">
          <h2>Monthly emissions (tCO₂e)</h2>
          <p className="sub">Rolling 12 months</p>
          <BarChart values={d.monthly} labels={d.months} />
        </section>
        <section className="card">
          <h2>Emissions by scope</h2>
          <p className="sub">Share of the YTD footprint</p>
          <div className="donutwrap">
            <Donut center={`${d.ytd_tonnes} t\nYTD`}
              parts={d.by_scope.map((s, i) => ({ value: s.pct, color: SCOPE_COLORS[i % 3] }))} />
            <div style={{ flex: 1, minWidth: 180 }}>
              {d.by_scope.map((s, i) => (
                <LabeledMeter key={s.scope} label={s.label} value={s.pct} accent={SCOPE_COLORS[i % 3]} />
              ))}
            </div>
          </div>
        </section>
      </div>
      <section className="card">
        <h2>Department carbon tracking</h2>
        <p className="sub">Where each department's footprint comes from</p>
        <DataTable columns={['Department', 'Fleet', 'Purchase', 'Mfg', 'Expense', 'Total tCO₂e']}
          rows={d.dept_breakdown.map((r) => ({
            key: r.department,
            cells: [
              <span className="b">{r.department}</span>,
              <span className="num mut">{r.fleet ?? '—'}</span>,
              <span className="num mut">{r.purchase ?? '—'}</span>,
              <span className="num mut">{r.manufacturing ?? '—'}</span>,
              <span className="num mut">{r.expense ?? '—'}</span>,
              <span className="b num">{r.total}</span>,
            ],
          }))} />
      </section>
    </>
  );
}

/* ---------- Page ---------- */

export default function Environmental() {
  const { tab = 'transactions' } = useParams();
  const Body = { transactions: Transactions, goals: Goals, products: Products, envdash: EnvDash }[tab] || Transactions;
  return (
    <>
      <Tabs base="/environmental" tabs={TABS} accent="env" label="Environmental sections" />
      <Body />
    </>
  );
}

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import Tabs from '../components/Tabs.jsx';
import DataTable from '../components/DataTable.jsx';
import Pill, { Chip } from '../components/Pill.jsx';
import Modal, { Field } from '../components/Modal.jsx';
import Toggle from '../components/Toggle.jsx';
import { useToast } from '../components/Toast.jsx';

const TABS = [
  ['departments', 'Departments'],
  ['categories', 'Categories'],
  ['factors', 'Emission Factors'],
  ['config', 'ESG Configuration'],
  ['notifications', 'Notifications'],
];

/* ---------- Departments ---------- */

function NewDepartmentModal({ departments, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', code: '', head: '', parent: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setServerError('');
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required.';
    if (!form.code.trim()) errs.code = 'Code is required.';
    if (!form.head.trim()) errs.head = 'Head is required.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const body = { name: form.name.trim(), code: form.code.trim(), head: form.head.trim() };
      if (form.parent) body.parent_id = Number(form.parent);
      await api('/departments', { method: 'POST', body });
      toast('✅ Department created');
      onSaved();
    } catch (err) {
      setServerError(err.message); // e.g. 409 duplicate code
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New department" sub="Codes must be unique across the organization." onClose={onClose} serverError={serverError}
      footer={<>
        <button className="btn out" onClick={onClose}>Cancel</button>
        <button className="btn pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Create department'}</button>
      </>}>
      <Field label="Name *" error={errors.name}>
        <input value={form.name} onChange={set('name')} placeholder="e.g. Logistics" maxLength={80} />
      </Field>
      <Field label="Code *" error={errors.code}>
        <input value={form.code} onChange={set('code')} placeholder="e.g. LOG" maxLength={10} />
      </Field>
      <Field label="Head *" error={errors.head}>
        <input value={form.head} onChange={set('head')} placeholder="e.g. R. Iyer" maxLength={80} />
      </Field>
      <Field label="Parent department">
        <select value={form.parent} onChange={set('parent')}>
          <option value="">— none —</option>
          {(departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
    </Modal>
  );
}

function Departments() {
  const { data, error, loading, reload } = useApi('/departments');
  const [showNew, setShowNew] = useState(false);
  return (
    <section className="card">
      <h2>Departments</h2>
      <p className="sub">Org hierarchy and ESG ownership</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn pri sm" onClick={() => setShowNew(true)}>+ New department</button>
      </div>
      {loading && <p className="loading">Loading departments…</p>}
      {error && <p className="loaderr">⚠️ {error}</p>}
      {data && (
        <DataTable columns={['Name', 'Code', 'Head', 'Parent', 'Employees', 'Status']}
          rows={data.map((d) => ({
            key: d.id,
            cells: [
              <span className="b">{d.name}</span>,
              <span className="mono">{d.code}</span>,
              d.head,
              <span className="mut">{d.parent || '—'}</span>,
              <span className="num">{d.employee_count}</span>,
              <Pill tone={d.active ? 'ok' : 'mut'}>{d.active ? 'Active' : 'Inactive'}</Pill>,
            ],
          }))} />
      )}
      {showNew && (
        <NewDepartmentModal departments={data} onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); reload(); }} />
      )}
    </section>
  );
}

/* ---------- Categories ---------- */

function NewCategoryModal({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', type: 'csr' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setServerError('');
    if (!form.name.trim()) { setErrors({ name: 'Name is required.' }); return; }
    setErrors({});
    setBusy(true);
    try {
      await api('/categories', { method: 'POST', body: { name: form.name.trim(), type: form.type } });
      toast('✅ Category created');
      onSaved();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New category" sub="Shared across CSR activities and challenges." onClose={onClose} serverError={serverError}
      footer={<>
        <button className="btn out" onClick={onClose}>Cancel</button>
        <button className="btn pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Create category'}</button>
      </>}>
      <Field label="Name *" error={errors.name}>
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Mobility" maxLength={60} />
      </Field>
      <Field label="Type *">
        <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
          <option value="csr">CSR Activity</option>
          <option value="challenge">Challenge</option>
        </select>
      </Field>
    </Modal>
  );
}

function Categories() {
  const { data, error, loading, reload } = useApi('/categories');
  const [showNew, setShowNew] = useState(false);
  return (
    <section className="card">
      <h2>Categories</h2>
      <p className="sub">Shared across CSR activities and challenges</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn pri sm" onClick={() => setShowNew(true)}>+ New category</button>
      </div>
      {loading && <p className="loading">Loading categories…</p>}
      {error && <p className="loaderr">⚠️ {error}</p>}
      {data && (
        <DataTable columns={['Name', 'Type']}
          rows={data.map((c) => ({
            key: c.id,
            cells: [
              <span className="b">{c.name}</span>,
              <Pill tone={c.type === 'challenge' ? 'game' : 'soc'}>{c.type === 'challenge' ? 'Challenge' : 'CSR Activity'}</Pill>,
            ],
          }))} />
      )}
      {showNew && <NewCategoryModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); reload(); }} />}
    </section>
  );
}

/* ---------- Emission Factors ---------- */

function NewFactorModal({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', scope: '1', unit: '', kgco2e_per_unit: '', source: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setServerError('');
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required.';
    if (!form.unit.trim()) errs.unit = 'Unit is required.';
    if (!(Number(form.kgco2e_per_unit) > 0)) errs.kgco2e_per_unit = 'Factor must be greater than 0.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api('/emission-factors', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          scope: Number(form.scope),
          unit: form.unit.trim(),
          kgco2e_per_unit: Number(form.kgco2e_per_unit),
          source: form.source.trim(),
        },
      });
      toast('✅ Emission factor added');
      onSaved();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New emission factor" sub="Master data used by Auto Emission Calculation." onClose={onClose} serverError={serverError}
      footer={<>
        <button className="btn out" onClick={onClose}>Cancel</button>
        <button className="btn pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add factor'}</button>
      </>}>
      <Field label="Name *" error={errors.name}>
        <input value={form.name} onChange={set('name')} placeholder="e.g. Diesel" maxLength={80} />
      </Field>
      <div className="grid g2" style={{ gap: 10 }}>
        <Field label="Scope *">
          <select value={form.scope} onChange={set('scope')}>
            <option value="1">Scope 1</option><option value="2">Scope 2</option><option value="3">Scope 3</option>
          </select>
        </Field>
        <Field label="Unit *" error={errors.unit}>
          <input value={form.unit} onChange={set('unit')} placeholder="litre" maxLength={30} />
        </Field>
      </div>
      <Field label="kg CO₂e per unit *" error={errors.kgco2e_per_unit}>
        <input type="number" min="0" step="any" value={form.kgco2e_per_unit} onChange={set('kgco2e_per_unit')} placeholder="2.68" />
      </Field>
      <Field label="Source">
        <input value={form.source} onChange={set('source')} placeholder="e.g. DEFRA 2025" maxLength={80} />
      </Field>
    </Modal>
  );
}

function Factors() {
  const { data, error, loading, reload } = useApi('/emission-factors');
  const [showNew, setShowNew] = useState(false);
  return (
    <section className="card">
      <h2>Emission Factors</h2>
      <p className="sub">Master data used by Auto Emission Calculation</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn pri sm" onClick={() => setShowNew(true)}>+ New factor</button>
      </div>
      {loading && <p className="loading">Loading factors…</p>}
      {error && <p className="loaderr">⚠️ {error}</p>}
      {data && (
        <DataTable columns={['Name', 'Scope', 'Unit', 'Factor', 'Source']}
          rows={data.map((f) => ({
            key: f.id,
            cells: [
              <span className="b">{f.name}</span>,
              <Chip>Scope {f.scope}</Chip>,
              f.unit,
              <span className="b num">{f.kgco2e_per_unit} kg CO₂e/{f.unit}</span>,
              <span className="mut">{f.source}</span>,
            ],
          }))} />
      )}
      {showNew && <NewFactorModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); reload(); }} />}
    </section>
  );
}

/* ---------- ESG Configuration & Notifications (shared settings PUT) ---------- */

const WEIGHT_META = [
  ['E', 'Environmental', 'var(--env)'],
  ['S', 'Social', 'var(--soc)'],
  ['G', 'Governance', 'var(--gov)'],
];

const RULE_TOGGLES = [
  ['auto_emission', 'Auto Emission Calculation', 'Generate carbon transactions from Purchase / Manufacturing / Expense / Fleet automatically'],
  ['evidence_required', 'Evidence Requirement', 'Block CSR & challenge approvals unless a proof file is attached'],
  ['badge_auto_award', 'Badge Auto-Award', 'Assign badges the moment an unlock rule is satisfied'],
  ['overdue_flagging', 'Overdue issue flagging', 'Daily scheduler flags Open issues past their due date'],
];

const NOTIFY_TOGGLES = [
  ['notify_compliance', 'New compliance issue raised', 'In-app + email to the issue owner'],
  ['notify_decisions', 'CSR / challenge approval decisions', 'Notify the employee on approve or reject'],
  ['notify_ack_reminders', 'Policy acknowledgement reminders', 'Weekly reminder until acknowledged'],
  ['notify_badges', 'Badge unlocks', 'Congratulate the employee in-app'],
];

function useSettingsForm() {
  const { data, error, loading, reload } = useApi('/settings');
  const toast = useToast();
  const [weights, setWeights] = useState(null);
  const [toggles, setToggles] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setWeights({ ...data.weights });
      setToggles({ ...data.toggles });
    }
  }, [data]);

  const save = async () => {
    setBusy(true);
    try {
      await api('/settings', { method: 'PUT', body: { weights, toggles } });
      toast('✅ Settings saved');
      reload();
    } catch (err) {
      toast(err.message); // e.g. 422 weights must sum to 100
    } finally {
      setBusy(false);
    }
  };

  return { error, loading: loading || !weights || !toggles, weights, setWeights, toggles, setToggles, save, busy };
}

function Config() {
  const s = useSettingsForm();
  if (s.loading) return <p className="loading">Loading configuration…</p>;
  if (s.error) return <p className="loaderr">⚠️ {s.error}</p>;

  const sum = WEIGHT_META.reduce((a, [k]) => a + Number(s.weights[k] || 0), 0);
  const valid = sum === 100;

  return (
    <>
      <div className="split">
        <section className="card">
          <h2>ESG score weights</h2>
          <p className="sub">Must total 100% — validated before save</p>
          {WEIGHT_META.map(([k, label, color]) => (
            <div className="mlabeled" key={k}>
              <div className="t"><span>{label}</span><b>{s.weights[k]}%</b></div>
              <input type="range" min="0" max="100" step="5" value={s.weights[k]}
                aria-label={`${label} weight`}
                onChange={(e) => s.setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))}
                style={{ width: '100%', accentColor: color }} />
            </div>
          ))}
          <p className="hint">
            {valid
              ? <>✅ Total <b>100%</b> — valid</>
              : <span style={{ color: 'var(--danger)' }}>⚠️ Total <b>{sum}%</b> — weights must sum to 100 before saving</span>}
          </p>
        </section>
        <section className="card">
          <h2>Business rules</h2>
          <p className="sub">Core platform rules — enforced server-side</p>
          {RULE_TOGGLES.map(([key, title, sub]) => (
            <Toggle key={key} title={title} sub={sub} on={!!s.toggles[key]}
              onChange={(on) => s.setToggles((t) => ({ ...t, [key]: on }))} />
          ))}
        </section>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn pri" disabled={s.busy || !valid}
          title={valid ? undefined : 'Weights must sum to exactly 100%'} onClick={s.save}>
          {s.busy ? 'Saving…' : 'Save configuration'}
        </button>
      </div>
    </>
  );
}

function Notifications() {
  const s = useSettingsForm();
  if (s.loading) return <p className="loading">Loading notification settings…</p>;
  if (s.error) return <p className="loaderr">⚠️ {s.error}</p>;

  return (
    <section className="card">
      <h2>Notification settings</h2>
      <p className="sub">Choose which events notify people, per channel</p>
      {NOTIFY_TOGGLES.map(([key, title, sub]) => (
        <Toggle key={key} title={title} sub={sub} on={!!s.toggles[key]}
          onChange={(on) => s.setToggles((t) => ({ ...t, [key]: on }))} />
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn pri" disabled={s.busy} onClick={s.save}>
          {s.busy ? 'Saving…' : 'Save notification settings'}
        </button>
      </div>
    </section>
  );
}

export default function Settings() {
  const { tab = 'departments' } = useParams();
  const Body = { departments: Departments, categories: Categories, factors: Factors, config: Config, notifications: Notifications }[tab] || Departments;
  return (
    <>
      <Tabs base="/settings" tabs={TABS} accent="pri" label="Settings sections" />
      <Body />
    </>
  );
}

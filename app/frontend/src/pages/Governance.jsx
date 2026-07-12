import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import Tabs from '../components/Tabs.jsx';
import DataTable from '../components/DataTable.jsx';
import Pill, { Chip, StatusPill, SeverityPill } from '../components/Pill.jsx';
import { MeterRow } from '../components/Meter.jsx';
import Modal, { Field } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';

const TABS = [
  ['policies', 'Policies'],
  ['acks', 'Acknowledgements'],
  ['audits', 'Audits'],
  ['issues', 'Compliance Issues'],
  ['certs', 'Certifications'],
];

/* ---------- Policies ---------- */

function Policies() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/policies');
  const [busyId, setBusyId] = useState(null);
  const isEmployee = user && user.role === 'employee';

  const acknowledge = async (id) => {
    setBusyId(id);
    try {
      await api(`/policies/${id}/acknowledge`, { method: 'POST' });
      toast('📋 Policy acknowledged — recorded with timestamp');
      reload();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="card">
      <h2>ESG Policies</h2>
      <p className="sub">Acknowledgement coverage per policy — reminders go out automatically</p>
      {loading && <p className="loading">Loading policies…</p>}
      {error && <p className="loaderr">⚠️ {error}</p>}
      {data && (
        <DataTable columns={isEmployee ? ['Policy', 'Version', 'Updated', 'Acknowledged', ''] : ['Policy', 'Version', 'Updated', 'Acknowledged']}
          rows={data.map((p) => {
            const cells = [
              <span className="b">{p.name}</span>,
              <span className="mono">{p.version}</span>,
              <span className="mut">{p.updated}</span>,
              <div style={{ minWidth: 140 }}>
                <MeterRow value={p.ack_pct} accent={p.ack_pct < 80 ? 'var(--warn)' : 'var(--gov)'} suffix="%" />
              </div>,
            ];
            if (isEmployee) {
              cells.push(p.acked_by_me
                ? <Pill tone="ok">Done</Pill>
                : <button className="btn gov sm" disabled={busyId === p.id} onClick={() => acknowledge(p.id)}>Acknowledge</button>);
            }
            return { key: p.id, cells };
          })} />
      )}
    </section>
  );
}

/* ---------- Acknowledgements ---------- */

function Acks() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/policy-acks');
  const [busyId, setBusyId] = useState(null);
  const isAdmin = user && user.role === 'admin';

  const acknowledge = async (policyId) => {
    setBusyId(policyId);
    try {
      await api(`/policies/${policyId}/acknowledge`, { method: 'POST' });
      toast('📋 Policy acknowledged — recorded with timestamp');
      reload();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="loading">Loading acknowledgements…</p>;
  if (error) return <p className="loaderr">⚠️ {error}</p>;

  if (isAdmin) {
    return (
      <section className="card">
        <h2>Policy acknowledgements</h2>
        <p className="sub">Tracked per employee per policy version</p>
        <DataTable columns={['Employee', 'Policy', 'Version', 'Acknowledged on']} empty="No acknowledgements recorded yet."
          rows={data.map((r, i) => ({
            key: i,
            cells: [
              <span className="b">{r.employee}</span>,
              r.policy,
              <span className="mono">{r.version}</span>,
              r.acknowledged_on || <Pill tone="warn">Pending reminder sent</Pill>,
            ],
          }))} />
      </section>
    );
  }

  return (
    <section className="card">
      <h2>My acknowledgements</h2>
      <p className="sub">One acknowledgement per employee per policy version</p>
      <ul className="alist">
        {data.length === 0 && <li className="mut">Nothing to acknowledge.</li>}
        {data.map((a) => (
          <li key={`${a.policy_id}-${a.version}`}>
            <span className="aico" style={{ background: 'var(--gov-soft)' }}>📋</span>
            <span>
              <b>{a.name}</b> <span className="mono mut">{a.version}</span><br />
              <span className="mut" style={{ fontSize: 12 }}>{a.done ? 'Acknowledged' : `Due ${a.due}`}</span>
            </span>
            {a.done
              ? <span style={{ marginLeft: 'auto' }}><Pill tone="ok">Done</Pill></span>
              : <button className="btn gov sm" style={{ marginLeft: 'auto' }} disabled={busyId === a.policy_id}
                  onClick={() => acknowledge(a.policy_id)}>Acknowledge</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Audits ---------- */

function Audits() {
  const { data, error, loading } = useApi('/audits');
  return (
    <section className="card">
      <h2>Audits</h2>
      <p className="sub">Internal ESG, security (VAPT), certification and safety audits — each can raise linked compliance issues</p>
      {loading && <p className="loading">Loading audits…</p>}
      {error && <p className="loaderr">⚠️ {error}</p>}
      {data && (
        <DataTable columns={['Audit', 'Type', 'Department', 'Auditor', 'Date', 'Linked issues', 'Status']}
          rows={data.map((a) => ({
            key: a.id,
            cells: [
              <span className="b">{a.title}</span>,
              <Chip>{a.type}</Chip>,
              a.department,
              a.auditor,
              <span className="mut">{a.date}</span>,
              a.issue_count
                ? <span style={{ color: 'var(--gov)', fontWeight: 600 }}>{a.issue_count} issue{a.issue_count > 1 ? 's' : ''}</span>
                : <span className="mut">—</span>,
              <StatusPill status={a.status} />,
            ],
          }))} />
      )}
    </section>
  );
}

/* ---------- Compliance Issues ---------- */

function NewIssueModal({ audits, onClose, onSaved }) {
  const toast = useToast();
  const { data: employees } = useApi('/employees');
  const [form, setForm] = useState({ title: '', audit_id: '', severity: 'medium', owner_id: '', due_date: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setServerError('');
    const errs = {};
    if (!form.title.trim()) errs.title = 'Title is required.';
    if (!form.audit_id) errs.audit_id = 'Pick the source audit.';
    if (!form.owner_id) errs.owner_id = 'Owner is mandatory.';
    if (!form.due_date) errs.due_date = 'Due date is mandatory.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api('/compliance-issues', {
        method: 'POST',
        body: {
          title: form.title.trim(),
          audit_id: Number(form.audit_id),
          severity: form.severity,
          owner_id: Number(form.owner_id),
          due_date: form.due_date,
        },
      });
      toast('✅ Issue raised — owner has been notified');
      onSaved();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New compliance issue" sub="Every issue must have an owner and a due date."
      onClose={onClose} serverError={serverError}
      footer={<>
        <button className="btn out" onClick={onClose}>Cancel</button>
        <button className="btn gov" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Raise issue'}</button>
      </>}>
      <Field label="Issue title *" error={errors.title}>
        <input value={form.title} onChange={set('title')} placeholder="e.g. Missing MSDS sheets on line 3" maxLength={200} />
      </Field>
      <Field label="From audit *" error={errors.audit_id}>
        <select value={form.audit_id} onChange={set('audit_id')}>
          <option value="">Select…</option>
          {(audits || []).map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
      </Field>
      <Field label="Severity *">
        <select value={form.severity} onChange={set('severity')}>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </Field>
      <Field label="Owner *" error={errors.owner_id}>
        <select value={form.owner_id} onChange={set('owner_id')}>
          <option value="">Select…</option>
          {(employees || []).map((e) => (
            <option key={e.id} value={e.id}>{e.name}{e.department ? ` — ${e.department}` : ''}</option>
          ))}
        </select>
      </Field>
      <Field label="Due date *" error={errors.due_date}>
        <input type="date" value={form.due_date} onChange={set('due_date')} />
      </Field>
    </Modal>
  );
}

function ResolveModal({ issue, onClose, onSaved }) {
  const toast = useToast();
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState('');
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setServerError('');
    if (!resolution.trim()) { setError('Describe how the issue was resolved.'); return; }
    setError('');
    setBusy(true);
    try {
      await api(`/compliance-issues/${issue.id}/resolve`, { method: 'POST', body: { resolution: resolution.trim() } });
      toast('✅ Issue resolved — logged with resolution note');
      onSaved();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Resolve issue" sub={issue.title} onClose={onClose} serverError={serverError}
      footer={<>
        <button className="btn out" onClick={onClose}>Cancel</button>
        <button className="btn pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Mark resolved'}</button>
      </>}>
      <Field label="Resolution *" error={error}>
        <textarea value={resolution} onChange={(e) => setResolution(e.target.value)}
          placeholder="What was done to close this issue?" maxLength={1000} />
      </Field>
    </Modal>
  );
}

function Issues() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi('/compliance-issues');
  const { data: audits } = useApi('/audits');
  const [showNew, setShowNew] = useState(false);
  const [resolving, setResolving] = useState(null);
  const isAdmin = user && user.role === 'admin';

  return (
    <section className="card">
      <h2>Compliance Issues</h2>
      <p className="sub">Governance violations — ownership is mandatory</p>
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button className="btn gov sm" onClick={() => setShowNew(true)}>+ New issue</button>
        </div>
      )}
      {loading && <p className="loading">Loading issues…</p>}
      {error && <p className="loaderr">⚠️ {error}</p>}
      {data && (
        <DataTable
          columns={isAdmin
            ? ['Issue', 'From audit', 'Severity', 'Owner', 'Due date', 'Status', '']
            : ['Issue', 'From audit', 'Severity', 'Owner', 'Due date', 'Status']}
          rows={data.map((i) => {
            const overdue = String(i.status).toLowerCase() === 'overdue';
            const openish = ['open', 'overdue'].includes(String(i.status).toLowerCase());
            const cells = [
              <span className="b">{i.title}</span>,
              <span className="mut">{i.audit}</span>,
              <SeverityPill severity={i.severity} />,
              i.owner,
              <span className={overdue ? 'b' : 'mut'}>{i.due_date}</span>,
              <StatusPill status={i.status} />,
            ];
            if (isAdmin) {
              cells.push(openish
                ? <button className="btn out sm" onClick={() => setResolving(i)}>Resolve</button>
                : '—');
            }
            return { key: i.id, className: overdue ? 'overdue' : '', cells };
          })} />
      )}
      <p className="hint">⏰ Every issue must have an <b>owner and a due date</b>. Issues past due while still Open are auto-flagged and pushed to notifications.</p>
      {showNew && (
        <NewIssueModal audits={audits} onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); reload(); }} />
      )}
      {resolving && (
        <ResolveModal issue={resolving} onClose={() => setResolving(null)}
          onSaved={() => { setResolving(null); reload(); }} />
      )}
    </section>
  );
}

/* ---------- Certifications ---------- */

// Certification status pills map the backend's kind onto the framework's
// functional triples: green = valid, amber = expiring/pending, red = lapsed.
const KIND_TONE = { env: 'ok', soc: 'sec', gov: 'gov', game: 'warn', dgr: 'dgr', danger: 'dgr', mut: 'mut' };

function Certs() {
  const { data, error, loading } = useApi('/certifications');
  return (
    <section className="card">
      <h2>Certifications & security posture</h2>
      <p className="sub">ISO · SOC 2 · VAPT — evidence for the Governance score</p>
      {loading && <p className="loading">Loading certifications…</p>}
      {error && <p className="loaderr">⚠️ {error}</p>}
      {data && (
        <div className="grid gcards">
          {data.map((c) => (
            <div className="card" style={{ boxShadow: 'none' }} key={c.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                <span style={{ fontSize: 24 }}>{c.icon}</span>
                <Pill tone={KIND_TONE[String(c.status_kind).replace(/^p-/, '')] || 'mut'}>{c.status}</Pill>
              </div>
              <b style={{ display: 'block', margin: '8px 0 4px', fontSize: 13.5 }}>{c.name}</b>
              <p className="mut" style={{ fontSize: 12 }}>{c.until}</p>
              <p className="mut" style={{ fontSize: 12, marginTop: 2 }}>⏭ {c.next}</p>
            </div>
          ))}
        </div>
      )}
      <p className="hint">Certification expiries and VAPT retests feed the same reminder & notification pipeline as policy acknowledgements.</p>
    </section>
  );
}

export default function Governance() {
  const { tab = 'policies' } = useParams();
  const Body = { policies: Policies, acks: Acks, audits: Audits, issues: Issues, certs: Certs }[tab] || Policies;
  return (
    <>
      <Tabs base="/governance" tabs={TABS} accent="gov" label="Governance sections" />
      <Body />
    </>
  );
}

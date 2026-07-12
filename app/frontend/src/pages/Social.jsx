import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import Tabs from '../components/Tabs.jsx';
import DataTable from '../components/DataTable.jsx';
import Pill, { Chip, StatusPill } from '../components/Pill.jsx';
import { LabeledMeter } from '../components/Meter.jsx';
import ProofLink from '../components/ProofLink.jsx';
import { useToast } from '../components/Toast.jsx';

const TABS = [
  ['csr', 'CSR Activities'],
  ['participation', 'Participations'],
  ['diversity', 'Diversity & Training'],
];

/* Shared proof-upload button (multipart POST). Server enforces type/size/magic bytes. */
export function ProofUpload({ path, onDone, label = 'Upload proof' }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('File too large — max 5 MB'); return; }
    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    try {
      await api(path, { method: 'POST', form });
      toast('📎 Proof attached — awaiting review');
      onDone();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" style={{ display: 'none' }} onChange={onPick} />
      <button className="btn out sm" disabled={busy} onClick={() => inputRef.current && inputRef.current.click()}>
        {busy ? 'Uploading…' : label}
      </button>
    </>
  );
}

/* ---------- CSR Activities ---------- */

function CsrActivities() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/csr-activities');
  const [cat, setCat] = useState('');
  const [busyId, setBusyId] = useState(null);

  const cats = useMemo(() => [...new Set((data || []).map((a) => a.category))], [data]);
  const list = (data || []).filter((a) => !cat || a.category === cat);

  const join = async (id) => {
    setBusyId(id);
    try {
      await api(`/csr-activities/${id}/join`, { method: 'POST' });
      toast('You joined — track it under Participations');
      reload();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="card">
      <h2>CSR Activities</h2>
      <p className="sub">Company social initiatives — participation earns points</p>
      <div className="filters" style={{ marginBottom: 13 }}>
        <button className={cat === '' ? 'on' : ''} onClick={() => setCat('')}>All</button>
        {cats.map((c) => (
          <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      {loading && <p className="loading">Loading activities…</p>}
      {error && <p className="loaderr">⚠️ {error}</p>}
      {data && (
        <div className="grid gcards">
          {list.length === 0 && <p className="mut">No activities in this category.</p>}
          {list.map((a) => (
            <div className="card" style={{ boxShadow: 'none' }} key={a.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <Pill tone="soc">{a.category}</Pill>
                {a.evidence_required && <Chip>📎 evidence required</Chip>}
              </div>
              <b style={{ fontSize: 14 }}>{a.name}</b>
              <p className="mut" style={{ fontSize: 12.5, margin: '5px 0 12px' }}>
                {a.when} · {a.joined_count} joined · earns <b>{a.points} pts</b>
              </p>
              {user && user.role === 'employee' && (
                a.joined_by_me
                  ? <button className="btn soc sm" disabled>Joined ✓</button>
                  : <button className="btn soc sm" disabled={busyId === a.id} onClick={() => join(a.id)}>Join activity</button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- Participations ---------- */

function Participations() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/participations');
  const [busyId, setBusyId] = useState(null);
  const isAdmin = user && user.role === 'admin';

  const decide = async (id, action) => {
    setBusyId(id);
    try {
      await api(`/participations/${id}/${action}`, { method: 'POST' });
      toast(action === 'approve' ? '✅ Approved — points awarded & employee notified' : 'Participation rejected — employee notified');
      reload();
    } catch (err) {
      toast(err.message); // surfaces the 409 evidence-required detail
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="loading">Loading participations…</p>;
  if (error) return <p className="loaderr">⚠️ {error}</p>;

  if (!isAdmin) {
    return (
      <section className="card">
        <h2>My participations</h2>
        <p className="sub">Approval decisions trigger notifications automatically</p>
        <DataTable columns={['Activity', 'Completed', 'Proof', 'Points', 'Status']}
          empty="You haven't joined any CSR activities yet."
          rows={data.map((q) => ({
            key: q.id,
            cells: [
              <span className="b">{q.activity}</span>,
              <span className="mut">{q.completed}</span>,
              q.proof
                ? <ProofLink path={`/participations/${q.id}/proof-file`} name={q.proof} />
                : <ProofUpload path={`/participations/${q.id}/proof`} onDone={reload} />,
              <span className="num">{q.points}</span>,
              <StatusPill status={q.status} />,
            ],
          }))} />
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Participation approvals</h2>
      <p className="sub">CSR participation queue — points are awarded on approval</p>
      <DataTable columns={['Employee', 'Activity', 'Completed', 'Proof', 'Points', 'Status', 'Decision']}
        empty="No participations in the queue."
        rows={data.map((q) => {
          const noProof = !q.proof;
          const pending = String(q.status).toLowerCase() === 'pending';
          return {
            key: q.id,
            cells: [
              <span className="b">{q.employee}</span>,
              q.activity,
              <span className="mut">{q.completed}</span>,
              q.proof
                ? <ProofLink path={`/participations/${q.id}/proof-file`} name={q.proof} />
                : <Pill tone="dgr">proof missing</Pill>,
              <span className="num">{q.points}</span>,
              <StatusPill status={q.status} />,
              pending ? (
                <span style={{ display: 'inline-flex', gap: 6 }}>
                  <button className="btn pri sm" disabled={noProof || busyId === q.id}
                    title={noProof ? 'Evidence Requirement is ON — attach proof before approving' : undefined}
                    onClick={() => decide(q.id, 'approve')}>Approve</button>
                  <button className="btn out sm" disabled={busyId === q.id}
                    onClick={() => decide(q.id, 'reject')}>Reject</button>
                </span>
              ) : '—',
            ],
          };
        })} />
      <p className="hint">🔒 Evidence Requirement — the approve action stays disabled until a proof file is attached (also enforced server-side).</p>
    </section>
  );
}

/* ---------- Diversity & Training ---------- */

function Diversity() {
  const { data, error, loading } = useApi('/social/diversity');
  if (loading) return <p className="loading">Loading diversity data…</p>;
  if (error) return <p className="loaderr">⚠️ {error}</p>;
  const d = data;
  return (
    <>
      <div className="split">
        <section className="card">
          <h2>Representation</h2>
          <p className="sub">Share of workforce</p>
          {d.representation.map(([label, pct]) => (
            <LabeledMeter key={label} label={label} value={pct} accent="var(--soc)" />
          ))}
          <p className="hint">🔒 Sensitive attributes are voluntary self-identification, stored aggregated & anonymised only.</p>
        </section>
        <section className="card">
          <h2>Cultural & generational diversity</h2>
          <p className="sub">Snapshot across the organization</p>
          <div className="grid g4" style={{ marginBottom: 14 }}>
            {d.culture.stats.map(([label, value]) => (
              <div key={label} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
                <p className="mut" style={{ fontSize: 11.5 }}>{label}</p>
                <p className="b num" style={{ fontSize: 20, color: 'var(--soc)' }}>{value}</p>
              </div>
            ))}
          </div>
          {d.culture.gens.map(([label, pct]) => (
            <LabeledMeter key={label} label={label} value={pct} accent="var(--soc)" />
          ))}
        </section>
      </div>
      <section className="card">
        <h2>Mandatory training completion by department</h2>
        <p className="sub">Amber = below the 75% threshold</p>
        {d.training.map(([dept, pct]) => (
          <LabeledMeter key={dept} label={dept} value={pct} accent={pct < 75 ? 'var(--warn)' : 'var(--soc)'} />
        ))}
      </section>
      <section className="card">
        <h2>Employee commute — public vs private</h2>
        <p className="sub">From voluntary commute survey · updated quarterly</p>
        {d.commute.map(([label, pct]) => (
          <LabeledMeter key={label} label={label} value={pct}
            accent={label === 'Private vehicle' ? 'var(--warn)' : 'var(--env)'} />
        ))}
      </section>
    </>
  );
}

export default function Social() {
  const { tab = 'csr' } = useParams();
  const Body = { csr: CsrActivities, participation: Participations, diversity: Diversity }[tab] || CsrActivities;
  return (
    <>
      <Tabs base="/social" tabs={TABS} accent="soc" label="Social sections" />
      <Body />
    </>
  );
}

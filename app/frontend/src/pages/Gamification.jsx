import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import Tabs from '../components/Tabs.jsx';
import DataTable from '../components/DataTable.jsx';
import Kanban from '../components/Kanban.jsx';
import Modal from '../components/Modal.jsx';
import Pill, { Chip, StatusPill } from '../components/Pill.jsx';
import { MeterRow, LabeledMeter } from '../components/Meter.jsx';
import ProofLink from '../components/ProofLink.jsx';
import { useToast } from '../components/Toast.jsx';
import { ProofUpload } from './Social.jsx';

const TABS = [
  ['challenges', 'Challenges'],
  ['mine', 'Participations'],
  ['leaderboard', 'Leaderboard'],
  ['badges', 'Badges'],
  ['rewards', 'Rewards'],
];

/* ---------- Challenges (kanban) ---------- */

const COLUMN_ORDER = ['Draft', 'Active', 'Under Review', 'Completed', 'Archived'];
const KCOL = {
  Draft: 'var(--faint)',
  Active: 'var(--ok)',
  'Under Review': 'var(--gov)',
  Completed: 'var(--game)',
  Archived: 'var(--faint)',
};

/** Detail modal for a kanban card. For employees it carries the Join action or
 *  their participation controls (progress slider + proof), matched by title. */
function ChallengeDetail({ card, column, participation, isEmployee, busy, onJoin, onClose, onChanged }) {
  const toast = useToast();
  const [progress, setProgress] = useState(participation ? Number(participation.progress) || 0 : 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProgress(participation ? Number(participation.progress) || 0 : 0);
  }, [participation && participation.id, participation && participation.progress]);

  const editable = participation && String(participation.status).toLowerCase() === 'in_progress';

  const saveProgress = async () => {
    setSaving(true);
    try {
      await api(`/challenge-participations/${participation.id}/progress`, {
        method: 'POST', body: { progress: Number(progress) },
      });
      toast(Number(progress) === 100 ? '💯 Progress saved — moved to Under Review' : 'Progress updated');
      onChanged();
    } catch (err) {
      toast(err.message);
    } finally {
      setSaving(false);
    }
  };

  const done = ['approved', 'rejected'].includes(String(participation && participation.status).toLowerCase());

  return (
    <Modal title={card.title} sub={`Deadline ${card.deadline} · stage: ${column}`} onClose={onClose}
      footer={<button className="btn out" onClick={onClose}>Close</button>}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        <Pill tone="game">{card.category}</Pill>
        <Pill tone="mut">{card.xp} XP</Pill>
        <Chip>{card.difficulty}</Chip>
        {card.evidence_required && <Chip>📎 evidence required</Chip>}
      </div>
      {isEmployee && column === 'Active' && !card.joined_by_me && (
        <button className="btn game" disabled={busy} onClick={() => onJoin(card.id)}>
          {busy ? 'Joining…' : 'Join challenge'}
        </button>
      )}
      {isEmployee && card.joined_by_me && !participation && (
        <p className="hint">Loading your participation…</p>
      )}
      {isEmployee && participation && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <StatusPill status={participation.status} />
            {participation.xp_awarded ? <Pill tone="ok">+{participation.xp_awarded} XP</Pill> : null}
          </div>
          <div className="mlabeled" style={{ '--acc': 'var(--game-acc)' }}>
            <div className="t"><span>My progress</span><b>{progress}%</b></div>
            <input type="range" min="0" max="100" step="5" value={progress} aria-label="My progress"
              disabled={!editable} onChange={(e) => setProgress(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--game-acc)' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn game sm" disabled={!editable || saving} onClick={saveProgress}>
              {saving ? 'Updating…' : 'Update progress'}
            </button>
            {participation.proof
              ? <ProofLink path={`/challenge-participations/${participation.id}/proof-file`} name={participation.proof} />
              : !done && <ProofUpload path={`/challenge-participations/${participation.id}/proof`} onDone={onChanged} />}
          </div>
          {!editable && !done && (
            <p className="hint">Progress is locked while the participation is under review.</p>
          )}
        </>
      )}
    </Modal>
  );
}

function Challenges() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/challenges');
  const isAdmin = user && user.role === 'admin';
  const isEmployee = user && user.role === 'employee';
  // Employees also need their participation rows to drive the card modal.
  const { data: parts, reload: reloadParts } = useApi(isEmployee ? '/challenge-participations' : null);
  const [busyId, setBusyId] = useState(null);
  const [selId, setSelId] = useState(null);

  const join = async (id) => {
    setBusyId(id);
    try {
      await api(`/challenges/${id}/join`, { method: 'POST' });
      toast('You joined — track it under Participations');
      reload();
      reloadParts();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const transition = async (id, to, label) => {
    setBusyId(id);
    try {
      await api(`/challenges/${id}/transition`, { method: 'POST', body: { to } });
      toast(label);
      reload();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="loading">Loading challenges…</p>;
  if (error) return <p className="loaderr">⚠️ {error}</p>;

  const columns = COLUMN_ORDER.map((name) => ({
    name,
    dotColor: KCOL[name],
    cards: (data.columns[name] || []).map((c) => ({
      key: c.id,
      onClick: () => setSelId(c.id),
      body: (
        <>
          <p className="t">{c.title}</p>
          <div className="meta">
            <Pill tone="game">{c.category}</Pill>
            <Pill tone="mut">{c.xp} XP</Pill>
            <Chip>{c.difficulty}</Chip>
            {c.evidence_required && <Chip>📎 evidence</Chip>}
          </div>
          <p className="mut" style={{ fontSize: 11.5, marginBottom: 8 }}>Deadline {c.deadline}</p>
          {name === 'Active' && isEmployee && (
            c.joined_by_me
              ? <button className="btn game sm" disabled>Joined ✓</button>
              : <button className="btn game sm" disabled={busyId === c.id}
                  onClick={(e) => { e.stopPropagation(); join(c.id); }}>Join</button>
          )}
          {isAdmin && name === 'Draft' && (
            <button className="btn out sm" disabled={busyId === c.id}
              onClick={(e) => { e.stopPropagation(); transition(c.id, 'active', 'Challenge moved: Draft → Active'); }}>Activate →</button>
          )}
          {isAdmin && name === 'Under Review' && (
            <button className="btn pri sm" disabled={busyId === c.id}
              onClick={(e) => { e.stopPropagation(); transition(c.id, 'completed', 'Challenge moved: Under Review → Completed · XP awarded'); }}>Mark completed →</button>
          )}
        </>
      ),
    })),
  }));

  // Resolve the selected card fresh from data each render so joins/progress
  // updates reflect immediately in the open modal.
  let selected = null;
  if (selId != null) {
    for (const name of COLUMN_ORDER) {
      const hit = (data.columns[name] || []).find((c) => c.id === selId);
      if (hit) { selected = { card: hit, column: name }; break; }
    }
  }
  const myPart = selected && isEmployee && Array.isArray(parts)
    ? parts.find((p) => p.challenge === selected.card.title)
    : null;

  return (
    <section className="card">
      <h2>Challenge lifecycle</h2>
      <p className="sub">Full status flow with actions at each stage — click a card for details</p>
      <Kanban columns={columns} />
      <p className="hint">Lifecycle: Draft → Active → Under Review → Completed · Archive from any state. Swipe/scroll horizontally on mobile.</p>
      {selected && (
        <ChallengeDetail card={selected.card} column={selected.column} participation={myPart}
          isEmployee={isEmployee} busy={busyId === selected.card.id}
          onJoin={join} onClose={() => setSelId(null)}
          onChanged={() => { reload(); reloadParts(); }} />
      )}
    </section>
  );
}

/* ---------- Participations ---------- */

function ProgressEditor({ participation, onDone }) {
  const toast = useToast();
  const [value, setValue] = useState(String(participation.progress ?? 0));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const n = Number(value);
    if (!(n >= 0 && n <= 100)) { toast('Progress must be between 0 and 100'); return; }
    setBusy(true);
    try {
      await api(`/challenge-participations/${participation.id}/progress`, { method: 'POST', body: { progress: n } });
      toast(n === 100 ? '💯 Progress saved — moved to Under Review' : 'Progress updated');
      onDone();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <input type="number" min="0" max="100" value={value} onChange={(e) => setValue(e.target.value)}
        aria-label="Progress %" style={{ width: 62, padding: '4px 7px', border: '1px solid var(--line-input)', borderRadius: 'var(--r)', fontSize: 12 }} />
      <button className="btn out sm" disabled={busy} onClick={save}>Set</button>
    </span>
  );
}

function Mine() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/challenge-participations');
  const [busyId, setBusyId] = useState(null);
  const isAdmin = user && user.role === 'admin';

  const decide = async (id, action) => {
    setBusyId(id);
    try {
      await api(`/challenge-participations/${id}/${action}`, { method: 'POST' });
      toast(action === 'approve' ? '✅ Approved — XP awarded & badge rules checked' : 'Participation rejected — employee notified');
      reload();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="loading">Loading participations…</p>;
  if (error) return <p className="loaderr">⚠️ {error}</p>;

  if (!isAdmin) {
    return (
      <section className="card">
        <h2>My challenge participation</h2>
        <p className="sub">Progress, proof and XP for challenges you joined</p>
        <DataTable columns={['Challenge', 'Progress', 'Proof', 'Status', 'XP awarded']}
          empty="You haven't joined any challenges yet."
          rows={data.map((c) => {
            const inProgress = String(c.status).toLowerCase() === 'in_progress';
            return {
              key: c.id,
              cells: [
                <span className="b">{c.challenge}</span>,
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', minWidth: 190 }}>
                  <span style={{ flex: 1, minWidth: 110 }}><MeterRow value={c.progress} accent="var(--game-acc)" /></span>
                  {inProgress && <ProgressEditor participation={c} onDone={reload} />}
                </span>,
                c.proof
                  ? <ProofLink path={`/challenge-participations/${c.id}/proof-file`} name={c.proof} />
                  : <ProofUpload path={`/challenge-participations/${c.id}/proof`} onDone={reload} />,
                <StatusPill status={c.status} />,
                <span className="b num" style={{ color: 'var(--ok)' }}>{c.xp_awarded ? `+${c.xp_awarded}` : '—'}</span>,
              ],
            };
          })} />
        <p className="hint">XP lands the moment an admin approves — and badges auto-award when unlock rules are met.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Challenge participation — approvals</h2>
      <p className="sub">Proof review for challenges at 100% progress</p>
      <DataTable columns={['Employee', 'Challenge', 'Progress', 'Proof', 'XP', 'Status', 'Decision']}
        empty="No participations in the queue."
        rows={data.map((q) => {
          const noProof = !q.proof;
          const pending = ['pending', 'under_review'].includes(String(q.status).toLowerCase());
          return {
            key: q.id,
            cells: [
              <span className="b">{q.employee}</span>,
              q.challenge,
              <div style={{ minWidth: 140 }}><MeterRow value={q.progress} accent="var(--game-acc)" /></div>,
              q.proof
                ? <ProofLink path={`/challenge-participations/${q.id}/proof-file`} name={q.proof} />
                : <Pill tone="dgr">proof missing</Pill>,
              <span className="num">{q.xp}</span>,
              <StatusPill status={q.status} />,
              pending ? (
                <span style={{ display: 'inline-flex', gap: 6 }}>
                  <button className="btn pri sm" disabled={noProof || busyId === q.id}
                    title={noProof ? 'Evidence required — proof must be attached before approving' : undefined}
                    onClick={() => decide(q.id, 'approve')}>Approve</button>
                  <button className="btn out sm" disabled={busyId === q.id} onClick={() => decide(q.id, 'reject')}>Reject</button>
                </span>
              ) : '—',
            ],
          };
        })} />
      <p className="hint">On approval, XP is awarded and Badge Auto-Award checks the employee's unlock rules immediately.</p>
    </section>
  );
}

/* ---------- Leaderboard ---------- */

function Leaderboard() {
  const { data, error, loading } = useApi('/leaderboard');
  const [mode, setMode] = useState('emp');

  if (loading) return <p className="loading">Loading leaderboard…</p>;
  if (error) return <p className="loaderr">⚠️ {error}</p>;

  const dept = mode === 'dept';
  const rows = dept ? data.departments : data.employees;

  return (
    <section className="card">
      <h2>Leaderboard</h2>
      <p className="sub">Top performers — switch between employee and department rankings</p>
      <div className="filters" style={{ marginBottom: 14 }}>
        <button className={mode === 'emp' ? 'on' : ''} onClick={() => setMode('emp')}>Employees</button>
        <button className={mode === 'dept' ? 'on' : ''} onClick={() => setMode('dept')}>Departments</button>
      </div>
      <div className="podium" style={{ marginBottom: 14 }}>
        {rows.slice(0, 3).map((p, i) => (
          <div className={`pod r${i + 1}`} key={i}>
            <span className="rank">{i + 1}</span>
            <b>{p[0]}</b>
            <span>{dept ? `${Number(p[1]).toLocaleString()} XP` : `${p[1]} · ${Number(p[2]).toLocaleString()} XP`}</span>
          </div>
        ))}
      </div>
      <DataTable columns={['Rank', 'Name', 'Department', 'XP']} empty="No XP earned yet."
        rows={rows.map((p, i) => ({
          key: i,
          cells: [
            <span className="b num">#{i + 1}</span>,
            <span className="b">{p[0]}</span>,
            <span className="mut">{dept ? '—' : p[1]}</span>,
            <span className="b num">{Number(dept ? p[1] : p[2]).toLocaleString()}</span>,
          ],
        }))} />
    </section>
  );
}

/* ---------- Badges ---------- */

function Badges() {
  const { data, error, loading } = useApi('/badges');
  return (
    <section className="card">
      <h2>Badges</h2>
      <p className="sub">Unlock rules are visible so employees know what to aim for</p>
      {loading && <p className="loading">Loading badges…</p>}
      {error && <p className="loaderr">⚠️ {error}</p>}
      {data && (
        <div className="grid gcards">
          {data.map((b) => {
            const threshold = Number(b.threshold) || 0;
            const current = Math.min(Number(b.current) || 0, threshold);
            return (
              <div className={`badge-card${b.earned ? '' : ' locked'}`} key={b.id}>
                <span className="bico">{b.earned ? b.icon : '🔒'}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{b.name}</b>
                  <span className="rule">{b.description}</span>
                  <span className="rule" style={{ color: 'var(--game)' }}>Unlock: {b.rule_label}</span>
                  {b.earned ? (
                    <span style={{ display: 'inline-block', marginTop: 4 }}>
                      <Pill tone="ok">Earned</Pill>
                    </span>
                  ) : (
                    <span style={{ display: 'block', marginTop: 8 }}>
                      <LabeledMeter label="Progress" accent="var(--game-acc)"
                        value={threshold ? (current / threshold) * 100 : 0}
                        display={`${current} / ${threshold}`} />
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="hint">✦ Badge Auto-Award — a badge is assigned the moment your XP or completed-challenge count satisfies its unlock rule.</p>
    </section>
  );
}

/* ---------- Rewards ---------- */

function Rewards() {
  const { user, refreshMe } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/rewards');
  const [cat, setCat] = useState('');
  const [busyId, setBusyId] = useState(null);

  const points = user ? Number(user.points || 0) : 0;
  const cats = useMemo(() => [...new Set((data || []).map((r) => r.category))], [data]);
  const list = (data || []).filter((r) => !cat || r.category === cat);

  const redeem = async (reward) => {
    setBusyId(reward.id);
    try {
      const res = await api(`/rewards/${reward.id}/redeem`, { method: 'POST' });
      const balance = res && res.balance != null ? res.balance : null;
      await refreshMe();
      reload();
      toast(`🎁 Redeemed — ${reward.cost} pts deducted${balance != null ? ` · balance ${balance} pts` : ''}`);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="note env" style={{ alignItems: 'center' }}>
        💰 <span><b>Your balance: {points.toLocaleString()} pts</b> — redeeming deducts points instantly, subject to stock.</span>
      </div>
      <section className="card">
        <h2>Rewards catalog</h2>
        <p className="sub">Redemption is atomic — stock check and point deduction happen in one server-side transaction</p>
        <div className="filters" style={{ marginBottom: 13 }}>
          <button className={cat === '' ? 'on' : ''} onClick={() => setCat('')}>All</button>
          {cats.map((c) => (
            <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        {loading && <p className="loading">Loading rewards…</p>}
        {error && <p className="loaderr">⚠️ {error}</p>}
        {data && (
          <div className="grid gcards">
            {list.map((r) => {
              const out = r.stock === 0;
              const poor = points < r.cost;
              return (
                <div className="card" style={{ boxShadow: 'none', display: 'flex', flexDirection: 'column' }} key={r.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <span style={{ fontSize: 26 }}>{r.icon}</span>
                    <Chip>{r.category}</Chip>
                  </div>
                  <b style={{ margin: '7px 0 3px', fontSize: 14 }}>{r.name}</b>
                  <span className="mut" style={{ fontSize: 12 }}>
                    {out ? <Pill tone="dgr">Out of stock</Pill>
                      : r.stock < 5 ? <Pill tone="warn">Only {r.stock} left</Pill>
                        : `${r.stock} in stock`}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 12 }}>
                    <Pill tone="game">{Number(r.cost).toLocaleString()} pts</Pill>
                    <button className="btn pri sm" disabled={out || poor || busyId === r.id}
                      title={out ? 'Out of stock' : poor ? 'Not enough points' : undefined}
                      onClick={() => redeem(r)}>Redeem</button>
                  </div>
                  {!out && poor && (
                    <p style={{ fontSize: 11, color: 'var(--warn-ink)', marginTop: 6 }}>
                      Needs {(r.cost - points).toLocaleString()} more pts
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

export default function Gamification() {
  const { tab = 'challenges' } = useParams();
  const Body = { challenges: Challenges, mine: Mine, leaderboard: Leaderboard, badges: Badges, rewards: Rewards }[tab] || Challenges;
  return (
    <>
      <Tabs base="/gamification" tabs={TABS} accent="game" label="Gamification sections" />
      <Body />
    </>
  );
}

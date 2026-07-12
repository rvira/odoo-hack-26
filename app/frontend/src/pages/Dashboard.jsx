import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Pill, { Chip, StatusPill, SeverityPill } from '../components/Pill.jsx';
import { MeterRow } from '../components/Meter.jsx';
import Toggle from '../components/Toggle.jsx';
import TrendChart from '../components/charts/TrendChart.jsx';
import Donut from '../components/charts/Donut.jsx';
import { useToast } from '../components/Toast.jsx';
import { KIND_BG } from '../components/Topbar.jsx';

const PILLAR_VAR = { E: 'var(--env)', S: 'var(--soc)', G: 'var(--gov)' };
const PILLAR_LABEL = { E: 'Environmental', S: 'Social', G: 'Governance' };

function AdminDashboard({ data }) {
  const { scores, weights, target, trend, dept_scores: deptScores, activity } = data;

  const parts = ['E', 'S', 'G'].map((k) => {
    const pts = +(scores[k] * weights[k] / 100).toFixed(1);
    return { k, score: scores[k], weight: weights[k], pts };
  });

  return (
    <>
      <div className="pagehead">
        <h1>Organization Dashboard</h1>
        <p>Live ESG posture — every number recomputes as records change.</p>
      </div>

      <div className="grid g4">
        <KpiCard label="Environmental" value={Math.round(scores.E)} accent="var(--env)" suffix=" / 100" spark={trend.E} />
        <KpiCard label="Social" value={Math.round(scores.S)} accent="var(--soc)" suffix=" / 100" spark={trend.S} />
        <KpiCard label="Governance" value={Math.round(scores.G)} accent="var(--gov)" suffix=" / 100" spark={trend.G} />
        <KpiCard label="Overall ESG" value={Math.round(scores.overall)} accent="var(--ink)" suffix=" / 100" spark={trend.overall} />
      </div>

      <div className="split">
        <section className="card">
          <h2>Score trend — 12 months</h2>
          <p className="sub">Smoothed monthly series — toggle chips to isolate, hover for values</p>
          <TrendChart months={trend.months} target={target} series={[
            { key: 'overall', label: 'Overall', color: 'var(--ink)', values: trend.overall, bold: true },
            { key: 'E', label: 'Environmental', color: 'var(--env)', values: trend.E },
            { key: 'S', label: 'Social', color: 'var(--soc)', values: trend.S },
            { key: 'G', label: 'Governance', color: 'var(--gov)', values: trend.G },
          ]} />
        </section>
        <section className="card">
          <h2>Score mix — this month</h2>
          <p className="sub">How each pillar builds the overall score</p>
          <div className="donutwrap">
            <Donut size={150} center={`${Math.round(scores.overall)}\noverall`}
              parts={parts.map((p) => ({ value: p.pts, color: PILLAR_VAR[p.k] }))} />
            <div style={{ flex: 1, minWidth: 200 }}>
              {parts.map((p) => (
                <div key={p.k} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: '1px solid var(--line2)', fontSize: 13 }}>
                  <i style={{ width: 10, height: 10, borderRadius: 3, background: PILLAR_VAR[p.k], flex: 'none' }} />
                  <span style={{ flex: 1 }}>{PILLAR_LABEL[p.k]}</span>
                  <span className="mut" style={{ fontSize: 12 }}>score {Math.round(p.score)} × {p.weight}%</span>
                  <b className="num">+{p.pts}</b>
                </div>
              ))}
              <p className="hint">Slice size = weighted contribution to the overall {Math.round(scores.overall)}.</p>
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <h2>Department scores — this month</h2>
        <p className="sub">Sorted by total — feeds the Overall ESG Score</p>
        {[...deptScores].sort((a, b) => b.total - a.total).map((d) => (
          <div key={d.department} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 34px', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line2)', fontSize: 13 }}>
            <span className="b" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.department}</span>
            <div className="meter" style={{ '--acc': d.total < 70 ? 'var(--warn)' : 'var(--ok)', height: 10 }}>
              <i style={{ width: `${Math.min(100, d.total)}%` }} />
            </div>
            <b className="num" style={{ textAlign: 'right' }}>{Math.round(d.total)}</b>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11.5, color: 'var(--muted)' }}>
          <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: 'var(--ok)', marginRight: 5 }} />On track</span>
          <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: 'var(--warn)', marginRight: 5 }} />Below 70</span>
        </div>
      </section>

      <section className="card">
        <h2>Recent activity</h2>
        <p className="sub">Latest ESG events across the organization</p>
        <ul className="alist">
          {activity.length === 0 && <li className="mut">No recent activity.</li>}
          {activity.map((a, i) => (
            <li key={i}>
              <span className="aico" style={{ background: KIND_BG[a.kind] || 'var(--line2)' }}>{a.icon}</span>
              <span>{a.text}</span>
              <time>{a.when}</time>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function EmployeeDashboard({ data, reload }) {
  const { user } = useAuth();
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);
  const me = data.me;
  const firstName = user ? user.name.split(' ')[0] : 'there';

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

  return (
    <>
      <div className="pagehead">
        <h1>Good morning, {firstName} 👋</h1>
        <p>Your sustainability snapshot — XP, challenges and pending actions.</p>
      </div>

      <div className="grid g4">
        <KpiCard label="My XP" value={Number(me.xp).toLocaleString()} accent="var(--game-acc)" />
        <KpiCard label="Redeemable points" value={me.points} accent="var(--game)" suffix=" pts" />
        <KpiCard label="Badges earned" value={me.badge_count} accent="var(--gov)" suffix={` / ${me.badge_total}`} />
        <KpiCard label="Leaderboard rank" value={me.rank ? `#${me.rank}` : '—'} accent="var(--soc)" />
      </div>

      <section className="card">
        <h2>My active challenges</h2>
        <p className="sub">Finish before the deadline to earn XP</p>
        <DataTable columns={['Challenge', 'Progress', 'Status']} empty="No active challenges — join one under Gamification."
          rows={data.my_challenges.map((c) => ({
            key: c.id,
            cells: [
              <span className="b">{c.challenge}</span>,
              <div style={{ minWidth: 150 }}><MeterRow value={c.progress} accent="var(--game-acc)" /></div>,
              <StatusPill status={c.status} />,
            ],
          }))} />
      </section>

      <section className="card">
        <h2>Pending policy acknowledgements</h2>
        <p className="sub">Required by Governance — reminders are sent automatically</p>
        <ul className="alist">
          {data.pending_acks.length === 0 && <li className="mut">Nothing pending — you're up to date ✅</li>}
          {data.pending_acks.map((a) => (
            <li key={a.policy_id}>
              <span className="aico" style={{ background: 'var(--gov-soft)' }}>📋</span>
              <span>
                <b>{a.name}</b> <span className="mono mut">{a.version}</span><br />
                <span className="mut" style={{ fontSize: 12 }}>Due {a.due}</span>
              </span>
              <button className="btn gov sm" style={{ marginLeft: 'auto' }}
                disabled={busyId === a.policy_id} onClick={() => acknowledge(a.policy_id)}>
                Acknowledge
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/* ---------- Super Admin (platform overview) ---------- */

function AlertBlock({ alert, sending, onSend, onAck }) {
  return (
    <div className={`note ${alert.severity === 'high' ? 'dgr' : 'warn'}`}
      style={{ flexDirection: 'column', alignItems: 'stretch', gap: 7, marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Chip mono>{alert.ouid}</Chip>
        <b>{alert.org}</b>
        <SeverityPill severity={alert.severity} />
        <span style={{ marginLeft: 'auto', fontSize: 11.5, opacity: .8 }}>{alert.when}</span>
      </div>
      <p>{alert.msg}</p>
      <p>🎯 <b>Where to act:</b> {alert.target}</p>
      <p>💡 <b>Suggested plan:</b> {alert.suggestion}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
        <button className="btn pri sm" disabled={sending} onClick={onSend}>
          {sending ? 'Sending…' : 'Send suggestion to admin'}
        </button>
        <button className="btn out sm" onClick={onAck}>Acknowledge</button>
      </div>
    </div>
  );
}

function SuperDashboard({ data, reload }) {
  const toast = useToast();
  const [dismissed, setDismissed] = useState({});
  const [togBusy, setTogBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(null);
  const k = data.kpis;

  const setAlerting = async (enabled) => {
    if (togBusy) return;
    setTogBusy(true);
    try {
      const res = await api('/platform/alerting', { method: 'PUT', body: { enabled } });
      toast(res.alerting_enabled
        ? '🔔 Platform alerting enabled — alerts recomputed live'
        : 'Platform alerting disabled');
      reload();
    } catch (err) {
      toast(err.message);
    } finally {
      setTogBusy(false);
    }
  };

  const sendSuggestion = async (alert, idx) => {
    setSendBusy(idx);
    try {
      const res = await api('/platform/suggestions', {
        method: 'POST',
        body: { ouid: alert.ouid, message: alert.suggestion },
      });
      toast(`💡 Sent to ${res && res.sent_to ? res.sent_to : alert.org}`);
    } catch (err) {
      toast(err.message);
    } finally {
      setSendBusy(null);
    }
  };

  const visibleAlerts = data.alerts
    .map((a, i) => ({ a, i }))
    .filter(({ i }) => !dismissed[i]);

  return (
    <>
      <div className="pagehead">
        <h1>Platform overview</h1>
        <p>All organizations — ESG posture, goal delivery and live interventions.</p>
      </div>

      <div className="grid g4">
        <KpiCard label="Organizations" value={k.organizations} accent="var(--primary)" />
        <KpiCard label="Avg ESG score" value={k.avg_esg} accent="var(--ink)" suffix=" / 100" />
        <KpiCard label="Goals on track" value={k.goals_on_track} accent="var(--ok)" suffix={` of ${k.goals_total}`} />
        <KpiCard label="Goals at risk" value={k.goals_at_risk} accent="var(--warn)" />
      </div>

      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={{ marginBottom: 0 }}>Alerts &amp; interventions</h2>
          <Pill tone="pri">★ Premium</Pill>
        </div>
        <p className="sub">Underperformance alerts across organizations, with suggested action plans</p>
        <Toggle title="Platform alerting" sub="Master switch — alerts recompute from this month's live scores"
          on={data.alerting_enabled} onChange={setAlerting} />
        {!data.alerting_enabled && (
          <p className="hint">Alerting is off — turn it on to see live underperformance alerts and suggested interventions.</p>
        )}
        {data.alerting_enabled && visibleAlerts.length === 0 && (
          <p className="hint">No alerts — every organization is above its thresholds 🎉</p>
        )}
        {data.alerting_enabled && visibleAlerts.map(({ a, i }) => (
          <AlertBlock key={i} alert={a} sending={sendBusy === i}
            onSend={() => sendSuggestion(a, i)}
            onAck={() => setDismissed((d) => ({ ...d, [i]: true }))} />
        ))}
      </section>

      <section className="card">
        <h2>Organizations</h2>
        <p className="sub">Live ESG posture per tenant — sorted by overall score</p>
        <DataTable columns={['OUID', 'Organization', 'ESG Admin', { label: 'Employees', num: true }, { label: 'E', num: true }, { label: 'S', num: true }, { label: 'G', num: true }, 'Overall']}
          empty="No organizations onboarded yet."
          rows={data.orgs.map((o) => ({
            key: o.id,
            cells: [
              <Chip mono>{o.ouid}</Chip>,
              <span className="b">{o.name}</span>,
              o.admin,
              <span className="num">{o.employees}</span>,
              <span className="num">{Math.round(o.E)}</span>,
              <span className="num">{Math.round(o.S)}</span>,
              <span className="num">{Math.round(o.G)}</span>,
              <div style={{ minWidth: 150 }}>
                <MeterRow value={o.overall} accent={o.overall < 72 ? 'var(--warn)' : 'var(--ok)'} />
              </div>,
            ],
          }))} />
      </section>

      <section className="card">
        <h2>Sustainability goals — all organizations</h2>
        <p className="sub">Every tenant goal, sorted by progress — worst first</p>
        <DataTable columns={['Org', 'Goal', 'Department', 'Progress', 'Deadline', 'Status']}
          empty="No goals defined anywhere yet."
          rows={data.all_goals.map((g, i) => ({
            key: `${g.ouid}-${g.id ?? i}`,
            cells: [
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Chip mono>{g.ouid}</Chip><span className="b">{g.org}</span>
              </span>,
              g.name,
              g.department,
              <div style={{ minWidth: 140 }}><MeterRow value={g.progress} accent="var(--env)" /></div>,
              <span className="mut">{g.deadline}</span>,
              <StatusPill status={g.status} />,
            ],
          }))} />
      </section>
    </>
  );
}

export default function Dashboard() {
  const { data, error, loading, reload } = useApi('/dashboard');
  if (loading) return <p className="loading">Loading dashboard…</p>;
  if (error) return <p className="loaderr">⚠️ {error}</p>;
  if (data.role === 'super') return <SuperDashboard data={data} reload={reload} />;
  return data.role === 'admin'
    ? <AdminDashboard data={data} />
    : <EmployeeDashboard data={data} reload={reload} />;
}

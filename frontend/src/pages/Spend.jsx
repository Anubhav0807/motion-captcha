import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Wallet, TrendingUp, CalendarClock, ShieldAlert, Pencil, Trash2, BellRing } from 'lucide-react';
import { api } from '../api';
import { useProjects } from '../context/ProjectsContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { fmtDate, fmtMoney } from '../lib/format';
import {
  Badge, Button, Card, CardHeader, Checkbox, ConfirmDialog, EmptyState, ErrorState, Field, Input, LoadingBlock, Menu, Modal,
  PageHeader, Progress, Select, Stat,
} from '../components/ui';
import { TimeLine } from '../components/charts';
import { ProjectSelect } from '../components/Filters';

const THRESHOLDS = [50, 75, 90, 100];

function BudgetModal({ open, onClose, budget, onSaved }) {
  const { projects } = useProjects();
  const { user } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setF(budget
      ? { ...budget, projectId: budget.projectId || '', emails: budget.emails.join(', ') }
      : { name: '', projectId: '', amount: '', thresholds: [50, 90, 100], emails: user?.email || '' });
  }, [open, budget, user]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = {
      name: f.name, projectId: f.projectId || null, amount: Number(f.amount), thresholds: f.thresholds,
      emails: String(f.emails).split(',').map((x) => x.trim()).filter(Boolean),
    };
    try {
      const saved = budget ? await api.budgets.update(budget.id, body) : await api.budgets.create(body);
      toast.success(budget ? 'Budget updated' : 'Budget created');
      onSaved(saved);
      onClose();
    } catch (err) { toast.error(err); setBusy(false); }
  };
  const toggle = (t, on) => setF((x) => ({ ...x, thresholds: on ? [...x.thresholds, t].sort((a, b) => a - b) : x.thresholds.filter((y) => y !== t) }));
  return (
    <Modal open={open} onClose={onClose} title={budget ? 'Edit budget' : 'Create budget'}
      description="Budgets send alerts; they don’t stop traffic. Use a spend cap for a hard stop."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="bud" loading={busy}>{budget ? 'Save' : 'Create budget'}</Button></>}>
      <form id="bud" onSubmit={submit} className="stack gap-16">
        <Field label="Name"><Input value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <div className="grid-2">
          <Field label="Scope">
            <Select value={f.projectId || ''} onChange={(e) => setF({ ...f, projectId: e.target.value })}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Monthly amount (USD)"><Input type="number" min="1" step="1" value={f.amount ?? ''} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
        </div>
        <Field label="Alert at">
          <div className="check-grid">
            {THRESHOLDS.map((t) => <Checkbox key={t} checked={(f.thresholds || []).includes(t)} onChange={(v) => toggle(t, v)} label={`${t}%`} />)}
          </div>
        </Field>
        <Field label="Email alerts to" hint="Comma separated."><Input value={f.emails || ''} onChange={(e) => setF({ ...f, emails: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

function CapModal({ open, onClose, project, onSaved }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setAmount(project?.spendCap ?? ''); setBusy(false); } }, [open, project]);
  const save = async (value) => {
    setBusy(true);
    try {
      await api.spend.setCap(project.id, value);
      toast.success(value === null ? 'Spend cap removed' : 'Spend cap saved');
      onSaved();
      onClose();
    } catch (e) { toast.error(e); setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Spend cap · ${project?.name || ''}`} width={460}
      description="When this month’s spend reaches the cap, requests from this project return 429 until the next billing period or until you raise it."
      footer={<>
        {project?.spendCap && <Button variant="ghost" onClick={() => save(null)} disabled={busy}>Remove cap</Button>}
        <Button variant="primary" loading={busy} onClick={() => (Number(amount) > 0 ? save(Number(amount)) : toast.error('Enter an amount above 0'))}>Save cap</Button>
      </>}>
      <Field label="Monthly cap (USD)"><Input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
    </Modal>
  );
}

export default function Spend() {
  const toast = useToast();
  const { byId, reload: reloadProjects } = useProjects();
  const [params, setParams] = useSearchParams();
  const projectId = params.get('projectId') || '';
  const [budgetModal, setBudgetModal] = useState(null);
  const [capOpen, setCapOpen] = useState(false);
  const [del, setDel] = useState(null);

  const summary = useAsync(() => api.spend.summary(projectId || undefined), [projectId]);
  const budgets = useAsync(() => api.budgets.list(), []);
  const s = summary.data;

  const daily = useAsync(() => (s ? api.usage.timeseries({ from: s.periodStart, to: new Date().toISOString(), granularity: 'day', projectId: projectId || undefined }) : Promise.resolve(null)), [s?.periodStart, projectId]);
  const cumulative = useMemo(() => {
    let acc = 0;
    return (daily.data?.points || []).map((p) => { acc += p.cost; return { ts: p.ts, cumulative: acc, daily: p.cost }; });
  }, [daily.data]);

  const project = byId[projectId];
  const shownBudgets = (budgets.data || []).filter((b) => !projectId || b.projectId === projectId || !b.projectId);
  const capUse = s?.spendCap ? (s.monthToDate / s.spendCap) * 100 : null;

  return (
    <div className="page">
      <PageHeader eyebrow="Billing" title="Spend & budgets"
        description="Track costs as they accrue, get alerted early, and set hard caps per project."
        actions={<Button variant="primary" icon={Plus} onClick={() => setBudgetModal({ budget: null })}>New budget</Button>} />

      <div className="toolbar">
        <ProjectSelect value={projectId} onChange={(v) => setParams(v ? { projectId: v } : {}, { replace: true })} />
        {project && (project.billingEnabled
          ? <Button icon={ShieldAlert} onClick={() => setCapOpen(true)}>{project.spendCap ? `Cap: ${fmtMoney(project.spendCap)}` : 'Set spend cap'}</Button>
          : <Link to={`/billing?projectId=${project.id}`} className="link small">Enable billing to set a spend cap</Link>)}
      </div>

      {summary.error ? <Card><ErrorState error={summary.error} onRetry={summary.reload} /></Card> : (
        <div className="stats">
          <Stat label="Month to date" icon={Wallet} value={s ? fmtMoney(s.monthToDate) : '…'} sub={s ? `Since ${fmtDate(s.periodStart, { month: 'short', day: 'numeric' })}` : ''} />
          <Stat label="Forecast" icon={TrendingUp} value={s ? fmtMoney(s.forecast) : '…'} sub="At current daily rate" />
          <Stat label="Last month" icon={CalendarClock} value={s ? fmtMoney(s.lastMonth) : '…'}
            trend={s && s.lastMonth ? ((s.forecast - s.lastMonth) / s.lastMonth) * 100 : null} sub="forecast vs last" />
          <div className="stat">
            <div className="stat-top"><span className="stat-label">Spend cap</span><span className="stat-icon"><ShieldAlert size={15} /></span></div>
            <div className="stat-value">{s ? (s.spendCap ? fmtMoney(s.spendCap) : 'None') : '…'}</div>
            {capUse !== null && <div style={{ marginTop: 8 }}><Progress value={s.monthToDate} max={s.spendCap} /><div className="xsmall faint" style={{ marginTop: 4 }}>{capUse.toFixed(0)}% used</div></div>}
            {s && !s.spendCap && <div className="stat-sub muted">{projectId ? 'No hard limit set' : 'Pick a project to set one'}</div>}
          </div>
        </div>
      )}

      <Card>
        <CardHeader title="Cumulative spend this month" subtitle="Billed usage only — free-tier traffic costs $0" />
        <div className="card-pad">
          {daily.loading || !daily.data ? <LoadingBlock rows={6} /> : (
            <TimeLine data={cumulative} height={260} format={(v) => fmtMoney(v)}
              reference={s?.spendCap ? { value: s.spendCap, label: `Cap ${fmtMoney(s.spendCap)}` } : null}
              series={[{ key: 'cumulative', name: 'Cumulative', color: 'var(--c4)' }, { key: 'daily', name: 'Daily', color: 'var(--c1)', dashed: true }]} />
          )}
        </div>
      </Card>

      <Card className="table-card">
        <CardHeader title="Budgets" subtitle="Alerts are emailed and shown in notifications." />
        {budgets.loading ? <LoadingBlock rows={3} /> : shownBudgets.length === 0 ? (
          <EmptyState icon={BellRing} title="No budgets" action={<Button icon={Plus} onClick={() => setBudgetModal({ budget: null })}>Create budget</Button>}>
            Get an email when spend crosses thresholds you choose.
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Budget</th><th>Scope</th><th style={{ width: '30%' }}>This month</th><th>Alerts</th><th /></tr></thead>
              <tbody>
                {shownBudgets.map((b) => {
                  const pct = (b.spent / b.amount) * 100;
                  return (
                    <tr key={b.id}>
                      <td><div className="strong">{b.name}</div><div className="xsmall faint">{b.emails.join(', ')}</div></td>
                      <td>{b.projectId ? byId[b.projectId]?.name || '—' : 'All projects'}</td>
                      <td>
                        <div className="row between small"><span>{fmtMoney(b.spent)} of {fmtMoney(b.amount)}</span><span className="muted">{pct.toFixed(0)}%</span></div>
                        <Progress value={b.spent} max={b.amount} />
                      </td>
                      <td><div className="row gap-4 wrap">{b.thresholds.map((t) => <Badge key={t} tone={pct >= t ? 'warn' : 'neutral'}>{t}%</Badge>)}</div></td>
                      <td className="actions">
                        <Menu items={[
                          { label: 'Edit', icon: Pencil, onClick: () => setBudgetModal({ budget: b }) },
                          { label: 'Delete', icon: Trash2, danger: true, onClick: () => setDel(b) },
                        ]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <BudgetModal open={!!budgetModal} budget={budgetModal?.budget} onClose={() => setBudgetModal(null)} onSaved={() => budgets.reload({ silent: true })} />
      <CapModal open={capOpen} project={project} onClose={() => setCapOpen(false)} onSaved={() => { reloadProjects(); summary.reload({ silent: true }); }} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Delete budget?" confirmLabel="Delete"
        body={<>Alerts for <strong>{del?.name}</strong> will stop.</>}
        onConfirm={async () => { try { await api.budgets.remove(del.id); budgets.reload({ silent: true }); toast.success('Budget deleted'); } catch (e) { toast.error(e); throw e; } }} />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Gauge, ArrowUpCircle, Check, Info } from 'lucide-react';
import { api } from '../api';
import { MODELS, TIERS, TIER_ORDER, modelLabel } from '../config';
import { useProjects } from '../context/ProjectsContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { fmtCompact, fmtDate, fmtInt } from '../lib/format';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, LoadingBlock, Modal, PageHeader, Progress, Select, Textarea,
} from '../components/ui';
import { ProjectSelect } from '../components/Filters';

function LimitCell({ peak, limit, unit }) {
  if (limit === null || limit === undefined) return <div><div className="strong">Unlimited</div><div className="xsmall faint">{fmtCompact(peak)} {unit}</div></div>;
  return (
    <div className="limit-cell">
      <div className="row between xsmall"><span className="strong">{fmtCompact(peak)}</span><span className="faint">/ {fmtCompact(limit)}</span></div>
      <Progress value={peak} max={limit} />
    </div>
  );
}

function IncreaseModal({ open, onClose, projectId, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ model: MODELS[0].id, metric: 'rpm', requested: '', reason: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setForm({ model: MODELS[0].id, metric: 'rpm', requested: '', reason: '' }); setBusy(false); } }, [open]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(form.requested) > 0) || form.reason.trim().length < 10) {
      toast.error('Enter a target limit and at least a sentence on your use case.');
      return;
    }
    setBusy(true);
    try {
      await api.rateLimits.requestIncrease({ projectId, ...form, requested: Number(form.requested) });
      toast.success('Request submitted — we usually reply within 2 business days.');
      onDone();
      onClose();
    } catch (err) { toast.error(err); setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Request a higher limit" width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="rli" loading={busy}>Submit request</Button></>}>
      <form id="rli" onSubmit={submit} className="stack gap-16">
        <div className="grid-2">
          <Field label="Model"><Select value={form.model} onChange={set('model')}>{MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
          <Field label="Limit"><Select value={form.metric} onChange={set('metric')}>
            <option value="rpm">Requests per minute</option><option value="tpm">Tokens per minute</option><option value="rpd">Requests per day</option>
          </Select></Field>
        </div>
        <Field label="Requested limit"><Input type="number" min="1" value={form.requested} onChange={set('requested')} placeholder="e.g. 5000" /></Field>
        <Field label="Use case" hint="What you’re building and the traffic you expect."><Textarea rows={4} value={form.reason} onChange={set('reason')} /></Field>
      </form>
    </Modal>
  );
}

export default function RateLimits() {
  const { projects } = useProjects();
  const [params, setParams] = useSearchParams();
  const projectId = params.get('projectId') || projects[0]?.id || '';
  const [open, setOpen] = useState(false);
  const { data, loading, error, reload } = useAsync(() => (projectId ? api.rateLimits.get(projectId) : Promise.resolve(null)), [projectId]);
  const project = projects.find((p) => p.id === projectId);
  const tierIdx = TIER_ORDER.indexOf(data?.tier);

  return (
    <div className="page">
      <PageHeader eyebrow="Monitor" title="Rate limits"
        description="Limits apply per project, per model. Peak values are from today."
        actions={<Button icon={ArrowUpCircle} onClick={() => setOpen(true)} disabled={!projectId}>Request increase</Button>} />

      <div className="toolbar">
        <ProjectSelect value={projectId} allowAll={false} onChange={(v) => setParams({ projectId: v }, { replace: true })} />
        {data && <Badge tone="info">{TIERS[data.tier]?.label}</Badge>}
      </div>

      {!projectId ? <Card><EmptyState icon={Gauge} title="No projects">Create a project first.</EmptyState></Card>
        : error ? <Card><ErrorState error={error} onRetry={reload} /></Card>
        : loading || !data ? <Card><LoadingBlock rows={5} /></Card>
        : (
          <>
            {data.tier === 'free' && (
              <div className="alert alert-info">
                <Info size={16} />
                <div><strong>{project?.name}</strong> is on the free tier. <Link to={`/billing?projectId=${projectId}`} className="link">Set up billing</Link> to move to Tier 1 and raise limits up to 100×.</div>
              </div>
            )}
            <Card className="table-card">
              <CardHeader title="Current limits" subtitle="RPM and TPM show today’s peak minute. RPD shows requests so far today." />
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>Model</th><th>Requests / min</th><th>Tokens / min</th><th>Requests / day</th><th className="num">Throttled (24h)</th></tr></thead>
                  <tbody>
                    {data.limits.map((l) => (
                      <tr key={l.model}>
                        <td><div className="row gap-8"><i className="swatch" style={{ background: MODELS.find((m) => m.id === l.model)?.color }} /><span className="strong">{modelLabel(l.model)}</span></div></td>
                        <td><LimitCell peak={l.rpm.peak} limit={l.rpm.limit} unit="rpm" /></td>
                        <td><LimitCell peak={l.tpm.peak} limit={l.tpm.limit} unit="tpm" /></td>
                        <td><LimitCell peak={l.rpd.used} limit={l.rpd.limit} unit="today" /></td>
                        <td className="num">{l.throttled24h ? <Badge tone="warn">{fmtInt(l.throttled24h)}</Badge> : <span className="faint">0</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <CardHeader title="Usage tiers" subtitle="Tiers upgrade automatically once you qualify." />
              <div className="tiers">
                {TIER_ORDER.map((t, i) => (
                  <div key={t} className={`tier ${i === tierIdx ? 'current' : ''} ${i < tierIdx ? 'done' : ''}`}>
                    <div className="tier-step">{i < tierIdx ? <Check size={14} /> : i + 1}</div>
                    <div className="strong">{TIERS[t].label}{i === tierIdx && <Badge tone="ok">Current</Badge>}</div>
                    <p className="small muted">{TIERS[t].requirement}</p>
                    <div className="xsmall faint">Nova Pro: {fmtCompact(TIERS[t].limits['nova-pro'].rpm)} RPM</div>
                  </div>
                ))}
              </div>
            </Card>

            {data.requests?.length > 0 && (
              <Card className="table-card">
                <CardHeader title="Increase requests" />
                <table className="table compact">
                  <thead><tr><th>Model</th><th>Limit</th><th className="num">Requested</th><th>Submitted</th><th>Status</th></tr></thead>
                  <tbody>{data.requests.map((r) => (
                    <tr key={r.id}><td>{modelLabel(r.model)}</td><td className="upper">{r.metric}</td><td className="num">{fmtInt(r.requested)}</td><td>{fmtDate(r.createdAt)}</td><td><Badge tone="warn" dot>Under review</Badge></td></tr>
                  ))}</tbody>
                </table>
              </Card>
            )}
          </>
        )}
      <IncreaseModal open={open} onClose={() => setOpen(false)} projectId={projectId} onDone={() => reload({ silent: true })} />
    </div>
  );
}

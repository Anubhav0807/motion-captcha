import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gauge, ArrowUpCircle, Check } from 'lucide-react';
import { api } from '../api';
import { ENDPOINT_LABELS } from '../config';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { fmtCompact, fmtDate, fmtInt } from '../lib/format';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, LoadingBlock, Modal, PageHeader, Progress, Select, Textarea,
} from '../components/ui';

function LimitCell({ peak, limit }) {
  return (
    <div className="limit-cell">
      <div className="row between xsmall"><span className="strong">{fmtInt(peak)}</span><span className="faint">/ {fmtInt(limit)}</span></div>
      <Progress value={peak} max={limit} />
    </div>
  );
}

function IncreaseModal({ open, onClose, keys, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ keyId: '', requestedRpm: '', reason: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setForm({ keyId: keys[0]?.keyId || '', requestedRpm: '', reason: '' }); setBusy(false); } }, [open, keys]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.rateLimits.requestIncrease({ keyId: form.keyId || null, requestedRpm: Number(form.requestedRpm), reason: form.reason.trim() });
      toast.success('Request sent. We’ll reply by email.');
      onDone();
      onClose();
    } catch (err) { toast.error(err); setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Request a higher limit" width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="rli" loading={busy}>Send request</Button></>}>
      <form id="rli" onSubmit={submit} className="stack gap-16">
        <div className="grid-2">
          <Field label="Key">
            <Select value={form.keyId} onChange={set('keyId')}>
              <option value="">All keys</option>
              {keys.map((k) => <option key={k.keyId} value={k.keyId}>{k.name}</option>)}
            </Select>
          </Field>
          <Field label="Requests per minute"><Input type="number" min="1" required value={form.requestedRpm} onChange={set('requestedRpm')} placeholder="e.g. 5000" /></Field>
        </div>
        <Field label="Why do you need it?" hint="Expected peak traffic, launch dates, events.">
          <Textarea rows={4} required minLength={10} value={form.reason} onChange={set('reason')} />
        </Field>
      </form>
    </Modal>
  );
}

export default function RateLimits() {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const { data, loading, error, reload } = useAsync(() => api.rateLimits.get(), []);

  return (
    <div className="page">
      <PageHeader eyebrow="Monitor" title="Rate limits"
        description="Each key can make this many requests per minute to each endpoint. Over the limit, calls get HTTP 429 with a Retry-After header."
        actions={can('keys:write') && <Button icon={ArrowUpCircle} onClick={() => setOpen(true)} disabled={!data?.keys.length}>Request increase</Button>} />

      {loading ? <Card><LoadingBlock rows={5} /></Card> : error ? <Card><ErrorState error={error} onRetry={reload} /></Card> : (
        <>
          <Card className="table-card">
            <CardHeader title="Per-key limits" subtitle={`${data.plan.name} plan: ${fmtInt(data.plan.rpm)} requests/min per endpoint. Bars show today’s busiest minute (UTC).`} />
            {!data.keys.length ? <EmptyState icon={Gauge} title="No active keys" /> : (
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>Key</th>{['assess', 'challenge', 'verify'].map((e) => <th key={e}>{ENDPOINT_LABELS[e]} / min</th>)}<th className="num">Throttled (24h)</th></tr></thead>
                  <tbody>
                    {data.keys.map((k) => (
                      <tr key={k.keyId}>
                        <td><div className="strong">{k.name}</div>{k.custom && <Badge tone="info">Custom limit</Badge>}</td>
                        {k.endpoints.map((e) => <td key={e.endpoint}><LimitCell peak={e.peak} limit={k.limit} /></td>)}
                        <td className="num">
                          {k.endpoints.reduce((a, e) => a + e.throttled24h, 0)
                            ? <Badge tone="warn">{fmtInt(k.endpoints.reduce((a, e) => a + e.throttled24h, 0))}</Badge>
                            : <span className="faint">0</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Limits by plan" actions={<Link to="/billing" className="link small">Compare plans</Link>} />
            <div className="tiers">
              {data.plans.map((p, i) => {
                const idx = data.plans.findIndex((x) => x.id === data.plan.id);
                return (
                  <div key={p.id} className={`tier ${i === idx ? 'current' : ''} ${i < idx ? 'done' : ''}`}>
                    <div className="tier-step">{i < idx ? <Check size={14} /> : i + 1}</div>
                    <div className="strong">{p.name}{i === idx && <Badge tone="ok">Current</Badge>}</div>
                    <p className="small muted">{fmtInt(p.rpm)} requests/min per key</p>
                    <div className="xsmall faint">{fmtCompact(p.verifications)} verifications / month</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {data.requests.length > 0 && (
            <Card className="table-card">
              <CardHeader title="Your increase requests" />
              <div className="table-scroll">
                <table className="table compact">
                  <thead><tr><th>Key</th><th className="num">Requested</th><th>Sent</th><th>Status</th></tr></thead>
                  <tbody>{data.requests.map((r) => (
                    <tr key={r.id}>
                      <td>{data.keys.find((k) => k.keyId === r.keyId)?.name || (r.keyId ? 'Deleted key' : 'All keys')}</td>
                      <td className="num">{fmtInt(r.requestedRpm)} / min</td>
                      <td>{fmtDate(r.createdAt)}</td>
                      <td>{r.status === 'under_review' ? <Badge tone="warn" dot>Under review</Badge> : <Badge tone="ok" dot>{r.status}</Badge>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
      <IncreaseModal open={open} onClose={() => setOpen(false)} keys={data?.keys || []} onDone={() => reload({ silent: true })} />
    </div>
  );
}

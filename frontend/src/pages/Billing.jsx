import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, ExternalLink, FileText, Download, Check, Info } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { fmtCompact, fmtDate, fmtInt, fmtMoney } from '../lib/format';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader } from '../components/ui';

const PLAN_ORDER = ['free', 'pro', 'business'];

const features = (p) => [
  `${fmtCompact(p.verifications)} verifications / month`,
  `${fmtInt(p.rpm)} requests / min per key`,
  p.max_keys == null ? 'Unlimited API keys' : `${p.max_keys} API keys`,
  p.max_members == null ? 'Unlimited team members' : `${p.max_members} team members`,
  `${p.retention_days}-day request logs`,
];

const STATUS = {
  active: ['ok', 'Active'], trialing: ['info', 'Trial'], past_due: ['danger', 'Payment overdue'],
  canceled: ['neutral', 'Cancelled'], unpaid: ['danger', 'Unpaid'], incomplete: ['warn', 'Incomplete'],
};

export default function Billing() {
  const toast = useToast();
  const { can, refresh } = useAuth();
  const canWrite = can('billing:write');
  const [params, setParams] = useSearchParams();
  const account = useAsync(() => api.billing.account(), []);
  const plans = useAsync(() => api.billing.plans(), []);
  const invoices = useAsync(() => (can('billing:read') ? api.billing.invoices() : Promise.resolve([])), []);
  const [busy, setBusy] = useState(null);

  // Returning from Stripe Checkout: ?status=success|cancelled
  useEffect(() => {
    const st = params.get('status');
    if (!st) return;
    if (st === 'success') {
      toast.success('Thanks! Your plan updates as soon as the payment is confirmed.');
      // The webhook usually lands within a few seconds.
      setTimeout(() => { account.reload({ silent: true }); invoices.reload({ silent: true }); refresh(); }, 3000);
    }
    if (st === 'cancelled') toast.info('Checkout cancelled — nothing was charged.');
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = async (key, fn) => {
    setBusy(key);
    try {
      const { url } = await fn();
      window.location.assign(url);
    } catch (e) {
      toast.error(e);
      setBusy(null);
    }
  };

  if (account.loading || plans.loading) return <div className="page"><PageHeader eyebrow="Billing" title="Plans & billing" /><Card><LoadingBlock rows={6} /></Card></div>;
  if (account.error) return <div className="page"><PageHeader eyebrow="Billing" title="Plans & billing" /><Card><ErrorState error={account.error} onRetry={account.reload} /></Card></div>;

  const a = account.data;
  const current = a.plan.id;
  const status = STATUS[a.subscriptionStatus];

  return (
    <div className="page">
      <PageHeader eyebrow="Billing" title="Plans & billing"
        description="Payments are handled by Stripe. Card details never touch our servers."
        actions={a.hasCustomer && canWrite && a.stripeEnabled && (
          <Button icon={ExternalLink} loading={busy === 'portal'} onClick={() => go('portal', api.billing.portal)}>Manage subscription</Button>
        )} />

      {!a.stripeEnabled && (
        <div className="alert alert-info"><Info size={16} /><div>Paid plans aren’t available yet: billing hasn’t been configured on this server.</div></div>
      )}
      {!canWrite && <div className="alert alert-info"><Info size={16} /><div>Only owners, admins and billing members can change the plan.</div></div>}

      <div className="plan-grid">
        {(plans.data || []).sort((x, y) => PLAN_ORDER.indexOf(x.id) - PLAN_ORDER.indexOf(y.id)).map((p) => {
          const isCurrent = p.id === current;
          const higher = PLAN_ORDER.indexOf(p.id) > PLAN_ORDER.indexOf(current);
          return (
            <Card key={p.id} className={`plan-card ${isCurrent ? 'current' : ''}`}>
              <div className="row between">
                <h3>{p.name}</h3>
                {isCurrent && <Badge tone="ok">Current plan</Badge>}
              </div>
              <div className="plan-price">{p.price ? <>{fmtMoney(p.price, 'USD', 0)}<span>/month</span></> : 'Free'}</div>
              <ul className="plan-features">
                {features(p).map((f) => <li key={f}><Check size={14} />{f}</li>)}
              </ul>
              <div className="plan-cta">
                {isCurrent ? (
                  <Button className="w-full" disabled>Your plan</Button>
                ) : p.id === 'free' ? (
                  <Button className="w-full" disabled={!canWrite || !a.hasCustomer || !a.stripeEnabled} loading={busy === 'portal'}
                    onClick={() => go('portal', api.billing.portal)}>Downgrade in portal</Button>
                ) : (
                  <Button className="w-full" variant={higher ? 'primary' : 'secondary'} icon={CreditCard}
                    disabled={!canWrite || !p.purchasable || !a.stripeEnabled} loading={busy === p.id}
                    onClick={() => go(p.id, () => api.billing.checkout(p.id))}>
                    {higher ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid-3">
        <Card className="card-pad">
          <div className="muted small row gap-6"><CreditCard size={15} /> Payment method</div>
          {a.paymentMethod ? (
            <>
              <div className="pm"><div className="pm-brand">{a.paymentMethod.brand}</div><div className="mono">•••• {a.paymentMethod.last4}</div></div>
              <div className="xsmall faint">Expires {String(a.paymentMethod.expMonth).padStart(2, '0')}/{a.paymentMethod.expYear}</div>
            </>
          ) : <p className="muted" style={{ marginTop: 12 }}>{a.hasCustomer ? 'None on file.' : 'Added when you choose a paid plan.'}</p>}
        </Card>
        <Card className="card-pad">
          <div className="muted small">Subscription</div>
          <div className="big-num" style={{ fontSize: 20 }}>{a.plan.name}</div>
          <div className="row gap-6">
            {status ? <Badge tone={status[0]} dot>{status[1]}</Badge> : <Badge tone="neutral">No subscription</Badge>}
            {a.currentPeriodEnd && <span className="xsmall faint">Renews {fmtDate(a.currentPeriodEnd)}</span>}
          </div>
        </Card>
        <Card className="card-pad">
          <div className="muted small row gap-6"><FileText size={15} /> Invoices go to</div>
          <div className="strong" style={{ marginTop: 14, wordBreak: 'break-all' }}>{a.billingEmail || '—'}</div>
          <div className="xsmall faint">Change it in Settings → Organization.</div>
        </Card>
      </div>

      {can('billing:read') && (
        <Card className="table-card">
          <CardHeader title="Invoices" />
          {invoices.loading ? <LoadingBlock rows={3} /> : invoices.error ? <ErrorState error={invoices.error} onRetry={invoices.reload} />
            : !invoices.data.length ? <EmptyState icon={FileText} title="No invoices yet">Invoices appear here after your first payment.</EmptyState> : (
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>Invoice</th><th>Date</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {invoices.data.map((inv) => (
                      <tr key={inv.id}>
                        <td className="mono small">{inv.number || inv.id}</td>
                        <td>{fmtDate(inv.createdAt)}</td>
                        <td className="num strong">{fmtMoney(inv.amount, inv.currency)}</td>
                        <td>{inv.status === 'paid' ? <Badge tone="ok" dot>Paid</Badge> : inv.status === 'open' ? <Badge tone="warn" dot>Open</Badge> : <Badge tone="neutral" dot>{inv.status}</Badge>}</td>
                        <td className="actions">
                          <div className="row gap-4 end">
                            {inv.hostedUrl && <a className="btn btn-ghost btn-sm" href={inv.hostedUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /><span>View</span></a>}
                            {inv.pdfUrl && <a className="btn btn-ghost btn-sm" href={inv.pdfUrl} target="_blank" rel="noreferrer"><Download size={14} /><span>PDF</span></a>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      )}
    </div>
  );
}

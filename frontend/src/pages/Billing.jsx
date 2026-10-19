import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, ExternalLink, FileText, Download, Gift, CheckCircle2, Lock } from 'lucide-react';
import { api } from '../api';
import { TIERS } from '../config';
import { useProjects } from '../context/ProjectsContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { fmtDate, fmtMoney } from '../lib/format';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader } from '../components/ui';

export default function Billing() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { reload: reloadProjects } = useProjects();
  const account = useAsync(() => api.billing.account(), []);
  const invoices = useAsync(() => api.billing.invoices(), []);
  const [busy, setBusy] = useState(null);
  const focus = params.get('projectId');

  // Returning from hosted checkout: ?status=success|cancelled
  useEffect(() => {
    const st = params.get('status');
    if (!st) return;
    if (st === 'success') { toast.success('Billing is set up. Limits will update in a moment.'); reloadProjects(); }
    if (st === 'cancelled') toast.info('Checkout cancelled — nothing was charged.');
    const next = new URLSearchParams(params);
    next.delete('status');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCheckout = async (projectId) => {
    setBusy(projectId);
    try {
      const base = `${window.location.origin}/billing`;
      const res = await api.billing.checkout({ projectId, successUrl: `${base}?status=success`, cancelUrl: `${base}?status=cancelled` });
      if (res?.url) { window.location.assign(res.url); return; }
      toast.success('Billing enabled for this project');
      account.reload({ silent: true });
      invoices.reload({ silent: true });
      reloadProjects();
    } catch (e) { toast.error(e); }
    setBusy(null);
  };

  const openPortal = async () => {
    setBusy('portal');
    try {
      const res = await api.billing.portal({ returnUrl: `${window.location.origin}/billing` });
      if (res?.url) { window.location.assign(res.url); return; }
      toast.info('The billing portal opens here once your backend returns a portal URL.');
    } catch (e) { toast.error(e); }
    setBusy(null);
  };

  const downloadInvoice = async (inv) => {
    try {
      const { url } = await api.billing.invoicePdf(inv.id);
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noreferrer'; a.download = `${inv.number}.pdf`;
      a.click();
    } catch (e) { toast.error(e); }
  };

  if (account.loading) return <div className="page"><PageHeader eyebrow="Billing" title="Billing" /><Card><LoadingBlock rows={6} /></Card></div>;
  if (account.error) return <div className="page"><PageHeader eyebrow="Billing" title="Billing" /><Card><ErrorState error={account.error} onRetry={account.reload} /></Card></div>;
  const a = account.data;

  return (
    <div className="page">
      <PageHeader eyebrow="Billing" title="Billing"
        description="Payment method, per-project billing and invoices. Card details are handled by our payment processor, never stored here."
        actions={<Button icon={ExternalLink} onClick={openPortal} loading={busy === 'portal'}>Manage in billing portal</Button>} />

      <div className="grid-3">
        <Card className="card-pad">
          <div className="muted small row gap-6"><CreditCard size={15} /> Payment method</div>
          {a.paymentMethod ? (
            <>
              <div className="pm">
                <div className="pm-brand">{a.paymentMethod.brand}</div>
                <div className="mono">•••• {a.paymentMethod.last4}</div>
              </div>
              <div className="xsmall faint">Expires {String(a.paymentMethod.expMonth).padStart(2, '0')}/{a.paymentMethod.expYear}</div>
            </>
          ) : <p className="muted" style={{ marginTop: 12 }}>No payment method yet.</p>}
          <Button size="sm" style={{ marginTop: 14 }} onClick={openPortal}>{a.paymentMethod ? 'Update' : 'Add payment method'}</Button>
        </Card>
        <Card className="card-pad">
          <div className="muted small row gap-6"><Gift size={15} /> Credits</div>
          <div className="big-num">{fmtMoney(a.credits || 0)}</div>
          <div className="xsmall faint">Applied automatically before your card is charged.</div>
        </Card>
        <Card className="card-pad">
          <div className="muted small row gap-6"><FileText size={15} /> Invoices sent to</div>
          <div className="strong" style={{ marginTop: 14, wordBreak: 'break-all' }}>{a.billingEmail}</div>
          <div className="xsmall faint">Currency: {a.currency}</div>
        </Card>
      </div>

      <Card className="table-card">
        <CardHeader title="Projects" subtitle="Billing is enabled per project. Unbilled projects stay on the free tier." />
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Project</th><th>Tier</th><th>Billing</th><th /></tr></thead>
            <tbody>
              {a.projects.map((p) => (
                <tr key={p.id} className={focus === p.id ? 'highlight' : ''}>
                  <td className="strong">{p.name}</td>
                  <td><Badge tone={p.billingEnabled ? 'info' : 'neutral'}>{TIERS[p.tier]?.label}</Badge></td>
                  <td>{p.billingEnabled ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="warn" dot>Not set up</Badge>}</td>
                  <td className="actions">
                    {p.billingEnabled
                      ? <span className="row gap-6 end muted small"><CheckCircle2 size={15} /> Billed monthly</span>
                      : <Button size="sm" variant="primary" icon={Lock} loading={busy === p.id} onClick={() => startCheckout(p.id)}>Set up billing</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="table-card">
        <CardHeader title="Invoices" />
        {invoices.loading ? <LoadingBlock rows={3} /> : invoices.error ? <ErrorState error={invoices.error} onRetry={invoices.reload} />
          : invoices.data.length === 0 ? <EmptyState icon={FileText} title="No invoices yet">Invoices appear after your first billed month.</EmptyState> : (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Invoice</th><th>Period</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {invoices.data.map((inv) => (
                    <tr key={inv.id}>
                      <td className="mono small">{inv.number}</td>
                      <td>{fmtDate(inv.periodStart, { month: 'long', year: 'numeric' })}</td>
                      <td className="num strong">{fmtMoney(inv.amount, inv.currency)}</td>
                      <td>{inv.status === 'paid' ? <Badge tone="ok" dot>Paid</Badge> : inv.status === 'upcoming' ? <Badge tone="info" dot>In progress</Badge> : <Badge tone="danger" dot>{inv.status}</Badge>}</td>
                      <td className="actions">
                        {inv.status !== 'upcoming' && <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadInvoice(inv)}>PDF</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </div>
  );
}

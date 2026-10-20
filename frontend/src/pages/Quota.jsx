import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, TrendingUp, CalendarClock, BellRing, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { fmtDate, fmtInt } from '../lib/format';
import { Button, Card, CardHeader, Checkbox, ErrorState, Field, Input, LoadingBlock, PageHeader, Progress, Stat } from '../components/ui';
import { TimeLine, Legend } from '../components/charts';

const THRESHOLDS = [25, 50, 75, 80, 90, 100];

function AlertsCard({ alerts, onSaved }) {
  const toast = useToast();
  const { can } = useAuth();
  const editable = can('billing:write');
  const [thresholds, setThresholds] = useState(alerts.thresholds);
  const [emails, setEmails] = useState(alerts.emails.join(', '));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setThresholds(alerts.thresholds); setEmails(alerts.emails.join(', ')); }, [alerts]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.quota.setAlerts({ thresholds, emails: emails.split(',').map((x) => x.trim()).filter(Boolean) });
      onSaved(res);
      toast.success('Alert settings saved');
    } catch (err) { toast.error(err); }
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader title="Usage alerts" subtitle="Each alert is sent once per month, by email and in notifications." />
      <form className="card-pad stack gap-16" onSubmit={save}>
        <Field label="Alert when this much of the monthly quota is used">
          <div className="check-grid">
            {THRESHOLDS.map((t) => (
              <Checkbox key={t} label={`${t}%`} checked={thresholds.includes(t)}
                onChange={(on) => editable && setThresholds((x) => (on ? [...x, t].sort((a, b) => a - b) : x.filter((y) => y !== t)))} />
            ))}
          </div>
        </Field>
        <Field label="Also email" hint="Comma separated. Team members get alerts unless they turn them off in Settings.">
          <Input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="ops@yourcompany.com" disabled={!editable} />
        </Field>
        {editable && <div><Button variant="primary" type="submit" loading={busy}>Save alerts</Button></div>}
      </form>
    </Card>
  );
}

export default function Quota() {
  const { data, loading, error, reload, setData } = useAsync(() => api.quota.get(), []);

  if (loading) return <div className="page"><PageHeader eyebrow="Billing" title="Quota & alerts" /><Card><LoadingBlock rows={6} /></Card></div>;
  if (error) return <div className="page"><PageHeader eyebrow="Billing" title="Quota & alerts" /><Card><ErrorState error={error} onRetry={reload} /></Card></div>;

  const pct = (data.used / data.quota) * 100;
  const over = data.forecast > data.quota;

  return (
    <div className="page">
      <PageHeader eyebrow="Billing" title="Quota & alerts"
        description="Your plan includes a number of verifications each calendar month (UTC). Every call to /v1/verify with a valid token counts as one."
        actions={<Link to="/billing" className="btn btn-secondary btn-md"><span>Change plan</span></Link>} />

      {pct >= 100 ? (
        <div className="alert alert-danger"><AlertTriangle size={16} /><div><strong>Quota reached.</strong> New CAPTCHAs are paused until {fmtDate(data.periodEnd, { month: 'long', day: 'numeric' })}. <Link to="/billing" className="link">Upgrade</Link> to resume now.</div></div>
      ) : over && (
        <div className="alert alert-warn"><AlertTriangle size={16} /><div>At the current pace you’ll use about <strong>{fmtInt(data.forecast)}</strong> verifications this month, above your {fmtInt(data.quota)} quota. When the quota runs out, new CAPTCHAs are paused.</div></div>
      )}

      <div className="stats">
        <div className="stat">
          <div className="stat-top"><span className="stat-label">Used this month</span><span className="stat-icon"><PieChart size={15} /></span></div>
          <div className="stat-value">{fmtInt(data.used)}</div>
          <Progress value={data.used} max={data.quota} />
          <div className="stat-sub muted">{pct.toFixed(1)}% of {fmtInt(data.quota)}</div>
        </div>
        <Stat label="Remaining" icon={BellRing} value={fmtInt(data.remaining)} sub={`${data.plan.name} plan`} />
        <Stat label="Forecast" icon={TrendingUp} value={fmtInt(data.forecast)} sub="At the current daily pace" />
        <Stat label="Resets" icon={CalendarClock} value={fmtDate(data.periodEnd, { month: 'short', day: 'numeric', timeZone: 'UTC' })} sub="00:00 UTC" />
      </div>

      <Card>
        <CardHeader title="This month" subtitle="Cumulative verifications against your quota" />
        <div className="card-pad">
          <Legend items={[{ name: 'Cumulative', color: 'var(--c1)' }, { name: 'Per day', color: 'var(--c2)' }]} />
          <TimeLine data={data.daily} height={260}
            reference={{ value: data.quota, label: `Quota ${fmtInt(data.quota)}` }}
            series={[
              { key: 'cumulative', name: 'Cumulative', color: 'var(--c1)' },
              { key: 'verifications', name: 'Per day', color: 'var(--c2)', dashed: true },
            ]} />
        </div>
      </Card>

      <AlertsCard alerts={data.alerts} onSaved={(alerts) => setData((d) => ({ ...d, alerts }))} />
    </div>
  );
}

const DAY = 86_400_000;

export const fmtInt = (n) => new Intl.NumberFormat('en-US').format(Math.round(n || 0));

export const fmtCompact = (n) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);

export const fmtMoney = (n, currency = 'USD', digits) => {
  const v = n || 0;
  const d = digits ?? (Math.abs(v) < 10 ? 2 : Math.abs(v) < 1000 ? 2 : 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
};

export const fmtPct = (n, digits = 1) => `${(n || 0).toFixed(digits)}%`;

export const fmtDate = (s, opts = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  s ? new Date(s).toLocaleDateString('en-US', opts) : '—';

export const fmtDateTime = (s) =>
  s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

export function fmtRelative(s) {
  if (!s) return 'Never';
  const diff = Date.now() - new Date(s).getTime();
  const abs = Math.abs(diff);
  const fut = diff < 0;
  const units = [
    ['year', 365 * DAY], ['month', 30 * DAY], ['day', DAY], ['hour', 3_600_000], ['minute', 60_000],
  ];
  for (const [u, ms] of units) {
    if (abs >= ms) {
      const v = Math.floor(abs / ms);
      return fut ? `in ${v} ${u}${v > 1 ? 's' : ''}` : `${v} ${u}${v > 1 ? 's' : ''} ago`;
    }
  }
  return fut ? 'in a moment' : 'just now';
}

export const maskSecret = (k) => `mc_sk_••••••••${k.secretLast4 || ''}`;
export const shortSiteKey = (k) => `${k.siteKey.slice(0, 12)}…${k.siteKey.slice(-4)}`;

export const RANGE_PRESETS = [
  { id: '24h', label: 'Last 24 hours' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
];

export function rangeParams(id) {
  const to = Date.now();
  const map = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };
  const days = map[id] || 30;
  return {
    from: new Date(to - days * DAY).toISOString(),
    to: new Date(to).toISOString(),
    granularity: days <= 2 ? 'hour' : 'day',
  };
}

// Daily buckets are UTC days, so they're labelled in UTC; hourly ones in local time.
export const tickLabel = (granularity) => (ts) =>
  granularity === 'hour'
    ? new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric' })
    : new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const tooltipLabel = (granularity) => (ts) =>
  granularity === 'hour'
    ? new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })
    : new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** "1 challenge", "3 challenges" (formatted with thousands separators). */
export const plural = (n, word, many = `${word}s`) => `${fmtInt(n)} ${Math.round(n || 0) === 1 ? word : many}`;

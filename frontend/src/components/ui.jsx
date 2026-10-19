import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, AlertTriangle, Copy, Check, MoreHorizontal } from 'lucide-react';
import { copyText } from '../lib/format';

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, children, className = '', ...rest }) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Loader2 size={15} className="spin" /> : Icon ? <Icon size={15} /> : null}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className = '', size = 16, ...rest }) {
  return (
    <button className={`icon-btn ${className}`} aria-label={label} data-tip={label} {...rest}>
      <Icon size={size} />
    </button>
  );
}

export function CopyButton({ value, label = 'Copy', onCopied, showLabel = false }) {
  const [done, setDone] = useState(false);
  const handle = async () => {
    if (await copyText(value)) {
      setDone(true);
      onCopied?.();
      setTimeout(() => setDone(false), 1600);
    }
  };
  return showLabel ? (
    <Button icon={done ? Check : Copy} onClick={handle} variant="secondary" size="sm">{done ? 'Copied' : label}</Button>
  ) : (
    <IconButton icon={done ? Check : Copy} label={done ? 'Copied' : label} onClick={handle} />
  );
}

export const Badge = ({ tone = 'neutral', children, dot }) => (
  <span className={`badge badge-${tone}`}>{dot && <i className="badge-dot" />}{children}</span>
);

export const Card = ({ children, className = '', ...rest }) => <section className={`card ${className}`} {...rest}>{children}</section>;

export function CardHeader({ title, subtitle, actions }) {
  return (
    <div className="card-head">
      <div>
        <h3>{title}</h3>
        {subtitle && <p className="muted small">{subtitle}</p>}
      </div>
      {actions && <div className="row gap-8">{actions}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="row gap-8 wrap">{actions}</div>}
    </header>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <div className="field-error">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

export const Input = (p) => <input className="input" {...p} />;
export const Textarea = (p) => <textarea className="input textarea" {...p} />;
export function Select({ children, className = '', ...p }) {
  return (
    <div className={`select-wrap ${className}`}>
      <select className="input select" {...p}>{children}</select>
    </div>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value}
          className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.icon && <o.icon size={14} />}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, description }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="check-box" />
      <span>
        <span className="check-label">{label}</span>
        {description && <span className="check-desc">{description}</span>}
      </span>
    </label>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label className={`toggle-row ${disabled ? 'disabled' : ''}`}>
      <span>
        <span className="check-label">{label}</span>
        {description && <span className="check-desc">{description}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled}
        className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
        <i />
      </button>
    </label>
  );
}

export const Spinner = ({ size = 18 }) => <Loader2 size={size} className="spin muted" />;

export const Skeleton = ({ h = 16, w = '100%', r = 8 }) => <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} />;

export function LoadingBlock({ rows = 4 }) {
  return (
    <div className="stack gap-12" style={{ padding: 20 }}>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} h={18} w={`${90 - i * 12}%`} />)}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty">
      <div className="empty-icon danger"><AlertTriangle size={22} /></div>
      <h4>Couldn’t load this</h4>
      <p className="muted">{error?.message || 'Unexpected error.'}</p>
      {onRetry && <Button onClick={() => onRetry()}>Try again</Button>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && <div className="empty-icon"><Icon size={22} /></div>}
      <h4>{title}</h4>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function Progress({ value, max, tone }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  const t = tone || (pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : 'ok');
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <i className={`progress-${t}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub, icon: Icon, trend }) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {Icon && <span className="stat-icon"><Icon size={15} /></span>}
      </div>
      <div className="stat-value">{value}</div>
      {(sub || trend !== undefined) && (
        <div className="stat-sub">
          {trend !== undefined && trend !== null && Number.isFinite(trend) && (
            <span className={trend >= 0 ? 'up' : 'down'}>{trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%</span>
          )}
          {sub && <span className="muted">{sub}</span>}
        </div>
      )}
    </div>
  );
}

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, [open, onClose]);
}

export function Modal({ open, onClose, title, description, children, footer, width = 520, dismissable = true }) {
  useEscape(open, dismissable ? onClose : undefined);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => dismissable && e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {description && <p className="muted small">{description}</p>}
          </div>
          {dismissable && <IconButton icon={X} label="Close" onClick={onClose} />}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, children, width = 560 }) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="overlay overlay-right" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', tone = 'danger', requireText }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setText(''); setBusy(false); } }, [open]);
  const ok = !requireText || text === requireText;
  const go = async () => {
    setBusy(true);
    try { await onConfirm(); onClose(); } catch { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} width={460}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={go} loading={busy} disabled={!ok}>{confirmLabel}</Button>
      </>}>
      <div className="stack gap-12">
        <div className="muted">{body}</div>
        {requireText && (
          <Field label={<>Type <code className="mono">{requireText}</code> to confirm</>}>
            <Input value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          </Field>
        )}
      </div>
    </Modal>
  );
}

/** Small dropdown menu. items: [{label, icon, onClick, danger, disabled}] or 'divider' */
export function Menu({ items, label = 'More actions', trigger }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const k = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      {trigger ? trigger({ open, toggle: () => setOpen((o) => !o) }) : (
        <IconButton icon={MoreHorizontal} label={label} onClick={() => setOpen((o) => !o)} aria-expanded={open} />
      )}
      {open && (
        <div className="menu" role="menu">
          {items.filter(Boolean).map((it, i) => it === 'divider' ? <hr key={i} /> : (
            <button key={i} role="menuitem" className={it.danger ? 'danger' : ''} disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick?.(); }}>
              {it.icon && <it.icon size={15} />}<span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Tabs({ value, onChange, tabs }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={value === t.value ? 'on' : ''}
          onClick={() => onChange(t.value)}>{t.label}</button>
      ))}
    </div>
  );
}

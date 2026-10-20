import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Waves, ShieldCheck, Activity, KeyRound, MailCheck } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { APP_NAME, ROLE_LABELS } from '../config';
import { Button, Field, Input, Spinner } from '../components/ui';

function AuthShell({ children }) {
  return (
    <div className="auth">
      <div className="auth-panel">
        <div className="brand brand-light">
          <div className="brand-mark"><Waves size={17} strokeWidth={2.5} /></div>
          <div className="brand-name">{APP_NAME}</div>
        </div>
        <div>
          <h1 className="auth-title">Behaviour-scored CAPTCHAs that bots can’t read frame by frame.</h1>
          <div className="auth-demo" aria-hidden="true"><span>Kx7pQ</span></div>
        </div>
        <ul className="auth-points">
          <li><Activity size={18} /> Risk-scores every visitor from mouse, click and typing rhythm</li>
          <li><ShieldCheck size={18} /> Humans get a simple image; risky traffic gets the motion CAPTCHA</li>
          <li><KeyRound size={18} /> Site + secret keys, domain allowlists and live usage per key</li>
        </ul>
      </div>
      <div className="auth-form-wrap">{children}</div>
    </div>
  );
}

function useSubmit(fn) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try { await fn(); } catch (err) { setError(err.message); setBusy(false); }
  };
  return { error, busy, submit };
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const { error, busy, submit } = useSubmit(async () => {
    await login(form.email.trim(), form.password);
    navigate(location.state?.from?.pathname || '/', { replace: true });
  });
  return (
    <AuthShell>
      <form className="auth-form" onSubmit={submit}>
        <h2>Sign in</h2>
        <p className="muted small">Welcome back to {APP_NAME}.</p>
        <Field label="Work email" htmlFor="email">
          <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label={<span className="row between">Password <Link to="/forgot-password" className="link xsmall">Forgot password?</Link></span>} htmlFor="password">
          <Input id="password" type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {error && <div className="alert alert-danger">{error}</div>}
        <Button variant="primary" type="submit" loading={busy} className="w-full">Sign in</Button>
        <p className="small muted center">New to {APP_NAME}? <Link to="/signup" className="link">Create an account</Link></p>
      </form>
    </AuthShell>
  );
}

export function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', company: '', email: '', password: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const { error, busy, submit } = useSubmit(async () => {
    await signup({ ...form, email: form.email.trim() });
    navigate('/keys?new=1', { replace: true });
  });
  return (
    <AuthShell>
      <form className="auth-form" onSubmit={submit}>
        <h2>Create your account</h2>
        <p className="muted small">Free plan: 10,000 verifications a month, no card needed.</p>
        <div className="grid-2">
          <Field label="Your name" htmlFor="name"><Input id="name" required autoComplete="name" value={form.name} onChange={set('name')} /></Field>
          <Field label="Company" htmlFor="company"><Input id="company" required autoComplete="organization" value={form.company} onChange={set('company')} /></Field>
        </div>
        <Field label="Work email" htmlFor="email"><Input id="email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        {error && <div className="alert alert-danger">{error}</div>}
        <Button variant="primary" type="submit" loading={busy} className="w-full">Create account</Button>
        <p className="small muted center">Already have an account? <Link to="/login" className="link">Sign in</Link></p>
      </form>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { error, busy, submit } = useSubmit(async () => {
    await api.auth.forgotPassword(email.trim());
    setSent(true);
  });
  return (
    <AuthShell>
      {sent ? (
        <div className="auth-form">
          <div className="empty-icon"><MailCheck size={22} /></div>
          <h2>Check your email</h2>
          <p className="muted">If an account exists for <strong>{email}</strong>, we’ve sent a link to reset the password. It expires in an hour.</p>
          <Link to="/login" className="link small">Back to sign in</Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <h2>Reset your password</h2>
          <p className="muted small">We’ll email you a reset link.</p>
          <Field label="Email" htmlFor="email"><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {error && <div className="alert alert-danger">{error}</div>}
          <Button variant="primary" type="submit" loading={busy} className="w-full">Send reset link</Button>
          <p className="small muted center"><Link to="/login" className="link">Back to sign in</Link></p>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { error, busy, submit } = useSubmit(async () => {
    if (password !== confirm) throw new Error('Passwords don’t match.');
    await api.auth.resetPassword(params.get('token') || '', password);
    navigate('/login', { replace: true, state: { reset: true } });
  });
  return (
    <AuthShell>
      <form className="auth-form" onSubmit={submit}>
        <h2>Choose a new password</h2>
        <p className="muted small">You’ll be signed out everywhere else.</p>
        <Field label="New password" hint="At least 8 characters."><Input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label="Confirm password"><Input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        {error && <div className="alert alert-danger">{error}</div>}
        <Button variant="primary" type="submit" loading={busy} className="w-full">Update password</Button>
      </form>
    </AuthShell>
  );
}

export function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { acceptInvite } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ name: '', password: '' });

  useEffect(() => {
    api.auth.inviteInfo(token).then(setInfo).catch((e) => setLoadError(e.message));
  }, [token]);

  const { error, busy, submit } = useSubmit(async () => {
    await acceptInvite({ token, ...form });
    navigate('/', { replace: true });
  });

  return (
    <AuthShell>
      {loadError ? (
        <div className="auth-form">
          <h2>Invitation unavailable</h2>
          <p className="muted">{loadError}</p>
          <Link to="/login" className="link small">Go to sign in</Link>
        </div>
      ) : !info ? <Spinner size={22} /> : (
        <form className="auth-form" onSubmit={submit}>
          <h2>Join {info.organization}</h2>
          <p className="muted small">You’re joining as <strong>{ROLE_LABELS[info.role]}</strong> with <strong>{info.email}</strong>.</p>
          <Field label="Your name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Password" hint="At least 8 characters."><Input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          {error && <div className="alert alert-danger">{error}</div>}
          <Button variant="primary" type="submit" loading={busy} className="w-full">Accept invitation</Button>
        </form>
      )}
    </AuthShell>
  );
}

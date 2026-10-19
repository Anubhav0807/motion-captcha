import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, ShieldCheck, BarChart3, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { APP_NAME, USE_MOCK } from '../config';
import { Button, Field, Input } from '../components/ui';

export default function Login() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(form.email.trim(), form.password);
      else await signup(form.name.trim(), form.email.trim(), form.password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-panel">
        <div className="brand brand-light">
          <div className="brand-mark"><KeyRound size={16} strokeWidth={2.5} /></div>
          <div className="brand-name">{APP_NAME}</div>
        </div>
        <h1 className="auth-title">Keys, usage and billing for your API — in one console.</h1>
        <ul className="auth-points">
          <li><ShieldCheck size={18} /> Issue scoped keys with IP and model restrictions</li>
          <li><BarChart3 size={18} /> Watch requests, tokens and errors in real time</li>
          <li><Wallet size={18} /> Set budgets and hard spend caps per project</li>
        </ul>
      </div>
      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
          <p className="muted small">
            {mode === 'login' ? 'Welcome back.' : 'Get a free-tier project and your first key in a minute.'}
          </p>
          {mode === 'signup' && (
            <Field label="Full name" htmlFor="name"><Input id="name" value={form.name} onChange={set('name')} required autoComplete="name" /></Field>
          )}
          <Field label="Work email" htmlFor="email"><Input id="email" type="email" value={form.email} onChange={set('email')} required autoComplete="email" /></Field>
          <Field label="Password" htmlFor="password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
            <Input id="password" type="password" value={form.password} onChange={set('password')} required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </Field>
          {error && <div className="alert alert-danger">{error}</div>}
          <Button variant="primary" type="submit" loading={busy} className="w-full">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
          <p className="small muted center">
            {mode === 'login' ? 'New here? ' : 'Already have an account? '}
            <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
          {USE_MOCK && <p className="xsmall faint center">Demo mode: any email and a 6+ character password works.</p>}
        </form>
      </div>
    </div>
  );
}

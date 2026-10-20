import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ERROR_CODE_HELP, PUBLIC_API_URL } from '../config';
import { useAsync } from '../hooks/useAsync';
import { Card, CardHeader, CopyButton, PageHeader, Select, Tabs } from '../components/ui';

function Code({ children }) {
  return (
    <div className="code-wrap">
      <pre className="code-snippet">{children}</pre>
      <div className="code-copy"><CopyButton value={children} label="Copy code" /></div>
    </div>
  );
}

const serverSnippets = (api) => ({
  node: `// Node.js 18+ (Express shown)
app.post('/login', async (req, res) => {
  const r = await fetch('${api}/v1/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: \`Bearer \${process.env.MOTION_CAPTCHA_SECRET}\`,
    },
    body: JSON.stringify({
      token: req.body.mc_token,
      answer: req.body.mc_answer,
      remote_ip: req.ip,            // optional
    }),
  });
  const result = await r.json();

  if (!result.success) {
    return res.status(400).send('CAPTCHA failed: ' + result.error_codes.join(', '));
  }
  // result.risk_score (0-100) is available for your own rules
  // ...continue with login
});`,
  python: `# Python (requests). Works the same in Django / Flask / FastAPI.
import os, requests

def verify_captcha(form, remote_ip=None):
    r = requests.post(
        "${api}/v1/verify",
        headers={"Authorization": f"Bearer {os.environ['MOTION_CAPTCHA_SECRET']}"},
        json={
            "token": form.get("mc_token", ""),
            "answer": form.get("mc_answer", ""),
            "remote_ip": remote_ip,
        },
        timeout=5,
    )
    r.raise_for_status()
    result = r.json()
    return result["success"], result`,
  php: `<?php
$ch = curl_init('${api}/v1/verify');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    'Content-Type: application/json',
    'Authorization: Bearer ' . getenv('MOTION_CAPTCHA_SECRET'),
  ],
  CURLOPT_POSTFIELDS => json_encode([
    'token'     => $_POST['mc_token'] ?? '',
    'answer'    => $_POST['mc_answer'] ?? '',
    'remote_ip' => $_SERVER['REMOTE_ADDR'],
  ]),
]);
$result = json_decode(curl_exec($ch), true);

if (empty($result['success'])) {
  http_response_code(400);
  exit('CAPTCHA failed');
}`,
  curl: `curl ${api}/v1/verify \\
  -H "Authorization: Bearer $MOTION_CAPTCHA_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"token":"<mc_token from the form>","answer":"<mc_answer from the form>"}'`,
});

export default function Integration() {
  const keys = useAsync(() => api.keys.list({ status: 'active' }), []);
  const [keyId, setKeyId] = useState('');
  const [lang, setLang] = useState('node');
  useEffect(() => { if (!keyId && keys.data?.length) setKeyId(keys.data[0].id); }, [keys.data, keyId]);
  const key = keys.data?.find((k) => k.id === keyId);
  const siteKey = key?.siteKey || 'mc_pk_YOUR_SITE_KEY';

  const html = `<form method="post" action="/login">
  <input name="email" type="email">
  <input name="password" type="password">

  <div class="motion-captcha" data-sitekey="${siteKey}"></div>

  <button type="submit">Sign in</button>
</form>

<script src="${PUBLIC_API_URL}/v1/widget.js" async defer></script>`;

  return (
    <div className="page">
      <PageHeader eyebrow="Build" title="Integration"
        description="Three steps: add the widget to your form, read two hidden fields on submit, and verify them from your server." />

      <div className="toolbar">
        <span className="small muted">Show snippets for</span>
        <Select value={keyId} onChange={(e) => setKeyId(e.target.value)} aria-label="API key">
          {!keys.data?.length && <option value="">No keys yet</option>}
          {keys.data?.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </Select>
        {!keys.data?.length && !keys.loading && <Link to="/keys?new=1" className="link small">Create a key first</Link>}
      </div>

      <Card>
        <CardHeader title="1 · Add the widget to your page" subtitle="Put it inside the form you want to protect." />
        <div className="card-pad stack gap-12">
          <Code>{html}</Code>
          <p className="small muted">
            The widget collects mouse, click and keyboard rhythm on the page (no keystroke contents), scores the visitor, then shows
            a static or motion CAPTCHA. It adds two hidden fields to the form: <code>mc_token</code> and <code>mc_answer</code>.
            {key && !key.allowedDomains.length && <strong> This key accepts any domain — add your domains on the API keys page before going live.</strong>}
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="2 · Verify on your server" subtitle="Never in the browser — this call uses your secret key."
          actions={<Tabs value={lang} onChange={setLang} tabs={[
            { value: 'node', label: 'Node.js' }, { value: 'python', label: 'Python' }, { value: 'php', label: 'PHP' }, { value: 'curl', label: 'cURL' },
          ]} />} />
        <div className="card-pad stack gap-12">
          <Code>{serverSnippets(PUBLIC_API_URL)[lang]}</Code>
          <p className="small muted">Store the secret as <code>MOTION_CAPTCHA_SECRET</code>. Each token can be verified once, and only before it expires ({key?.settings.challengeTtl ?? 120} seconds for this key).</p>
        </div>
      </Card>

      <div className="grid-2 gap-16">
        <Card>
          <CardHeader title="3 · Read the result" />
          <div className="card-pad stack gap-12">
            <Code>{`{
  "success": true,
  "risk_score": 12,            // 0 (human-like) – 100 (bot-like)
  "challenge_type": "static",  // or "dynamic" (motion)
  "hostname": "www.example.com",
  "challenge_ts": "2026-10-20T14:09:27Z",
  "error_codes": []
}`}</Code>
            <p className="small muted">Want to be stricter? Reject or add extra checks when <code>risk_score</code> is high, even if the answer was right.</p>
          </div>
        </Card>
        <Card className="table-card">
          <CardHeader title="Error codes" />
          <div className="table-scroll">
            <table className="table compact">
              <tbody>
                {['incorrect-answer', 'token-expired', 'token-already-used', 'invalid-token', 'challenge-not-issued'].map((c) => (
                  <tr key={c}><td className="mono small nowrap">{c}</td><td className="small muted">{ERROR_CODE_HELP[c]}</td></tr>
                ))}
                <tr><td className="mono small nowrap">HTTP 401</td><td className="small muted">Missing or wrong secret key.</td></tr>
                <tr><td className="mono small nowrap">HTTP 429</td><td className="small muted">Rate limit hit. Honour the Retry-After header.</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="JavaScript API (optional)" subtitle="For single-page apps or forms submitted with fetch." />
        <div className="card-pad">
          <Code>{`<div id="captcha"></div>
<script src="${PUBLIC_API_URL}/v1/widget.js"></script>
<script>
  const el = document.getElementById('captcha');
  motionCaptcha.render(el, {
    siteKey: '${siteKey}',
    callback: ({ token, answer }) => { /* enable your submit button */ },
    expiredCallback: () => { /* disable it again */ },
    theme: 'light', // or 'dark'
  });

  // On submit:
  const { token, answer } = motionCaptcha.getResponse(el) || {};
  // send token + answer to your server, then:
  motionCaptcha.reset(el);
</script>`}</Code>
        </div>
      </Card>
    </div>
  );
}

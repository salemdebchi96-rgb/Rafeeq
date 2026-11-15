import { ASSETS } from './assets.js';

const enc = new TextEncoder();
const J = (o, status = 200, headers = {}) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));
const sha = async (t) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(t)));
const randToken = () => toHex(crypto.getRandomValues(new Uint8Array(24)));
const hmacKey = (secret, usages) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages);
const SEC = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
};

// ---------- passwords & sessions (Web Crypto, no dependencies) ----------
async function hashPw(pw, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return `${b64u(salt)}.${b64u(bits)}`;
}
async function checkPw(pw, stored) {
  const [s, h] = String(stored).split('.');
  const again = (await hashPw(pw, unb64u(s))).split('.')[1];
  if (again.length !== h.length) return false;
  let d = 0; for (let i = 0; i < h.length; i++) d |= again.charCodeAt(i) ^ h.charCodeAt(i);
  return d === 0;
}
async function signJwt(env, id) {
  const h = b64u(enc.encode('{"alg":"HS256","typ":"JWT"}'));
  const p = b64u(enc.encode(JSON.stringify({ id, exp: Math.floor(Date.now() / 1000) + 30 * 86400 })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env.JWT_SECRET, ['sign']), enc.encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}
async function verifyJwt(env, t) {
  try {
    const [h, p, s] = String(t || '').split('.');
    if (!s) return null;
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(env.JWT_SECRET, ['verify']), unb64u(s), enc.encode(`${h}.${p}`)))) return null;
    const d = JSON.parse(new TextDecoder().decode(unb64u(p)));
    return d.exp > Date.now() / 1000 ? d : null;
  } catch { return null; }
}
const getCookie = (req, n) => (req.headers.get('Cookie') || '').split(/;\s*/).map((x) => x.split('=')).find(([k]) => k === n)?.[1];
const sessionCookie = async (env, id) => `t=${await signJwt(env, id)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;
const CLEAR = 't=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

// ---------- database ----------
let ready;
const init = (env) => (ready ??= env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass TEXT NOT NULL,
    companion_name TEXT NOT NULL DEFAULT 'رفيق', persona TEXT NOT NULL DEFAULT '',
    plan TEXT NOT NULL DEFAULT 'free', ls_sub TEXT, email_verified INTEGER NOT NULL DEFAULT 0,
    verify_token TEXT, reset_token TEXT, reset_expires TEXT, created TEXT NOT NULL DEFAULT (datetime('now')))`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS messages(
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
    created TEXT NOT NULL DEFAULT (datetime('now')))`),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_msg_user ON messages(user_id, id)'),
]).catch((e) => { ready = undefined; throw e; }));
const first = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const all = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
const run = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();
const pub = (u) => ({ email: u.email, companionName: u.companion_name, persona: u.persona, plan: u.plan, verified: !!u.email_verified });

// ---------- email (Resend) ----------
async function sendMail(env, to, subject, text) {
  if (!env.RESEND_API_KEY) { console.log(`[mail to ${to}] ${subject}\n${text}`); return; }
  await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }),
  }).catch((e) => console.error('mail error:', e.message));
}
async function startVerify(env, base, u) {
  const t = randToken();
  await run(env, 'UPDATE users SET verify_token=? WHERE id=?', await sha(t), u.id);
  await sendMail(env, u.email, 'تأكيد بريدك في رفيق', `اضغط على الرابط لتأكيد بريدك:\n${base}/api/verify?token=${t}`);
}

// ---------- AI ----------
const systemPrompt = (u) => `أنت «${u.companion_name}»، رفيق ذكاء اصطناعي ودود وداعم ودافئ.
القواعد الثابتة (لها الأولوية على أي تفضيلات للمستخدم):
- تحدّث بلغة المستخدم، وغالبًا بالعربية البسيطة. اجعل ردودك قصيرة (من جملة إلى أربع جمل) مع اهتمام حقيقي بما يقوله.
- أنت ذكاء اصطناعي. لا تدّعِ أنك إنسان، وأجب بصدق إن سُئلت.
- شجّع علاقات المستخدم الحقيقية بأهله وأصدقائه، ولا تحاول إبعاده عنهم ولا إشعاره بالذنب إذا غاب.
- لا تكتب محتوى جنسيًا أو عنيفًا صريحًا، ولا تقدّم نصائح طبية أو قانونية أو مالية قاطعة.
- إذا ذكر المستخدم رغبة في إيذاء نفسه أو الموت، فاستجب بتعاطف وهدوء، وشجّعه على التواصل فورًا مع شخص يثق به أو خدمة الطوارئ أو خط مساعدة في بلده.
تفضيلات المستخدم للشخصية (للأسلوب فقط): ${u.persona || 'لا شيء محدد'}`;

async function chat(req, env, ctx, u) {
  const b = await req.json().catch(() => ({}));
  const text = String(b.message || '').trim().slice(0, 2000);
  if (!text) return J({ error: 'empty' }, 400);
  if (!env.ANTHROPIC_API_KEY) return J({ error: 'ai_not_configured' }, 503);
  if (env.REQUIRE_VERIFIED === 'true' && !u.email_verified) return J({ error: 'verify_required' }, 403);
  const premium = u.plan === 'premium';
  const used = (await first(env, "SELECT COUNT(*) c FROM messages WHERE user_id=? AND role='user' AND created>=date('now')", u.id)).c;
  const cap = Number(premium ? env.PREMIUM_DAILY_CAP || 300 : env.FREE_DAILY_LIMIT || 20);
  if (used >= cap) return J({ error: 'limit' }, premium ? 429 : 402);

  const hist = await all(env, 'SELECT role, content FROM (SELECT * FROM messages WHERE user_id=? ORDER BY id DESC LIMIT 20) ORDER BY id', u.id);
  while (hist.length && hist[0].role !== 'user') hist.shift();
  const up = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: premium ? env.ANTHROPIC_MODEL || 'claude-sonnet-5-5' : env.FREE_MODEL || env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      max_tokens: 600, stream: true, system: systemPrompt(u), messages: [...hist, { role: 'user', content: text }],
    }),
  });
  if (!up.ok) { console.error('anthropic error:', up.status, await up.text()); return J({ error: 'ai_error' }, 502); }

  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const send = (o) => w.write(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
  ctx.waitUntil((async () => {
    let full = '';
    try {
      const rd = up.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop();
        for (const l of lines) {
          if (!l.startsWith('data: ')) continue;
          let d; try { d = JSON.parse(l.slice(6)); } catch { continue; }
          if (d.type === 'content_block_delta' && d.delta?.type === 'text_delta') { full += d.delta.text; await send({ t: d.delta.text }); }
        }
      }
      if (full) {
        await env.DB.batch([
          env.DB.prepare('INSERT INTO messages(user_id, role, content) VALUES (?,?,?)').bind(u.id, 'user', text),
          env.DB.prepare('INSERT INTO messages(user_id, role, content) VALUES (?,?,?)').bind(u.id, 'assistant', full),
        ]);
        await send({ done: true });
      } else await send({ error: 'ai_error' });
    } catch (e) { console.error('chat error:', e.message); await send({ error: 'ai_error' }).catch(() => {}); }
    finally { await w.close().catch(() => {}); }
  })());
  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}

// ---------- billing (Lemon Squeezy) ----------
const ls = (env, url, opts = {}) => fetch(`https://api.lemonsqueezy.com/v1${url}`, {
  ...opts, headers: { Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json', Authorization: `Bearer ${env.LS_API_KEY}` },
});
async function webhook(req, env) {
  if (!env.LS_WEBHOOK_SECRET) return new Response('', { status: 501 });
  const raw = await req.text();
  const sig = req.headers.get('x-signature') || '';
  const ok = /^[0-9a-f]{64}$/.test(sig) &&
    await crypto.subtle.verify('HMAC', await hmacKey(env.LS_WEBHOOK_SECRET, ['verify']), fromHex(sig), enc.encode(raw));
  if (!ok) return new Response('', { status: 400 });
  let ev; try { ev = JSON.parse(raw); } catch { return new Response('', { status: 400 }); }
  await init(env);
  const name = ev.meta?.event_name, uid = Number(ev.meta?.custom_data?.user_id), status = ev.data?.attributes?.status;
  if (uid && name?.startsWith('subscription_')) {
    // "cancelled" keeps access until the paid period ends; Lemon Squeezy then sends "expired"
    const premium = ['active', 'on_trial', 'past_due', 'cancelled'].includes(status) && name !== 'subscription_expired';
    await run(env, 'UPDATE users SET plan=?, ls_sub=? WHERE id=?', premium ? 'premium' : 'free', String(ev.data.id), uid);
  }
  return new Response('', { status: 200 });
}

// ---------- router ----------
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), p = url.pathname, m = req.method, base = env.APP_URL || url.origin;
    try {
      if (p === '/healthz') return new Response('ok');
      if (m === 'GET' && ASSETS[p]) return new Response(ASSETS[p].body, { headers: { 'Content-Type': ASSETS[p].type, 'Cache-Control': 'no-cache', ...SEC } });
      if (!p.startsWith('/api/')) return new Response('Not found', { status: 404 });
      if (p === '/api/billing/webhook' && m === 'POST') return webhook(req, env);
      if (!env.JWT_SECRET || !env.DB) return J({ error: 'server_not_configured' }, 500);
      const origin = req.headers.get('Origin');
      if (m !== 'GET' && origin && origin !== url.origin) return J({ error: 'forbidden' }, 403);
      await init(env);
      const body = () => req.json().catch(() => ({}));

      if (p === '/api/register' && m === 'POST') {
        const b = await body();
        const email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
        if (!/^\S+@\S+\.\S+$/.test(email) || pw.length < 8 || pw.length > 200) return J({ error: 'invalid_input' }, 400);
        if (b.adult !== true) return J({ error: 'age_required' }, 400);
        if (await first(env, 'SELECT 1 x FROM users WHERE email=?', email)) return J({ error: 'exists' }, 409);
        const r = await run(env, 'INSERT INTO users(email, pass) VALUES (?,?)', email, await hashPw(pw));
        const id = r.meta.last_row_id;
        ctx.waitUntil(startVerify(env, base, { id, email }));
        return J(pub(await first(env, 'SELECT * FROM users WHERE id=?', id)), 200, { 'Set-Cookie': await sessionCookie(env, id) });
      }
      if (p === '/api/login' && m === 'POST') {
        const b = await body();
        const u = await first(env, 'SELECT * FROM users WHERE email=?', String(b.email || '').trim().toLowerCase());
        if (!u || !(await checkPw(String(b.password || ''), u.pass))) return J({ error: 'bad_credentials' }, 401);
        return J(pub(u), 200, { 'Set-Cookie': await sessionCookie(env, u.id) });
      }
      if (p === '/api/logout' && m === 'POST') return J({ ok: true }, 200, { 'Set-Cookie': CLEAR });
      if (p === '/api/verify' && m === 'GET') {
        const r = await run(env, 'UPDATE users SET email_verified=1, verify_token=NULL WHERE verify_token=?', await sha(url.searchParams.get('token') || ''));
        return Response.redirect(`${base}/?verified=${r.meta.changes ? 1 : 0}`, 302);
      }
      if (p === '/api/forgot' && m === 'POST') {
        const u = await first(env, 'SELECT * FROM users WHERE email=?', String((await body()).email || '').trim().toLowerCase());
        if (u) {
          const t = randToken();
          await run(env, "UPDATE users SET reset_token=?, reset_expires=datetime('now','+1 hour') WHERE id=?", await sha(t), u.id);
          ctx.waitUntil(sendMail(env, u.email, 'استعادة كلمة المرور', `لتعيين كلمة مرور جديدة (صالح لساعة):\n${base}/reset.html?token=${t}`));
        }
        return J({ ok: true });
      }
      if (p === '/api/reset' && m === 'POST') {
        const b = await body(), pw = String(b.password || '');
        if (pw.length < 8 || pw.length > 200) return J({ error: 'invalid_input' }, 400);
        const u = await first(env, "SELECT id FROM users WHERE reset_token=? AND reset_expires>datetime('now')", await sha(String(b.token || '')));
        if (!u) return J({ error: 'bad_token' }, 400);
        await run(env, 'UPDATE users SET pass=?, reset_token=NULL, reset_expires=NULL WHERE id=?', await hashPw(pw), u.id);
        return J({ ok: true });
      }

      // ---- everything below needs a logged-in user ----
      const tok = await verifyJwt(env, getCookie(req, 't'));
      const u = tok && await first(env, 'SELECT * FROM users WHERE id=?', tok.id);
      if (!u) return J({ error: 'unauthorized' }, 401);

      if (p === '/api/me' && m === 'GET') return J(pub(u));
      if (p === '/api/resend' && m === 'POST') { if (!u.email_verified) await startVerify(env, base, u); return J({ ok: true }); }
      if (p === '/api/history' && m === 'GET')
        return J(await all(env, 'SELECT role, content FROM (SELECT * FROM messages WHERE user_id=? ORDER BY id DESC LIMIT 100) ORDER BY id', u.id));
      if (p === '/api/history' && m === 'DELETE') { await run(env, 'DELETE FROM messages WHERE user_id=?', u.id); return J({ ok: true }); }
      if (p === '/api/companion' && m === 'PATCH') {
        const b = await body();
        await run(env, 'UPDATE users SET companion_name=?, persona=? WHERE id=?',
          String(b.companionName || '').trim().slice(0, 30) || 'رفيق', String(b.persona || '').trim().slice(0, 300), u.id);
        return J({ ok: true });
      }
      if (p === '/api/account' && m === 'DELETE') {
        await env.DB.batch([env.DB.prepare('DELETE FROM messages WHERE user_id=?').bind(u.id), env.DB.prepare('DELETE FROM users WHERE id=?').bind(u.id)]);
        return J({ ok: true }, 200, { 'Set-Cookie': CLEAR });
      }
      if (p === '/api/chat' && m === 'POST') return chat(req, env, ctx, u);

      if (p === '/api/billing/checkout' && m === 'POST') {
        const plan = (await body()).plan;
        const variant = plan === 'yearly' ? env.LS_VARIANT_YEARLY : env.LS_VARIANT_MONTHLY;
        if (!env.LS_API_KEY || !env.LS_STORE_ID || !variant) return J({ error: 'billing_not_configured' }, 501);
        const r = await ls(env, '/checkouts', { method: 'POST', body: JSON.stringify({ data: {
          type: 'checkouts',
          attributes: { checkout_data: { email: u.email, custom: { user_id: u.id } }, product_options: { redirect_url: `${base}/?paid=1` } },
          relationships: { store: { data: { type: 'stores', id: String(env.LS_STORE_ID) } }, variant: { data: { type: 'variants', id: String(variant) } } },
        } }) });
        const link = (await r.json().catch(() => ({})))?.data?.attributes?.url;
        return r.ok && link ? J({ url: link }) : J({ error: 'checkout_failed' }, 502);
      }
      if (p === '/api/billing/portal' && m === 'POST') {
        if (!env.LS_API_KEY || !u.ls_sub) return J({ error: 'no_customer' }, 400);
        const r = await ls(env, `/subscriptions/${encodeURIComponent(u.ls_sub)}`);
        const link = (await r.json().catch(() => ({})))?.data?.attributes?.urls?.customer_portal;
        return r.ok && link ? J({ url: link }) : J({ error: 'portal_failed' }, 502);
      }
      if (p === '/api/admin/stats' && m === 'GET') {
        if (!env.ADMIN_EMAIL || !u.email_verified || u.email !== env.ADMIN_EMAIL.toLowerCase()) return new Response('', { status: 403 });
        const c = async (q) => (await first(env, q)).c;
        const users = await c('SELECT COUNT(*) c FROM users'), premium = await c("SELECT COUNT(*) c FROM users WHERE plan='premium'");
        return J({
          users, premium, signups7d: await c("SELECT COUNT(*) c FROM users WHERE created>=datetime('now','-7 days')"),
          activeToday: await c("SELECT COUNT(DISTINCT user_id) c FROM messages WHERE created>=date('now')"),
          messagesToday: await c("SELECT COUNT(*) c FROM messages WHERE created>=date('now')"),
          conversionPct: Math.round((premium / Math.max(1, users)) * 1000) / 10,
        });
      }
      return J({ error: 'not_found' }, 404);
    } catch (e) {
      console.error('error:', e?.stack || e);
      return J({ error: 'server_error' }, 500);
    }
  },
};

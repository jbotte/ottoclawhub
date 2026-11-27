// OttoClawHub API — one Netlify Function mounted at /api/*
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { store, backendName } from './_lib/store.mjs';

const SESSION_DAYS = 30;
const COOKIE = 'och_session';

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionCookie(token, maxAgeSec) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

async function authed(request) {
  const token = parseCookies(request.headers.get('cookie') || '')[COOKIE];
  if (!token) return null;
  return store.getSession(token);
}

const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const isHttpUrl = (s) => {
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
};
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function parseBody(text) {
  try { return JSON.parse(text || '{}'); }
  catch { return null; }
}

function routeParts(path) {
  const parts = path.split('/').filter(Boolean);
  const i = parts.lastIndexOf('api'); // "/api/x" or "/.netlify/functions/api/x"
  return i === -1 ? [] : parts.slice(i + 1);
}

export default async function handler(request) {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const [seg, id, sub] = routeParts(url.pathname);
  const qs = Object.fromEntries(url.searchParams);
  const body = method === 'GET' ? {} : parseBody(await request.text());
  if (body === null) return json(400, { error: 'Invalid JSON body' });

  try {
    /* ---- meta ---- */
    if (!seg) return json(200, { ok: true, backend: backendName });

    /* ---- auth ---- */
    if (seg === 'auth') {
      if (id === 'signup' && method === 'POST') {
        const username = str(body.username, 32);
        const email = str(body.email, 254).toLowerCase();
        const password = typeof body.password === 'string' ? body.password : '';
        if (username.length < 2) return json(400, { error: 'Username must be at least 2 characters.' });
        if (!isEmail(email)) return json(400, { error: 'Enter a valid email address.' });
        if (password.length < 8) return json(400, { error: 'Password must be at least 8 characters.' });
        const hash = await bcrypt.hash(password, 10);
        const user = await store.createUser(username, email, hash);
        if (!user) return json(409, { error: 'That email already has an account. Try logging in.' });
        const token = randomBytes(32).toString('hex');
        await store.createSession(token, user.id, new Date(Date.now() + SESSION_DAYS * 864e5).toISOString());
        return json(201, { user: { id: user.id, username: user.username } }, { 'Set-Cookie': sessionCookie(token, SESSION_DAYS * 86400) });
      }
      if (id === 'login' && method === 'POST') {
        const email = str(body.email, 254).toLowerCase();
        const password = typeof body.password === 'string' ? body.password : '';
        const user = await store.findUserByEmail(email);
        if (!user || !(await bcrypt.compare(password, user.pass_hash))) {
          return json(401, { error: 'Email or password is wrong.' });
        }
        const token = randomBytes(32).toString('hex');
        await store.createSession(token, user.id, new Date(Date.now() + SESSION_DAYS * 864e5).toISOString());
        return json(200, { user: { id: user.id, username: user.username } }, { 'Set-Cookie': sessionCookie(token, SESSION_DAYS * 86400) });
      }
      if (id === 'logout' && method === 'POST') {
        const token = parseCookies(request.headers.get('cookie') || '')[COOKIE];
        if (token) await store.deleteSession(token);
        return json(200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
      }
      return json(404, { error: 'Not found' });
    }

    if (seg === 'me') {
      const me = await authed(event);
      return me ? json(200, { user: { id: me.userId, username: me.username } }) : json(401, { user: null });
    }

    /* ---- listings ---- */
    if (seg === 'listings') {
      if (!id && method === 'GET') {
        const listings = await store.listListings({ type: str(qs.type, 10), q: str(qs.q, 100), sort: str(qs.sort, 10), limit: qs.limit });
        return json(200, { listings });
      }
      if (!id && method === 'POST') {
        const me = await authed(event);
        if (!me) return json(401, { error: 'Log in to submit a listing.' });
        const type = body.type === 'skill' ? 'skill' : body.type === 'plugin' ? 'plugin' : null;
        const title = str(body.title, 120);
        const url = str(body.url, 500);
        const summary = str(body.summary, 2000);
        const install = str(body.install, 4000);
        const tags = str(body.tags, 200);
        if (!type) return json(400, { error: 'Pick either plugin or skill.' });
        if (title.length < 3) return json(400, { error: 'Title must be at least 3 characters.' });
        if (!isHttpUrl(url)) return json(400, { error: 'Link must be a valid http(s) URL.' });
        const listing = await store.createListing(me, { type, title, url, summary, install, tags });
        return json(201, { listing });
      }
      if (id && method === 'GET') {
        const listing = await store.getListing(id);
        return listing ? json(200, { listing }) : json(404, { error: 'Listing not found.' });
      }
      if (id && method === 'DELETE') {
        const me = await authed(event);
        if (!me) return json(401, { error: 'Log in first.' });
        const ok = await store.deleteListing(id, me.userId);
        return ok ? json(200, { ok: true }) : json(404, { error: 'Listing not found (or it is not yours).' });
      }
      if (id && sub === 'reviews' && method === 'POST') {
        const me = await authed(event);
        if (!me) return json(401, { error: 'Log in to leave a testing report.' });
        const verdict = ['works', 'broken', 'unsafe'].includes(body.verdict) ? body.verdict : null;
        const comment = str(body.comment, 2000);
        if (!verdict) return json(400, { error: 'Verdict must be works, broken, or unsafe.' });
        const listing = await store.getListing(id);
        if (!listing) return json(404, { error: 'Listing not found.' });
        await store.upsertReview(id, me.userId, verdict, comment);
        return json(200, { listing: await store.getListing(id) });
      }
      return json(404, { error: 'Not found' });
    }

    if (seg === 'mine' && method === 'GET') {
      const me = await authed(event);
      if (!me) return json(401, { error: 'Log in first.' });
      return json(200, { listings: await store.listMine(me.userId) });
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error('api error', err);
    return json(500, { error: 'Server error' });
  }
}

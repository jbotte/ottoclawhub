import React, { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

/* ---------- helpers ---------- */

function useRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash.replace(/^#/, '') || '/';
}

const nav = (path) => { window.location.hash = '#' + path; window.scrollTo(0, 0); };

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const VERDICTS = {
  works: { label: 'Works', icon: '✓', cls: 'ok' },
  broken: { label: 'Broken', icon: '⚠', cls: 'warn' },
  unsafe: { label: 'Unsafe', icon: '⛔', cls: 'danger' },
};

/* ---------- small components ---------- */

function Disclaimer({ compact }) {
  return (
    <div className={`disclaimer ${compact ? 'compact' : ''}`}>
      <strong>⚠ Community code — untested by OttoClawHub.</strong>{' '}
      Every plugin and skill here is submitted by users and tested only by other users.
      We do not review, audit, or endorse any code. <strong>Install and run at your own risk.</strong>
    </div>
  );
}

function TypeBadge({ type }) {
  return <span className={`badge ${type}`}>{type === 'plugin' ? '🔌 plugin' : '✨ skill'}</span>;
}

function Stats({ stats }) {
  if (!stats) return null;
  const total = stats.works + stats.broken + stats.unsafe;
  if (!total) return <span className="muted small">no testing reports yet</span>;
  return (
    <span className="stats">
      <span className="stat ok" title={`${stats.works} reported it works`}>✓ {stats.works}</span>
      {stats.broken > 0 && <span className="stat warn" title={`${stats.broken} reported it broken`}>⚠ {stats.broken}</span>}
      {stats.unsafe > 0 && <span className="stat danger" title={`${stats.unsafe} flagged unsafe`}>⛔ {stats.unsafe}</span>}
    </span>
  );
}

function ListingCard({ listing }) {
  return (
    <article className="card listing-card" onClick={() => nav(`/listing/${listing.id}`)}>
      <div className="card-top">
        <TypeBadge type={listing.type} />
        <span className="muted small">{timeAgo(listing.created_at)}</span>
      </div>
      <h3>{listing.title}</h3>
      {listing.summary && <p className="summary">{listing.summary}</p>}
      {listing.tags && (
        <div className="tags">{listing.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6).map((t) => <span key={t} className="tag">{t}</span>)}</div>
      )}
      <div className="card-bottom">
        <Stats stats={listing.stats} />
        <span className="muted small">by {listing.username}</span>
      </div>
    </article>
  );
}

function AuthModal({ onClose, onAuthed }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const res = mode === 'login' ? await api.login(email, password) : await api.signup(username, email, password);
      onAuthed(res.user);
      onClose();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{mode === 'login' ? 'Log in' : 'Create an account'}</h2>
        <p className="muted small">Accounts let you submit plugins & skills and post testing reports.</p>
        <form onSubmit={submit}>
          {mode === 'signup' && (
            <label>Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. clawfan42" required minLength={2} maxLength={32} />
            </label>
          )}
          <label>Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          {error && <div className="error">{error}</div>}
          <div className="row">
            <button type="submit" className="btn primary" disabled={busy}>{busy ? '…' : mode === 'login' ? 'Log in' : 'Sign up'}</button>
            <button type="button" className="btn" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
              {mode === 'login' ? 'Need an account?' : 'Have an account?'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- pages ---------- */

function Home({ user }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('new');

  const load = useCallback(() => {
    setLoading(true);
    api.listings({ type, q, sort }).then((r) => setListings(r.listings)).finally(() => setLoading(false));
  }, [type, q, sort]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  return (
    <div>
      <section className="hero">
        <h1>Plugins &amp; skills for <span className="accent">Otto</span>, from the community.</h1>
        <p className="muted">
          A directory of ClawHub plugins and skills made for Otto users. Anyone can submit;
          everyone tests and reports. For more about Otto, visit <a href="https://myotto.ai" target="_blank" rel="noreferrer">myotto.ai</a>.
        </p>
        <Disclaimer />
      </section>

      <div className="controls">
        <div className="row">
          <button className={`chip ${type === '' ? 'on' : ''}`} onClick={() => setType('')}>All</button>
          <button className={`chip ${type === 'plugin' ? 'on' : ''}`} onClick={() => setType('plugin')}>🔌 Plugins</button>
          <button className={`chip ${type === 'skill' ? 'on' : ''}`} onClick={() => setType('skill')}>✨ Skills</button>
        </div>
        <div className="row">
          <input className="search" placeholder="Search name, description, tags…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="new">Newest</option>
            <option value="top">Most “works” reports</option>
          </select>
          <button className="btn primary" onClick={() => nav('/submit')}>+ Submit</button>
        </div>
      </div>

      {loading ? <p className="muted">Loading…</p> : listings.length === 0 ? (
        <div className="empty">
          <p>Nothing here yet{q ? ' for that search' : ''}.</p>
          <button className="btn primary" onClick={() => nav('/submit')}>Be the first to submit</button>
        </div>
      ) : (
        <div className="grid">{listings.map((l) => <ListingCard key={l.id} listing={l} />)}</div>
      )}

      <section className="how">
        <h2>How it works</h2>
        <ol>
          <li><strong>Submit</strong> — make an account and post a link to a ClawHub plugin or skill built for Otto.</li>
          <li><strong>Test</strong> — other users install it and report back: <em>works</em>, <em>broken</em>, or <em>unsafe</em>.</li>
          <li><strong>Decide</strong> — you see the community's reports at a glance. OttoClawHub itself never vets the code, so treat every listing as untrusted and review the source yourself before installing.</li>
        </ol>
      </section>
    </div>
  );
}

function Submit({ user, requireAuth }) {
  const [form, setForm] = useState({ type: 'plugin', title: '', url: '', summary: '', install: '', tags: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetched, setFetched] = useState(false);
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); if (k === 'url') setFetched(false); };

  if (!user) { requireAuth(); return <p className="muted">Log in to submit a listing.</p>; }

  const isClawHub = /^https:\/\/(www\.)?clawhub\.ai\//i.test(form.url.trim());

  async function fetchDetails() {
    setError(''); setFetching(true); setFetched(false);
    try {
      const r = await api.lookup(form.url.trim());
      setForm((f) => ({
        ...f,
        type: r.type || f.type,
        title: r.title || f.title,
        summary: r.summary || f.summary,
        install: r.install || f.install,
      }));
      setFetched(true);
    } catch (err) { setError(err.message); }
    finally { setFetching(false); }
  }

  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const { listing } = await api.createListing(form);
      nav(`/listing/${listing.id}`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="narrow">
      <h1>Submit a plugin or skill</h1>
      <Disclaimer compact />
      <form onSubmit={submit} className="form">
        <label>Type
          <select value={form.type} onChange={set('type')}>
            <option value="plugin">🔌 Plugin</option>
            <option value="skill">✨ Skill</option>
          </select>
        </label>
        <label>Title *
          <input value={form.title} onChange={set('title')} required minLength={3} maxLength={120} placeholder="e.g. Google Calendar Sync" />
        </label>
        <label>Link *
          <input value={form.url} onChange={set('url')} required type="url" placeholder="https://clawhub.ai/…" />
        </label>
        <div className="row">
          <button type="button" className="btn" onClick={fetchDetails} disabled={!isClawHub || fetching}>
            {fetching ? 'Fetching…' : '⤓ Fetch details from ClawHub'}
          </button>
          {fetched && <span className="muted small">Auto-filled from ClawHub — edit anything before submitting.</span>}
          {!fetched && !isClawHub && form.url && <span className="muted small">Auto-fill works for https://clawhub.ai links.</span>}
        </div>
        <label>What does it do?
          <textarea value={form.summary} onChange={set('summary')} rows={4} maxLength={2000} placeholder="Short description, setup notes, anything testers should know." />
        </label>
        <label>Install command / instructions
          <textarea value={form.install} onChange={set('install')} rows={3} maxLength={4000} placeholder="clawhub install …" />
        </label>
        <label>Tags
          <input value={form.tags} onChange={set('tags')} maxLength={200} placeholder="calendar, productivity, gmail" />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit listing'}</button>
      </form>
    </div>
  );
}

function ListingPage({ id, user, requireAuth }) {
  const [listing, setListing] = useState(null);
  const [error, setError] = useState('');
  const [verdict, setVerdict] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setListing(null); setError('');
    api.listing(id).then((r) => setListing(r.listing)).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="narrow"><h1>Oops</h1><p className="error">{error}</p></div>;
  if (!listing) return <p className="muted">Loading…</p>;

  async function submitReview(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api.review(id, verdict, comment); setListing(r.listing); setVerdict(''); setComment(''); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm('Delete this listing? This cannot be undone.')) return;
    try { await api.deleteListing(id); nav('/'); } catch (err) { setError(err.message); }
  }

  async function copyInstall() {
    try { await navigator.clipboard.writeText(listing.install); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  return (
    <div className="narrow">
      <div className="card-top">
        <TypeBadge type={listing.type} />
        <span className="muted small">posted by {listing.username} · {timeAgo(listing.created_at)}</span>
      </div>
      <h1>{listing.title}</h1>
      <p><a href={listing.url} target="_blank" rel="noopener noreferrer nofollow">🔗 {listing.url}</a></p>
      <Disclaimer compact />
      {listing.summary && <p className="summary pre">{listing.summary}</p>}
      {listing.install && (
        <div className="install">
          <pre>{listing.install}</pre>
          <button className="btn" onClick={copyInstall}>{copied ? 'Copied!' : 'Copy'}</button>
        </div>
      )}
      {listing.tags && <div className="tags">{listing.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => <span key={t} className="tag">{t}</span>)}</div>}

      <h2>Community testing reports <Stats stats={listing.stats} /></h2>
      {user ? (
        <form onSubmit={submitReview} className="form review-form">
          <div className="row">
            {Object.entries(VERDICTS).map(([k, v]) => (
              <button type="button" key={k} className={`chip ${v.cls} ${verdict === k ? 'on' : ''}`} onClick={() => setVerdict(k)}>{v.icon} {v.label}</button>
            ))}
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={2000} placeholder="What happened when you tested it? (optional)" />
          <button className="btn primary" disabled={!verdict || busy}>{busy ? '…' : 'Post report'}</button>
        </form>
      ) : (
        <p className="muted"><button className="btn" onClick={requireAuth}>Log in</button> to post a testing report.</p>
      )}
      {error && <div className="error">{error}</div>}

      <div className="reviews">
        {(listing.reviews || []).length === 0 && <p className="muted">No reports yet — be the first to test it.</p>}
        {(listing.reviews || []).map((r) => {
          const v = VERDICTS[r.verdict];
          return (
            <div key={r.id} className="review">
              <span className={`stat ${v.cls}`}>{v.icon} {v.label}</span>
              <span className="muted small"> {r.username} · {timeAgo(r.updated_at)}</span>
              {r.comment && <p>{r.comment}</p>}
            </div>
          );
        })}
      </div>

      {user && listing.user_id === user.id && (
        <div className="owner-actions">
          <button className="btn danger" onClick={remove}>Delete listing</button>
        </div>
      )}
    </div>
  );
}

function Mine({ user, requireAuth }) {
  const [listings, setListings] = useState(null);
  if (!user) { requireAuth(); return <p className="muted">Log in to see your submissions.</p>; }
  useEffect(() => { api.mine().then((r) => setListings(r.listings)).catch(() => setListings([])); }, [user]);
  return (
    <div>
      <h1>Your submissions</h1>
      {!listings ? <p className="muted">Loading…</p> : listings.length === 0 ? (
        <div className="empty"><p>You haven't submitted anything yet.</p><button className="btn primary" onClick={() => nav('/submit')}>Submit one</button></div>
      ) : <div className="grid">{listings.map((l) => <ListingCard key={l.id} listing={l} />)}</div>}
    </div>
  );
}

/* ---------- shell ---------- */

export default function App() {
  const route = useRoute();
  const [user, setUser] = useState(undefined); // undefined = loading
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => { api.me().then((r) => setUser(r.user)); }, []);

  let page = <Home user={user} />;
  const listingMatch = route.match(/^\/listing\/(.+)$/);
  if (route === '/submit') page = <Submit user={user} requireAuth={() => setAuthOpen(true)} />;
  else if (listingMatch) page = <ListingPage id={listingMatch[1]} user={user} requireAuth={() => setAuthOpen(true)} />;
  else if (route === '/mine') page = <Mine user={user} requireAuth={() => setAuthOpen(true)} />;

  return (
    <div className="app">
      <header>
        <a className="logo" onClick={(e) => { e.preventDefault(); nav('/'); }}>🐾 Otto<span className="accent">Claw</span>Hub</a>
        <nav>
          <a onClick={(e) => { e.preventDefault(); nav('/submit'); }}>Submit</a>
          {user && <a onClick={(e) => { e.preventDefault(); nav('/mine'); }}>Mine</a>}
          {user ? (
            <span className="user-chip">
              {user.username}
              <button className="btn small" onClick={async () => { await api.logout(); setUser(null); nav('/'); }}>Log out</button>
            </span>
          ) : (
            <button className="btn primary small" onClick={() => setAuthOpen(true)}>Log in / Sign up</button>
          )}
        </nav>
      </header>
      <main>{page}</main>
      <footer>
        <p>
          OttoClawHub is a community directory for ClawHub plugins &amp; skills made for <a href="https://myotto.ai" target="_blank" rel="noreferrer">Otto</a>.
          Listings are unvetted community submissions — <strong>use at your own risk</strong>.
        </p>
      </footer>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onAuthed={setUser} />}
    </div>
  );
}

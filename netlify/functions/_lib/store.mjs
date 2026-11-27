// Data layer. Uses Neon Postgres when DATABASE_URL is set; otherwise falls
// back to an in-memory store (dev only — data is lost on restart).
import { randomUUID } from 'node:crypto';

const now = () => new Date().toISOString();
const useNeon = !!process.env.DATABASE_URL;

let sql = null;
if (useNeon) {
  const { neon } = await import('@neondatabase/serverless');
  sql = neon(process.env.DATABASE_URL);
}

/* ---------------- Neon (production) ---------------- */

const neonStore = {
  async createUser(username, email, passHash) {
    const rows = await sql.query(
      'INSERT INTO users (username, email, pass_hash) VALUES ($1,$2,$3) RETURNING id, username, email, created_at',
      [username, email, passHash]
    );
    return rows[0];
  },
  async findUserByEmail(email) {
    const rows = await sql.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] || null;
  },
  async findUserById(id) {
    const rows = await sql.query('SELECT id, username, email, created_at FROM users WHERE id = $1', [id]);
    return rows[0] || null;
  },
  async createSession(token, userId, expiresAt) {
    await sql.query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)', [token, userId, expiresAt]);
  },
  async getSession(token) {
    const rows = await sql.query(
      'SELECT s.user_id, s.expires_at, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1',
      [token]
    );
    const r = rows[0];
    if (!r) return null;
    if (new Date(r.expires_at) < new Date()) {
      await sql.query('DELETE FROM sessions WHERE token = $1', [token]);
      return null;
    }
    return { userId: r.user_id, username: r.username };
  },
  async deleteSession(token) {
    await sql.query('DELETE FROM sessions WHERE token = $1', [token]);
  },
  async createListing(u, l) {
    const rows = await sql.query(
      `INSERT INTO listings (user_id, type, title, url, summary, install, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [u.userId, l.type, l.title, l.url, l.summary, l.install, l.tags]
    );
    return this.getListing(rows[0].id);
  },
  async getListing(id) {
    const rows = await sql.query(
      `SELECT l.*, u.username FROM listings l JOIN users u ON u.id = l.user_id WHERE l.id = $1`,
      [id]
    );
    const listing = rows[0];
    if (!listing) return null;
    await attachStatsNeon([listing]);
    listing.reviews = await sql.query(
      `SELECT r.id, r.verdict, r.comment, r.created_at, r.updated_at, u.username
       FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.listing_id = $1 ORDER BY r.updated_at DESC`,
      [id]
    );
    return listing;
  },
  async listListings({ type, q, sort, limit = 100 }) {
    const where = [];
    const params = [];
    if (type === 'plugin' || type === 'skill') { params.push(type); where.push(`l.type = $${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      const p = `$${params.length}`;
      where.push(`(l.title ILIKE ${p} OR l.summary ILIKE ${p} OR l.tags ILIKE ${p})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderSql =
      sort === 'top' ? 'ORDER BY (SELECT COUNT(*) FROM reviews r WHERE r.listing_id = l.id AND r.verdict = $1) DESC, l.created_at DESC'
      : 'ORDER BY l.created_at DESC';
    const orderParams = sort === 'top' ? ['works'] : [];
    params.push(Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200));
    const rows = await sql.query(
      `SELECT l.*, u.username FROM listings l JOIN users u ON u.id = l.user_id
       ${whereSql} ${orderSql} LIMIT $${params.length}`,
      [...orderParams, ...params]
    );
    await attachStatsNeon(rows);
    return rows;
  },
  async deleteListing(id, userId) {
    const rows = await sql.query('DELETE FROM listings WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
    return rows.length > 0;
  },
  async upsertReview(listingId, userId, verdict, comment) {
    const rows = await sql.query(
      `INSERT INTO reviews (listing_id, user_id, verdict, comment)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (listing_id, user_id)
       DO UPDATE SET verdict = EXCLUDED.verdict, comment = EXCLUDED.comment, updated_at = now()
       RETURNING id`,
      [listingId, userId, verdict, comment]
    );
    return rows[0].id;
  },
  async listMine(userId) {
    const rows = await sql.query(
      'SELECT l.*, u.username FROM listings l JOIN users u ON u.id = l.user_id WHERE l.user_id = $1 ORDER BY l.created_at DESC',
      [userId]
    );
    await attachStatsNeon(rows);
    return rows;
  },
};

async function attachStatsNeon(listings) {
  if (!listings.length) return;
  const ids = listings.map((l) => l.id);
  const rows = await sql.query(
    `SELECT listing_id, verdict, COUNT(*)::int AS n FROM reviews WHERE listing_id = ANY($1::uuid[]) GROUP BY listing_id, verdict`,
    [ids]
  );
  const byId = new Map();
  for (const l of listings) byId.set(l.id, { works: 0, broken: 0, unsafe: 0 });
  for (const r of rows) {
    const s = byId.get(r.listing_id);
    if (s) s[r.verdict] = r.n;
  }
  for (const l of listings) l.stats = byId.get(l.id);
}

/* ---------------- Memory (dev fallback) ---------------- */

const mem = {
  users: new Map(),        // id -> user
  usersByEmail: new Map(), // email -> id
  sessions: new Map(),     // token -> {userId, expiresAt}
  listings: new Map(),     // id -> listing
  reviews: new Map(),      // listingId -> Map(userId -> review)
};
const userPublic = (u) => ({ id: u.id, username: u.username, email: u.email, created_at: u.created_at });

const memoryStore = {
  async createUser(username, email, passHash) {
    if (mem.usersByEmail.has(email)) return null;
    const u = { id: randomUUID(), username, email, pass_hash: passHash, created_at: now() };
    mem.users.set(u.id, u);
    mem.usersByEmail.set(email, u.id);
    return userPublic(u);
  },
  async findUserByEmail(email) {
    const id = mem.usersByEmail.get(email);
    return id ? mem.users.get(id) : null;
  },
  async findUserById(id) {
    const u = mem.users.get(id);
    return u ? userPublic(u) : null;
  },
  async createSession(token, userId, expiresAt) {
    mem.sessions.set(token, { userId, expiresAt });
  },
  async getSession(token) {
    const s = mem.sessions.get(token);
    if (!s) return null;
    if (new Date(s.expiresAt) < new Date()) { mem.sessions.delete(token); return null; }
    const u = mem.users.get(s.userId);
    return u ? { userId: u.id, username: u.username } : null;
  },
  async deleteSession(token) { mem.sessions.delete(token); },
  async createListing(u, l) {
    const listing = {
      id: randomUUID(), user_id: u.userId, type: l.type, title: l.title, url: l.url,
      summary: l.summary, install: l.install, tags: l.tags, created_at: now(),
      username: u.username,
    };
    mem.listings.set(listing.id, listing);
    mem.reviews.set(listing.id, new Map());
    return this.getListing(listing.id);
  },
  async getListing(id) {
    const l = mem.listings.get(id);
    if (!l) return null;
    return { ...l, stats: statsFor(id), reviews: [...(mem.reviews.get(id)?.values() || [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at)) };
  },
  async listListings({ type, q, sort, limit = 100 }) {
    let rows = [...mem.listings.values()];
    if (type === 'plugin' || type === 'skill') rows = rows.filter((l) => l.type === type);
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((l) => (l.title + ' ' + l.summary + ' ' + l.tags).toLowerCase().includes(needle));
    }
    rows = rows.map((l) => ({ ...l, stats: statsFor(l.id) }));
    if (sort === 'top') rows.sort((a, b) => b.stats.works - a.stats.works || b.created_at.localeCompare(a.created_at));
    else rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return rows.slice(0, Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200));
  },
  async deleteListing(id, userId) {
    const l = mem.listings.get(id);
    if (!l || l.user_id !== userId) return false;
    mem.listings.delete(id);
    mem.reviews.delete(id);
    return true;
  },
  async upsertReview(listingId, userId, verdict, comment) {
    if (!mem.reviews.has(listingId)) mem.reviews.set(listingId, new Map());
    const map = mem.reviews.get(listingId);
    const existing = map.get(userId);
    const u = mem.users.get(userId);
    const review = {
      id: existing?.id || randomUUID(),
      listing_id: listingId, verdict, comment,
      username: u?.username || 'member',
      created_at: existing?.created_at || now(),
      updated_at: now(),
    };
    map.set(userId, review);
    return review.id;
  },
  async listMine(userId) {
    return [...mem.listings.values()]
      .filter((l) => l.user_id === userId)
      .map((l) => ({ ...l, stats: statsFor(l.id) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
};

function statsFor(listingId) {
  const s = { works: 0, broken: 0, unsafe: 0 };
  for (const r of mem.reviews.get(listingId)?.values() || []) s[r.verdict]++;
  return s;
}

export const store = useNeon ? neonStore : memoryStore;
export const backendName = useNeon ? 'neon' : 'memory';

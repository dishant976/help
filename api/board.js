import { redis, limit, clean, send, TTL } from './_lib.js';
const KEY = 'kp:board:v1';

export default async function handler(req, res) {
  try {
    const cut = Date.now() - TTL * 1000;

    if (req.method === 'GET') {
      await redis('ZREMRANGEBYSCORE', KEY, '-inf', cut);
      const rows = await redis('ZRANGE', KEY, cut, '+inf', 'BYSCORE');
      // dh (the delete hash) is never sent to clients.
      const notices = rows.map(r => { const n = JSON.parse(r); delete n.dh; return n; });
      return send(res, 200, { notices });
    }

    if (req.method === 'POST') {
      if (!(await limit(req, 'post', 5, 600)))
        return send(res, 429, { error: 'Too many notices from this connection. Wait a few minutes.' });

      const b = req.body || {};
      const d = clean(b.d, 400);
      if (d.length < 8) return send(res, 400, { error: 'Description too short.' });
      if (!b.pub || !b.wrap || !b.dh) return send(res, 400, { error: 'Missing notice key.' });

      const note = {
        id: clean(b.id, 20), r: clean(b.r, 12),
        k: ['seek', 'found', 'safe'].includes(b.k) ? b.k : 'seek',
        at: Date.now(), n: clean(b.n, 40), d,
        z: clean(b.z, 60), w: clean(b.w, 40),
        t: Array.isArray(b.t) ? b.t.slice(0, 6).map(x => clean(x, 16)) : [],
        hot: b.hot ? 1 : 0,
        pub: clean(b.pub, 400),
        wrap: { s: clean(b.wrap.s, 64), i: clean(b.wrap.i, 32), k: clean(b.wrap.k, 600) },
        dh: clean(b.dh, 64)
      };
      await redis('ZADD', KEY, note.at, JSON.stringify(note));
      return send(res, 200, { ok: true, ref: note.r });
    }

    if (req.method === 'DELETE') {
      // Ownership is proven with sha256(counterfoil + '|delete'). The server
      // never sees the counterfoil, so it still cannot unwrap the reply key.
      const { id, proof } = req.body || {};
      const rows = await redis('ZRANGE', KEY, cut, '+inf', 'BYSCORE');
      for (const raw of rows) {
        const n = JSON.parse(raw);
        if (n.id === clean(id, 20) && n.dh && n.dh === clean(proof, 64)) {
          await redis('ZREM', KEY, raw);
          await redis('DEL', `kp:replies:${n.id}`);
          return send(res, 200, { ok: true });
        }
      }
      return send(res, 404, { error: 'Notice not found, or that code does not own it.' });
    }

    return send(res, 405, { error: 'Method not allowed.' });
  } catch (e) {
    return send(res, 500, { error: 'Board unavailable. Try again.' });
  }
}

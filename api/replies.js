import { redis, limit, clean, send, TTL } from './_lib.js';

// Only ever handles ciphertext. Replies are sealed in the sender's browser
// to the notice's public key; this server has no key that opens them.
export default async function handler(req, res) {
  try {
    const id = clean((req.query && req.query.id) || (req.body && req.body.id), 20);
    if (!id) return send(res, 400, { error: 'Missing notice id.' });
    const key = `kp:replies:${id}`;

    if (req.method === 'GET') {
      const rows = await redis('LRANGE', key, 0, 199);
      return send(res, 200, { replies: rows.map(r => JSON.parse(r)) });
    }

    if (req.method === 'POST') {
      if (!(await limit(req, 'reply', 20, 600)))
        return send(res, 429, { error: 'Too many replies sent. Wait a few minutes.' });
      const b = req.body || {};
      if (!b.e || !b.i || !b.c) return send(res, 400, { error: 'Malformed reply.' });
      await redis('RPUSH', key, JSON.stringify({
        e: clean(b.e, 400), i: clean(b.i, 32), c: clean(b.c, 2000), at: Date.now()
      }));
      await redis('EXPIRE', key, TTL);
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'Method not allowed.' });
  } catch (e) {
    return send(res, 500, { error: 'Replies unavailable. Try again.' });
  }
}

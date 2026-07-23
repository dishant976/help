// Upstash Redis over REST + privacy-preserving rate limiting.
import crypto from 'node:crypto';

// Vercel's Upstash integration injects KV_REST_API_*; a database created
// directly at upstash.com gives UPSTASH_REDIS_REST_*. Accept either.
const URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export async function redis(...cmd) {
  if (!URL || !TOKEN) throw new Error('Redis is not configured: no KV_REST_API_URL / KV_REST_API_TOKEN.');
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

/* We never store an IP. We store a counter under
   sha256(ip + secret + today), truncated. The salt rotates daily so
   counters cannot be linked across days, and the counter expires in 60s. */
function bucket(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  const secret = process.env.RATE_SALT || 'change-me';
  return crypto.createHash('sha256').update(ip + secret + day).digest('hex').slice(0, 16);
}

export async function limit(req, action, max, windowSec) {
  const key = `kp:rl:${action}:${bucket(req)}`;
  const n = await redis('INCR', key);
  if (n === 1) await redis('EXPIRE', key, windowSec);
  return n <= max;
}

export const clean = (s, max) =>
  String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);

export function send(res, code, body) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).send(JSON.stringify(body));
}

export const TTL = 72 * 60 * 60;

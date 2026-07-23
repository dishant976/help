// Visit /api/health after deploying. Tells you plainly what is wrong.
import { redis, send } from './_lib.js';

export default async function handler(req, res) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const out = {
    redisUrlPresent: !!url,
    redisTokenPresent: !!token,
    rateSaltSet: !!process.env.RATE_SALT,
    connection: 'not tested'
  };
  if (!url || !token) {
    out.problem = 'Database variables missing. Connect the Upstash store to this project, then redeploy.';
    return send(res, 200, out);
  }
  try {
    await redis('SET', 'kp:health', String(Date.now()), 'EX', 60);
    out.connection = (await redis('GET', 'kp:health')) ? 'ok' : 'wrote but could not read';
  } catch (e) {
    out.connection = 'failed';
    out.problem = e.message;
  }
  if (!out.rateSaltSet) out.note = 'RATE_SALT is not set. The board will work, but set it before you share the link.';
  return send(res, 200, out);
}

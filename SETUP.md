# Making the board actually store notices

Four files change. No new pages, no new features.

    index.html        (replace)
    api/_lib.js       (new)
    api/board.js      (new)
    api/replies.js    (new)
    package.json      (new - needed for "type": "module")

## 1. Create the database

Vercel dashboard -> your project -> Storage -> Create -> Upstash Redis (free tier).
Connect it to the project. Vercel injects the URL and token automatically.

If you create it at upstash.com instead, copy the REST credentials into
Settings -> Environment Variables yourself:

    UPSTASH_REDIS_REST_URL
    UPSTASH_REDIS_REST_TOKEN

## 2. Add one more environment variable

    RATE_SALT = <a long random string you generate>

Generate one with:  openssl rand -hex 32

This must be set. It is the salt for the rotating IP hash used for flood
control. Leaving it unset falls back to a known default and weakens that.

## 3. Push and redeploy

Commit the files, push. Vercel rebuilds. Environment variables only apply to
new deployments, so if you added them after the last deploy, hit Redeploy.

## 4. Check it works

Open the site in a normal window and in a private window. Post a notice in one.
It should appear in the other within 20 seconds. If it does not, open the
browser console and check /api/board for a 500 - that is almost always a
missing or mistyped Upstash variable.

## What changed in the data model

Each notice now carries `dh`, a SHA-256 of your counterfoil plus a marker.
It is what proves you own a notice when you delete it. The server stores the
hash, never the counterfoil, so it still cannot unwrap the key that reads
replies. `dh` is stripped before notices are sent to browsers.

Expiry is now handled by Redis rather than by the browser: notices are pruned
on read past 72 hours, and reply lists carry a 72 hour TTL.

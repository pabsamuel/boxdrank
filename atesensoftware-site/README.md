# atesensoftware.com

The website monday's marketplace review asks for: a website, a support email
on the same domain, `monday-app-association.json` proving the domain is ours,
an install button, and public privacy policy and terms pages.

`public/` is the whole site and is committed. Rebuild it after changing an
app's `PRIVACY_POLICY.md` or `TERMS_OF_SERVICE.md`, or `SITE`/`APPS` in
`build.mjs`:

    node atesensoftware-site/build.mjs

| URL | What |
|---|---|
| `/` | Home, with each app's install button |
| `/automation-watchdog/privacy/` | Privacy policy, generated from `monday-automation-watchdog/PRIVACY_POLICY.md` |
| `/automation-watchdog/terms/` | Terms, generated from `monday-automation-watchdog/TERMS_OF_SERVICE.md` |
| `/monday-app-association.json` | Every monday app's client id |

## Hosting

Netlify, importing this repository with **base directory**
`atesensoftware-site`; `netlify.toml` there sets the publish directory. Security
headers, including HSTS, are in `public/_headers`.

## DNS — at Cloudflare

The domain is registered at Namecheap, but its nameservers are Cloudflare's
(`bonnie` and `agustin.ns.cloudflare.com`), so records live in Cloudflare.
Set on 27 Sep 2026, values from Netlify's docs
(`manage/domains/configure-domains/configure-external-dns`), both **DNS only**
(not proxied), as Netlify must see the traffic to issue the certificate:

| Type | Host | Value |
|---|---|---|
| A | `@` | `75.2.60.5` |
| CNAME | `www` | `atesensoftware.netlify.app` |

Two older CNAMEs for `@` and `www` were removed. The MX, SPF, DKIM and DMARC
records that Cloudflare Email Routing needs were left alone.

Netlify site: `atesensoftware.netlify.app`, primary domain `atesensoftware.com`,
`www` redirecting to it.

## Email

`support@atesensoftware.com` → the owner's Gmail, by Cloudflare Email Routing
(destination verified; catch-all off). It used to forward to a Proton address.

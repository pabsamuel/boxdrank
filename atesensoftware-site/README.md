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

## DNS — at Namecheap, the domain's registrar

Values from Netlify's docs (`manage/domains/configure-domains/configure-external-dns`):

| Type | Host | Value |
|---|---|---|
| A | `@` | `75.2.60.5` |
| CNAME | `www` | the site's `*.netlify.app` name |

Only the parking-page records for `@` and `www` are replaced. Mail and
verification records (MX, TXT) are left alone.

`support@atesensoftware.com` is forwarded to the owner's Gmail with Namecheap's
email forwarding.

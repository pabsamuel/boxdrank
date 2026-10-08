# Setup with Claude in Chrome

The remaining steps need clicks in dashboards (Cloudflare, GitHub, Lemon Squeezy). These prompts
are written for Claude in Chrome; paste one at a time, on the tab where you are already logged in.
Each one ends with a checkpoint you can verify yourself.

## 1. Cloudflare token + GitHub secrets (needed for any deploy)

```
Go to https://dash.cloudflare.com/profile/api-tokens and create a token from the
"Edit Cloudflare Workers" template. Keep all defaults. Copy the token.
Then open https://dash.cloudflare.com and copy the Account ID from the Workers & Pages overview.
Now open https://github.com/pabsamuel/boxdrank/settings/secrets/actions and add two repository
secrets: CLOUDFLARE_API_TOKEN (the token) and CLOUDFLARE_ACCOUNT_ID (the account id).
The Workers Free plan is enough (the rooms are SQLite-backed Durable Objects); do not upgrade.
Tell me when both secrets show up in the list.
```

Checkpoint: the secrets page lists both names. Push any commit touching `perde/` on `main`, or run
the "Perde Deploy" workflow manually, and watch it go green.

## 2. Custom domain

```
In https://dash.cloudflare.com go to Workers & Pages → perde → Settings → Domains & Routes and
add the custom domain perde.app (or the domain I own in this account). Confirm it shows Active.
Then open https://github.com/pabsamuel/boxdrank/settings/variables/actions and set the repository
variable PERDE_URL to https://perde.app.
```

## 3. Lemon Squeezy store and Perde Plus (M3)

```
Open https://app.lemonsqueezy.com. Create a store named Perde if none exists. Create a product
"Perde Plus": one-time payment, price $9 (add regional pricing: Türkiye ₺249, EU €9, UK £8),
enable "Generate license keys" with an activation limit of 5. Publish it.
Copy the store id (Settings → Stores), the product id (from the product URL) and the checkout
URL of the variant (Share → checkout link).
Then open https://github.com/pabsamuel/boxdrank/settings/variables/actions and set repository
variables: ENTITLEMENTS_MODE=lemonsqueezy, LEMONSQUEEZY_STORE_ID, LEMONSQUEEZY_PRODUCT_ID,
PERDE_CHECKOUT_URL. Tell me the four values you set.
```

Checkpoint: after the next deploy `GET /api/health` reports `"mode":"lemonsqueezy"`, the landing
page's Plus button opens the checkout, and a test-mode key activates from the phone menu.

## 4. Move Perde to its own repository (optional)

```
Open https://github.com/new and create an empty repository named perde under pabsamuel
(no README, no .gitignore, private or public as you like). Tell me when it exists.
```

Then run `perde/scripts/extract-to-own-repo.sh` from a clone of boxdrank; it splits the `perde/`
history into the new repository and prints what to do with CI secrets.

# Consent and rights

Two separate questions, often confused:

1. **Whose voice is it?** — answered by consent. Enforced by the software.
2. **Whose game or film is it?** — answered by who owns the copy. Handled by
   how you run the business.

Get the first one right and you have a real company. Get it wrong and you have
the thing everyone is afraid of.

---

## Part 1 — Consent

### What the software requires, and why

Every voice used in a job must pass all of these. There is no flag to skip
them, and you should not add one.

| Check | What it prevents |
| --- | --- |
| A consent record naming a real person **with their own email** | Cloning someone you cannot contact, and cannot let withdraw |
| A **signed consent document** on disk | "They said yes on the phone" |
| An **order-specific spoken verification phrase** | Voice notes scraped from a chat, a stream, or an ex's phone |
| Not revoked, not expired, dated in the past | Consent that has run out being used anyway |
| Scope includes `voice_clone` | Someone who agreed to something narrower |
| Third-party voices need an email **different from the customer's** | The customer being the only route to withdrawal |
| Re-checked again at clone time, not just at intake | Consent withdrawn between checking and running |

### The verification phrase is the important one

Anyone can find thirty seconds of someone's voice. Almost nobody can produce a
recording of that person saying **their own name, today's date, and a specific
order ID** — unless they are actually there and actually agreeing.

```bash
python3 -m voxswap phrase ORD-123
```

> *"My name is Ada Lovelace. Today is 1 March 2026. I give VoxSwap permission to
> create a synthetic copy of my voice for order ORD-123. I understand I can
> withdraw this permission at any time."*

They record it, send it back, you save it where the command says. Under 3
seconds of audio and the job is refused.

**Actually listen to it**, at least for third-party voices. Does it sound like
the same person as the samples? Do they sound comfortable? A phrase read under
duress usually sounds like one. The software checks the file exists and is long
enough — it cannot check for a person being pressured. That part is you.

### Someone else's voice — partners, friends, family

This is a real and legitimate part of the product: "my girlfriend as the
companion character" is a lovely gift. It is also the most abusable path, so it
carries extra rules:

* The consent form and the phrase recording come **from that person to you
  directly**, not forwarded by the customer.
* Their own email address, which the software enforces.
* They can withdraw without going through the customer — that is the whole
  point of holding their address.
* If anything feels off — reluctance, a "surprise", pressure, a third party
  doing all the talking — stop. You will never regret turning down one order.

### Withdrawal has to actually work

```bash
python3 -m voxswap revoke ORD-123 C-1 --reason "asked by email 2026-04-02"
python3 -m voxswap purge  ORD-123 --consent-ref C-1
python3 -m voxswap purge  ORD-123 --consent-ref C-1 --samples   # also their recordings
```

That destroys the clone **at the provider**, every generated take, the delivery
folder and the ZIP, clears the provider-side ID from `order.json`, and appends
to `consent-audit.log`.

What you cannot do is recall a file already delivered. Say that plainly in the
consent form — it is in the template — rather than promising something you
cannot deliver.

### Retention

Pick a period now and write it in your form. A reasonable default:

* customer's own voice: delete samples and clone **90 days** after delivery
* third-party voice: same, and confirm deletion to that person by email
* consent forms and the audit log: keep — they are your evidence that you did
  this properly

### Things to refuse, every time

* Celebrities, streamers, politicians, professional voice actors — their voice
  is their livelihood, and no order is worth that lawsuit.
* Anyone who will not sign and record for themselves.
* "It's a surprise." A surprise cannot consent.
* Sexual content in someone's voice, ever, including the customer's own —
  unless you want to be in that business, which is a different business with
  different problems.
* Anything designed to make someone appear to say something they did not agree
  to: fake confessions, fake evidence, "prank" calls to their family.
* Training a general model on customer voices. If you ever want to do that, it
  needs its own explicit, separately-ticked consent — not a line in the terms.

---

## Part 2 — The game and the film

The voices are the part that can hurt a person. This part can only hurt your
company, and it is well-trodden ground: this is the same territory game mods and
fan dubs have lived in for twenty years.

### The rules that keep you on the safe side

1. **The customer supplies the audio.** They own the copy; they extract from
   their own installation. You never rip, crack, or distribute a game or a film,
   and you never hand a customer assets from someone else's copy.
2. **You deliver only what you made.** The package contains your generated
   audio, not repackaged original assets. Look at `manifest.json` — it
   references originals by checksum; it does not contain them.
3. **One customer, one copy, personal use.** A delivery is built for one
   person's own installation. It is not a product you list for sale to
   strangers.
4. **No resale, no public mod release**, unless the rights holder allows it.
   Some publishers explicitly welcome mods; that is a conversation to have with
   them, not an assumption to make.
5. **Never imply endorsement.** You are not affiliated with the studio, and the
   delivery should not look like an official localisation.

### Where it gets genuinely uncertain

Modifying a game you own for personal use is broadly accepted practice, but the
details differ by country and by EULA, and "broadly accepted" is not the same as
"guaranteed lawful". Two things are worth doing once, properly, when you start
charging money:

* **Read the EULA of any title you do repeatedly.** Some forbid modification
  outright. That is a business decision — take it knowingly.
* **Get an hour with a lawyer in your own country** before you scale past
  hobby volume. One hour now is cheaper than the alternative.

The software does not decide this for you, and this document is not legal
advice. What the software does is keep you clean on the part that matters most:
it will not clone a voice without that person's provable, revocable consent.

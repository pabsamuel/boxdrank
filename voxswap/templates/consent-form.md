# Voice cloning consent

**This form must be signed by the person whose voice is being cloned — not by
anyone else on their behalf.** If you are ordering a voice for a partner,
friend or family member, they sign this themselves and send it to us directly.

---

**Order:** `{ORDER_ID}`
**Production:** {TITLE}
**Voice owner:** {PERSON_NAME}
**Contact email:** {PERSON_EMAIL} *(your own address — not the person who placed the order)*
**Date:** {DATE}

---

## What I am agreeing to

I am giving {OPERATOR_NAME} permission to:

1. Make a synthetic copy ("clone") of my voice from the recordings I provide.
2. Use that clone to generate dialogue for the production named above.
3. Store my recordings and the clone for as long as needed to complete and
   support this order.

## What I am **not** agreeing to

Unless I tick the box, my voice will **not** be used for:

- [ ] any other production or order
- [ ] anything commercial, advertising, or public broadcast
- [ ] training a general voice model, or any model used for other people's orders

Without those ticks, my voice is used for this order only and nothing else.

## What I keep

- **I can withdraw at any time**, by emailing {OPERATOR_EMAIL} with the order ID.
  Within 7 days of my request: the clone is deleted at the provider, my
  recordings are deleted, and any generated audio is destroyed. Files already
  delivered to the customer cannot be recalled, and I understand that.
- **My voice will not be used to make me appear to say things I did not agree to.**
  In particular: nothing sexual, nothing illegal, no impersonation of me to
  another person, no political or advertising content.
- **I can ask what was generated** with my voice on this order, and receive the
  script.

## Verification

I understand that I also have to record a short spoken phrase confirming this
consent, which includes my name, today's date and the order ID. My voice will
not be cloned without it.

---

Signature: ______________________________   Date: ________________

Printed name: ___________________________

---

### For the operator

- File this signed form at `consent/{CONSENT_REF}-signed.pdf` in the order folder.
- File the spoken phrase at `consent/{CONSENT_REF}-phrase.wav`.
- Get the exact phrase with: `python3 -m voxswap phrase {ORDER_ID}`
- Never start a job on a promise that the form "is coming".

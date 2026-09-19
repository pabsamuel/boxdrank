# Delivery email template

Subject: Your VoxSwap order is ready — {TITLE} ({ORDER_ID})

Hi {CUSTOMER_NAME},

Your order is done. The ZIP is attached / here: {LINK}

**What is inside**

- `audio/` (or `dub/`) — the new voice files
- `INSTALL.md` — step-by-step instructions for {TITLE} specifically
- `manifest.json` — every file we replaced, with checksums so you can always restore
- `script.csv` — every line, as written and as spoken
- `qc.md` — our own quality report on this build

**Before you install:** back up the files listed in `manifest.json`. Nothing we
sent overwrites anything on its own.

**{LINES_DELIVERED} lines** were replaced for **{ROLES}**.
{QC_NOTE}

If any line sounds wrong, reply with the line ID from `script.csv` — I can
re-record single lines without rebuilding the whole thing, and that is free
within {REVISION_WINDOW}.

A reminder on what you agreed to: this is for your own copy of {TITLE}. Please
do not redistribute it, and the voices in it stay yours — anyone whose voice is
in this package can ask me to delete it at any time and I will.

{OPERATOR_NAME}

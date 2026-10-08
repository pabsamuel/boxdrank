// The one file to edit before sharing the site. Every page reads it.
//
// Anything left empty degrades gracefully rather than breaking: with no
// checkout links the price buttons send people to the free sample instead,
// with no email the "send it to us" step says to reply to whoever shared the
// link. Nothing here is secret — it is all shown to visitors.
window.SITE = {
  // Shown in the header, the page titles and the consent declaration the
  // customer signs. "VoxSwap" is taken twice over — a crypto exchange and an
  // AI vocal-swap tool for musicians — so the public name is separate from the
  // software's. Check the name is free where you sell before you print it.
  brand: "Başrol",

  // Where customers send their recording pack and their questions. Use an
  // address you read every day and that a third party can reach you on to
  // withdraw consent. Leave empty until you have one.
  contactEmail: "",

  // Payment links, one per package. Shopier works for an individual seller in
  // Turkey; Lemon Squeezy and Gumroad could not be confirmed to pay out to a
  // Turkish bank, and PayPal does not operate there. Empty = not selling yet.
  checkout: {
    short: "",
    lead: "",
    crew: ""
  },

  // Your prices, as they should appear. Starting points from what AI voice-mod
  // commissions charge (roughly $50–100 for a small pack, $1.50–5 a line) —
  // check them against your own time per order before you publish.
  prices: {
    tr: { short: "₺799", lead: "₺2.499", crew: "₺3.999" },
    en: { short: "$19",  lead: "$59",    crew: "$99" }
  },

  // How long a paid order takes, in words a customer reads.
  turnaround: { tr: "3–5 iş günü", en: "3–5 working days" },

  // True only while voices are converted on your own machine (`local_vc`).
  // It switches on the "your voice is never uploaded to an AI company" line;
  // turn it off the day you route orders through a hosted provider.
  localProcessing: true
};

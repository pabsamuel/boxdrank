# LinguaDuel ⚔️

A GeoGuessr-Duels-style language learning battle game in **a single HTML file**.
Open `index.html` in any browser — no build step, no server, no API keys.

## How it plays

Two players start with **5000 HP**. Each round both answer the same challenge;
the better/faster answer wins the round and the loser takes damage equal to the
score gap. The damage multiplier climbs every 4 rounds (1× → 1.5× → 2× …) so a
duel always ends. Opponents are simulated bots with personalities, speed, and
per-language strengths — or **your own ghost** on daily replays.

- **7 challenge types**: guess the language, translate, cross-translate
  (e.g. Turkish → German), polyglot sentences, phonetic transcription,
  TTS listening rounds, fill-the-blank grammar
- **8 languages**: Spanish, French, German, Japanese, Turkish, Portuguese,
  Italian, Korean — pick 1–3 or polyglot mode (all mixed)
- **🗓️ Daily Duel**: seeded from the date, so everyone worldwide gets the
  identical rounds; replay to race your ghost
- ELO rating, achievements, per-language/per-type accuracy, match timeline,
  shareable results

## The learning science

The game loop is built on four techniques with strong experimental evidence:

1. **Retrieval practice (the testing effect).** Every round forces active
   recall under a timer instead of passive review — repeatedly shown to beat
   re-reading for long-term retention (Roediger & Karpicke, 2006).
2. **Spaced repetition.** Every item you answer enters a Leitner system:
   correct answers promote it through boxes with expanding review intervals
   (1 → 3 → 7 → 14 → 30 days); a miss demotes it to "due now." Due items are
   woven back into your duels as 📚 REVIEW rounds. Spacing out reviews is one
   of the most replicated effects in learning research (Ebbinghaus, 1885;
   Cepeda et al., 2006).
3. **Interleaving.** Challenge types and languages are deliberately mixed
   rather than blocked, which improves discrimination and transfer
   (Rohrer & Taylor, 2007) — polyglot mode is interleaving turned up to 11.
4. **Immediate corrective feedback.** Every round ends with the correct
   answer plus a one-line explanation (the grammar rule, the cognate, the
   literal meaning), which is when feedback is most effective.

The stats screen shows the engine working: items **mastered / learning /
relearning / due now**.

## Files

- `index.html` — the whole game (React via CDN, content bank included)

# 0002 — Web Speech API on the phone, matching on the TV

**Status:** accepted

## Context

Lines must advance when spoken. Cloud speech-to-text (Deepgram, Google, Whisper) costs money per
minute and needs audio streaming; on-device models are heavy for phones in a browser.

## Decision

Use the browser's `webkitSpeechRecognition` (Chrome Android, Safari iOS 14.5+) with the culture's
language, continuous + interim results. The phone streams the transcript since the line started;
the TV runs the fuzzy matcher (`matcher.ts`) and decides. Firefox and denied-mic cases fall back
to an "I said it" button.

## Consequences

- Zero cost, no audio leaves the browser except to the vendor's own recogniser.
- Accuracy varies by device; the matcher is lenient by design (`kids` mode passes at 50 % of the
  words). Sung lines pass at a third.
- Recognisers stop after silence; the session restarts itself. Transcripts carry `lineIndex` so
  late frames never match the next line.
- If playtests show <90 % pass on clear speech, the next step is a Worker route to a cloud STT for
  Plus users, behind the same `speech` message.

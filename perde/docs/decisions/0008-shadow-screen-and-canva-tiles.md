# 0008 — A real shadow screen, and artwork fetched as tiles

## Context

Two playtests in a row said the same thing: the figures did not look like Karagöz tasvirs and the
picture did not feel like a shadow play. The painted artwork existed in the owner's Canva account,
but every Claude cloud environment blocks canva.com, including its export download host, so the
files could not be downloaded from a session, and the owner did not want to move files by hand.

## Decision

1. **The shadow-screen look is physical, not decorative.** The stage draws a dark room, a wooden
   frame with a red valance, and a cloth lit from behind by a lamp that sits low and flickers.
   Figures are composited with `multiply`, so they read as translucent leather taking the cloth's
   light; the one speaking is pressed flat (sharp, tight shadow), the others are held a little
   away (soft, wider shadow). Every figure hangs from a visible rod that runs off the bottom edge.
   Set pieces get the same treatment at lower opacity.
2. **Artwork comes through the Canva connector as 600 px page renders.** A page thumbnail is
   returned inline at up to 600 px on its longest side, at 1:1 when the page is 600 px. So the
   export sheet (Canva design `DAHWpy4YgoE`) holds one 600 × 600 page per window of each image;
   `scripts/art-tiles.mjs stitch` joins the renders and keys out the page white by flood fill from
   the border. It is a workaround for the network policy; when the environment can reach
   canva.com, `export-design` gives the same pixels in one file.
3. **Arms are layers, not holes.** A part may carry its own `image`. The body image has the coat
   painted in where the arm was (copied from the coat beside it), and the arm is its own image on
   top, so a raised arm leaves coat behind it rather than a hole. Heads and legs keep the cut-out
   scheme; their rotations are small.
4. **Everything is scaled to one stage height.** Vector rigs are 200 × 400, artwork 1000 × 1980,
   drawings whatever the camera gave; the stage scales each to the same height, so a painted
   Karagöz and a child's drawing stand eye to eye.

## Consequences

- `docs/ART.md` documents the tile pipeline; the export sheet stays in Canva for re-exports.
- The parchment street backdrop is exported too but not used on the shadow screen (a real perde
  has no painted scenery); it is kept for a future front-lit use.
- Facing follows velocity smoothed over 0.25 s and flips above 0.4 stage-widths/s, so joining
  and small corrections cannot spin a figure.

# 0007 — Raster rigs with polygon parts; artwork upgrades progressively

**Status:** accepted

## Context

The first vector figures looked nothing like painted Karagöz tasvirs, and families must be able to
play their own drawings. Both need image-based puppets that still articulate.

## Decision

A puppet part may be a `polygon` region of the puppet's `image` instead of a path. The renderer
clips the image per part (children cut out of parents, even-odd) and rotates the clip around
the pivot, so a drawing rigs like a paper cut-out. Vector rigs stay as the fallback and may
declare `art`; the stage preloads it and swaps once the file loads. Artwork is generated with
Canva (owner's account) and committed as static files.

## Consequences

- One renderer for pack art and family drawings; drawings are ~200 kB PNG data URLs that travel
  over the relay and live in the phone's localStorage.
- Missing art files never break a pack: the vector rig shows until the PNG lands.
- Polygons are authored by hand from the image; automatic joint detection is a roadmap item.

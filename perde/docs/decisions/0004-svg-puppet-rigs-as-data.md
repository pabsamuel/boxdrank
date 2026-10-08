# 0004 — Puppets are SVG part trees in code, not images

**Status:** accepted

## Context

Puppets could be PNG sprites, Lottie/Rive animations, or hand-authored SVG.

## Decision

A puppet is a list of parts (SVG path data + fill + pivot + driver + gain + parent). The renderer
builds nested `<g>` transforms and drives them from the pose axes. Shapes are written with tiny
helpers (`blob`, `poly`, `circle`) in a 200×400 box.

## Consequences

- Crisp at any TV resolution, tiny in bytes, translucent on the shadow screen for free.
- Articulation is data: a new driver (e.g. a jaw) is one part with a pivot.
- Authoring is code, so it is reviewable and diffable; artists can still trace real puppets into
  path data later without changing the renderer.
- We do not get hand-painted texture. If Plus wants it, add an optional `image` part type.

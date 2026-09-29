# Progress metrics

No deadlines; numbers instead. `pnpm metrics` computes everything below and writes
`docs/PROGRESS.md`. CI runs it in `--check` mode so the script never rots. Run it after any change
that moves a number and commit the result.

| metric                                       | how it is computed                                                        | why it matters                                |
| -------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| **Roadmap completion**                       | ticked / total checkboxes in `docs/ROADMAP.md`, overall and per milestone | the single "how far along are we" number      |
| **Current milestone**                        | first milestone with an unticked box                                      | what to work on next                          |
| **Content: packs / puppets / plays / lines** | counted from `@perde/content`                                             | the product is content                        |
| **Free vs Plus content**                     | plays and puppets by `premium` flag                                       | keeps the free tier a real show               |
| **Kid-friendly lines**                       | share of lines with ≤ 14 words                                            | speech recognition and readability            |
| **Average words per line**                   | mean over all plays                                                       | same                                          |
| **Unit tests / e2e tests**                   | `it(`/`test(` occurrences in `*.test.ts` and `e2e/*.spec.ts`              | coverage of pure logic and the real flow      |
| **Web bundle**                               | gzip size of the largest JS chunk in `apps/web/dist` (after `pnpm build`) | TV browsers are slow; keep it under 200 kB gz |
| **Open TODOs**                               | `TODO                                                                     | FIXME` in source                              | debt that is written down |
| **Decisions recorded**                       | files in `docs/decisions/`                                                | how many forks in the road we wrote down      |
| **Playtests**                                | entries in `docs/PLAYTESTS.md`                                            | contact with reality                          |

## Targets (not deadlines)

- Roadmap M2 done → the product "feels good in the hand".
- Kid-friendly lines: 100 %.
- Bundle: < 200 kB gzip.
- Playtests: at least one per milestone from M2 on, with latency and speech-accuracy numbers.
- Speech accuracy (from playtests): ≥ 90 % of clearly spoken lines pass in `kids` mode.

## Reading PROGRESS.md

The file has a header table with the numbers, then a per-milestone breakdown with progress bars,
then the next three unticked items. `/status` prints the same and suggests what to do next.

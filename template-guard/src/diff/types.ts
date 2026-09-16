/**
 * Severity vocabulary. These four words are used verbatim in the code, the
 * tests, and the UI. Do not introduce synonyms.
 */
export type Severity =
  /** In the template, absent from the copy. The 44-automations-became-39 case. */
  | 'missing'
  /**
   * Present in the copy but pointing at the wrong board — typically a connect
   * column still aimed at the template. The highest severity we have, because
   * it looks correct and quietly writes to someone else's board.
   */
  | 'miswired'
  /** Present in both, configured differently. Renames, type changes. */
  | 'altered'
  /** Width, view order. Never blocks anything. */
  | 'cosmetic';

export const SEVERITY_ORDER: Severity[] = ['miswired', 'missing', 'altered', 'cosmetic'];

export type SubjectType = 'board' | 'column' | 'group' | 'view' | 'automation' | 'tag';

export interface FindingSubject {
  type: SubjectType;
  /** ID on the copy where one exists, else on the template. */
  id: string | null;
  title: string;
}

/**
 * How sure we are that this finding is real.
 *
 * `likely` exists because cross-board column matching is a heuristic, not an
 * identity lookup — duplicated boards get fresh column IDs, so a renamed column
 * and a delete-plus-add are genuinely indistinguishable from the outside. We
 * say which one we think it is and admit that we are inferring. Presenting a
 * guess as a certainty is its own kind of silent failure.
 */
export type Confidence = 'certain' | 'likely';

export interface Finding {
  /** Stable within a diff run, for React keys and repair correlation. */
  id: string;
  severity: Severity;
  /** Machine-readable, e.g. `column.missing`, `column.miswired`. */
  kind: string;
  subject: FindingSubject;
  /** What is wrong. One sentence, no jargon. */
  what: string;
  /** Why the user should care. This is what turns a diff into a product. */
  whyItMatters: string;
  /** What a human would do about it. */
  howToFix: string;
  confidence: Confidence;
  /** Structured detail for the repair layer. Never rendered raw. */
  evidence: Record<string, unknown>;
}

/**
 * Whether automations were part of this comparison.
 *
 * This is tracked separately from `basedOnIncompleteData` on purpose. When the
 * preview flag is off — the default, and what most users will run — automations
 * are never read. If that raised the "incomplete data" alarm, *every single
 * diff the product ever shows* would carry a warning banner, and a warning
 * that is always on is a warning nobody reads. The app would have cried wolf
 * itself into the exact silence it exists to break.
 *
 * So the two are separate signals with separate UI treatment: a permanent,
 * matter-of-fact note that automations are outside monday's stable API, versus
 * a loud alarm that something we expected to read actually failed.
 */
export interface AutomationCoverage {
  checked: boolean;
  /** Present when `checked` is false. Shown to the user verbatim. */
  reason?: string;
}

export interface DiffResult {
  templateBoardId: string;
  copyBoardId: string;
  findings: Finding[];
  /**
   * True when a read we expected to succeed did not. The UI must say so
   * prominently: a short diff built on a short snapshot is worse than no diff,
   * because it reads as a clean bill of health.
   */
  basedOnIncompleteData: boolean;
  /** Human-readable reasons behind `basedOnIncompleteData`. */
  dataWarnings: string[];
  automationCoverage: AutomationCoverage;
  comparedAt: string;
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { miswired: 0, missing: 0, altered: 0, cosmetic: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const s = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (s !== 0) return s;
    if (a.confidence !== b.confidence) return a.confidence === 'certain' ? -1 : 1;
    return a.subject.title.localeCompare(b.subject.title);
  });
}

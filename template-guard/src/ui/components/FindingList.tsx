import { Flex, Text, Tooltip } from 'monday-ui-react-core';
import type { Finding, Severity } from '../../diff/types.js';

/**
 * Findings, grouped by severity.
 *
 * Presentation rules that are product decisions, not styling:
 *
 *  - Mis-wired comes first and is visually loudest, always. It is the finding
 *    a user would never have caught themselves.
 *  - Every finding shows *why it matters*, not just what differs. A diff that
 *    only lists differences makes the user do the triage; the whole point is
 *    to do the triage for them.
 *  - `likely` findings say they are inferred. Dressing a heuristic up as a
 *    certainty is how a tool loses the trust it needs to be worth opening.
 */

const SEVERITY_META: Record<Severity, { label: string; blurb: string; color: string }> = {
  miswired: {
    label: 'Pointing at the wrong board',
    blurb:
      'These look completely normal in monday and are the most damaging thing duplication does. Fix these first.',
    color: 'var(--negative-color, #d83a52)',
  },
  missing: {
    label: 'Missing entirely',
    blurb: 'Present on the template, absent here. Whatever depended on it is not running.',
    color: 'var(--warning-color, #fdab3d)',
  },
  altered: {
    label: 'Changed',
    blurb: 'Here, but configured differently from the template.',
    color: 'var(--primary-color, #0073ea)',
  },
  cosmetic: {
    label: 'Cosmetic',
    blurb: 'Visual only. Listed for completeness.',
    color: 'var(--ui-border-color, #c3c6d4)',
  },
};

const ORDER: Severity[] = ['miswired', 'missing', 'altered', 'cosmetic'];

export function FindingList({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return (
      <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.SMALL} style={{ padding: 24 }}>
        <Text type={Text.types.TEXT1} weight={Text.weights.BOLD}>
          Nothing is missing from this board.
        </Text>
        <Text type={Text.types.TEXT2} color={Text.colors.SECONDARY}>
          Every column, group and view on the template is present here, and its connect columns
          point where they should.
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.LARGE} align={Flex.align.STRETCH} style={{ padding: '8px 0' }}>
      {ORDER.map((severity) => {
        const group = findings.filter((f) => f.severity === severity);
        if (group.length === 0) return null;
        const meta = SEVERITY_META[severity];

        return (
          <section key={severity} aria-label={meta.label}>
            <Flex gap={Flex.gaps.SMALL} align={Flex.align.CENTER} style={{ marginBottom: 4 }}>
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: meta.color,
                  flexShrink: 0,
                }}
              />
              <Text type={Text.types.TEXT1} weight={Text.weights.BOLD}>
                {meta.label} ({group.length})
              </Text>
            </Flex>
            <Text type={Text.types.TEXT2} color={Text.colors.SECONDARY} style={{ marginLeft: 18, marginBottom: 8 }}>
              {meta.blurb}
            </Text>

            <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.SMALL} align={Flex.align.STRETCH} style={{ marginLeft: 18 }}>
              {group.map((f) => (
                <FindingCard key={f.id} finding={f} accent={meta.color} />
              ))}
            </Flex>
          </section>
        );
      })}
    </Flex>
  );
}

function FindingCard({ finding, accent }: { finding: Finding; accent: string }) {
  return (
    <article
      style={{
        borderLeft: `3px solid ${accent}`,
        background: 'var(--secondary-background-color, #f6f7fb)',
        borderRadius: 4,
        padding: '10px 12px',
      }}
    >
      <Flex gap={Flex.gaps.SMALL} align={Flex.align.CENTER} wrap>
        <Text type={Text.types.TEXT2} weight={Text.weights.MEDIUM}>
          {finding.what}
        </Text>
        {finding.confidence === 'likely' && (
          <Tooltip content="Duplicated boards get new column IDs, so Template Guard matches columns by name, type and position. It is confident enough to report this, but it is an inference — worth a glance.">
            <Text type={Text.types.TEXT3} color={Text.colors.SECONDARY} style={{ cursor: 'help' }}>
              (best guess)
            </Text>
          </Tooltip>
        )}
      </Flex>
      <Text type={Text.types.TEXT3} color={Text.colors.SECONDARY} style={{ marginTop: 4 }}>
        {finding.whyItMatters}
      </Text>
      <Text type={Text.types.TEXT3} style={{ marginTop: 6 }}>
        <strong>Fix:</strong> {finding.howToFix}
      </Text>
    </article>
  );
}

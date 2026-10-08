import { AttentionBox, Flex, Text } from 'monday-ui-react-core';
import type { DiffResult } from '../../diff/types.js';

/**
 * The "we are not hiding anything from you" surface.
 *
 * Two distinct notices with deliberately different volumes:
 *
 *  - `IncompleteDataNotice` is an alarm. Something we expected to read failed,
 *    so the comparison below may be *wrong*, not merely narrow. This must be
 *    impossible to miss, because a short diff reads as good news.
 *
 *  - `AutomationCoverageNotice` is a footnote. Automations are outside
 *    monday's stable API, so by default they are not checked — for everyone,
 *    on every comparison. Rendering that as an alarm would put a red banner on
 *    every screen the product ever shows, and a permanent alarm is wallpaper.
 *
 * Getting this distinction wrong in either direction breaks the promise: too
 * quiet and we hide a gap, too loud and nobody reads the one that counts.
 */

export function IncompleteDataNotice({ diff }: { diff: DiffResult }) {
  if (!diff.basedOnIncompleteData) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <AttentionBox
        type={AttentionBox.types.DANGER}
        title="This comparison is incomplete"
        text=""
      >
      <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.SMALL} align={Flex.align.STRETCH}>
        <Text type={Text.types.TEXT2}>
          Template Guard could not read everything it needed, so the list below may be missing
          problems. Treat it as partial, not as a clean bill of health.
        </Text>
        <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
          {diff.dataWarnings.map((w) => (
            <li key={w}>
              <Text type={Text.types.TEXT3}>{w}</Text>
            </li>
          ))}
        </ul>
        </Flex>
      </AttentionBox>
    </div>
  );
}

export function AutomationCoverageNotice({ diff }: { diff: DiffResult }) {
  if (diff.automationCoverage.checked) return null;

  return (
    <Text type={Text.types.TEXT3} color={Text.colors.SECONDARY} style={{ display: 'block', marginBottom: 12 }}>
      {diff.automationCoverage.reason} Columns, groups, views and board connections were
      compared in full.
    </Text>
  );
}

export function ErrorNotice({ message, upsell }: { message: string; upsell?: string }) {
  return (
    <AttentionBox type={AttentionBox.types.DANGER} title="Something went wrong" text={message}>
      {upsell ? <Text type={Text.types.TEXT3}>{upsell}</Text> : null}
    </AttentionBox>
  );
}

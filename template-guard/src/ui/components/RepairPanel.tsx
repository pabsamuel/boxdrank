import { useState } from 'react';
import { AttentionBox, Button, Checkbox, Flex, Text } from 'monday-ui-react-core';
import type { AutoRepair, RepairPlan } from '../../repair/plan.js';
import { api, ApiError } from '../api.js';

/**
 * The repair surface.
 *
 * Automatic fixes are opt-in per item and always preview exactly what they
 * will do before anything runs — these mutate a live client board, and a
 * "Fix everything" button that silently created eleven columns would be
 * indefensible for a tool whose pitch is caution.
 *
 * The manual checklist is not a consolation prize. For the highest-severity
 * finding we produce it is the *only* correct answer, so it gets equal
 * prominence and says plainly why each item is a human's job.
 */

export function RepairPanel({
  plan,
  canAutoRepair,
  upsell,
  onRepaired,
}: {
  plan: RepairPlan;
  canAutoRepair: boolean;
  upsell?: string;
  onRepaired: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(plan.auto.map((a) => a.findingId)));
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<{ applied: number; failed: number; details: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chosen: AutoRepair[] = plan.auto.filter((a) => selected.has(a.findingId));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    setOutcome(null);
    try {
      const result = await api.repair(chosen);
      setOutcome({
        applied: result.applied,
        failed: result.failed,
        details: result.outcomes.map((o) =>
          o.status === 'applied' ? `✓ ${o.detail}` : `✗ ${o.reason}`,
        ),
      });
      onRepaired();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The repair could not be started.');
    } finally {
      setRunning(false);
    }
  };

  if (plan.auto.length === 0 && plan.manual.length === 0) return null;

  return (
    <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.LARGE} align={Flex.align.STRETCH} style={{ marginTop: 24 }}>
      {plan.auto.length > 0 && (
        <section>
          <Text type={Text.types.TEXT1} weight={Text.weights.BOLD}>
            Template Guard can fix these ({plan.auto.length})
          </Text>
          <Text type={Text.types.TEXT3} color={Text.colors.SECONDARY} style={{ display: 'block', margin: '4px 0 8px' }}>
            Each line below is exactly what will change on this board. Nothing runs until you
            press the button.
          </Text>

          <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.SMALL} align={Flex.align.STRETCH}>
            {plan.auto.map((a) => (
              <Flex key={a.findingId} gap={Flex.gaps.SMALL} align={Flex.align.START}>
                <Checkbox
                  checked={selected.has(a.findingId)}
                  onChange={() => toggle(a.findingId)}
                  disabled={!canAutoRepair || running}
                  ariaLabel={a.preview}
                />
                <Flex direction={Flex.directions.COLUMN}>
                  <Text type={Text.types.TEXT2}>{a.preview}</Text>
                  <Text type={Text.types.TEXT3} color={Text.colors.SECONDARY}>
                    {a.verifyHint}
                  </Text>
                </Flex>
              </Flex>
            ))}
          </Flex>

          {canAutoRepair ? (
            <Button
              onClick={run}
              disabled={running || chosen.length === 0}
              loading={running}
              style={{ marginTop: 12 }}
            >
              {running ? 'Applying…' : `Apply ${chosen.length} fix${chosen.length === 1 ? '' : 'es'}`}
            </Button>
          ) : (
            <div style={{ marginTop: 12 }}>
              <AttentionBox
                type={AttentionBox.types.PRIMARY}
                title="One-click repair is a Pro feature"
                text={upsell ?? 'The manual checklist below works on every plan.'}
              />
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12 }}>
              <AttentionBox
                type={AttentionBox.types.DANGER}
                title="The repair did not run"
                text={error}
              />
            </div>
          )}

          {outcome && (
            <div style={{ marginTop: 12 }}>
              <AttentionBox
                type={outcome.failed > 0 ? AttentionBox.types.WARNING : AttentionBox.types.SUCCESS}
                title={
                  outcome.failed > 0
                    ? `${outcome.applied} applied, ${outcome.failed} failed`
                    : `${outcome.applied} fix${outcome.applied === 1 ? '' : 'es'} applied`
                }
                text=""
              >
                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                  {outcome.details.map((d) => (
                    <li key={d}>
                      <Text type={Text.types.TEXT3}>{d}</Text>
                    </li>
                  ))}
                </ul>
              </AttentionBox>
            </div>
          )}
        </section>
      )}

      {plan.manual.length > 0 && (
        <section>
          <Text type={Text.types.TEXT1} weight={Text.weights.BOLD}>
            You need to fix these by hand ({plan.manual.length})
          </Text>
          <Text type={Text.types.TEXT3} color={Text.colors.SECONDARY} style={{ display: 'block', margin: '4px 0 8px' }}>
            Each link opens the right board. Template Guard explains why it will not do these for
            you.
          </Text>

          <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.MEDIUM} align={Flex.align.STRETCH}>
            {plan.manual.map((m) => (
              <article
                key={m.findingId}
                style={{
                  background: 'var(--secondary-background-color, #f6f7fb)',
                  borderRadius: 4,
                  padding: '10px 12px',
                }}
              >
                <Text type={Text.types.TEXT2} weight={Text.weights.MEDIUM}>
                  {m.instruction}
                </Text>
                {m.navigationHint && (
                  <Text type={Text.types.TEXT3} color={Text.colors.SECONDARY} style={{ display: 'block', marginTop: 4 }}>
                    {m.navigationHint}
                  </Text>
                )}
                <Text type={Text.types.TEXT3} color={Text.colors.SECONDARY} style={{ display: 'block', marginTop: 4 }}>
                  Why not automatic: {m.whyManual}
                </Text>
                <a href={m.link} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6 }}>
                  <Text type={Text.types.TEXT3}>Open the board →</Text>
                </a>
              </article>
            ))}
          </Flex>
        </section>
      )}
    </Flex>
  );
}

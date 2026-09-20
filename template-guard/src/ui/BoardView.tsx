import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, Flex, Loader, Text, Toggle } from 'monday-ui-react-core';
import { api, ApiError, currentBoardId, type BoardSummary } from './api.js';
import { FindingList } from './components/FindingList.js';
import { AutomationCoverageNotice, ErrorNotice, IncompleteDataNotice } from './components/Notices.js';
import { PlanBanner } from './components/PlanBanner.js';
import { AlertSettings } from './components/AlertSettings.js';
import { RepairPanel } from './components/RepairPanel.js';
import { countBySeverity, type DiffResult } from '../diff/types.js';
import type { RepairPlan } from '../repair/plan.js';
import type { TemplateRecord } from '../snapshot/types.js';
import type { AccountPlan } from '../billing/tiers.js';
import { canUseOneClickRepair } from '../billing/tiers.js';

/**
 * The board view.
 *
 * One screen, one job: pick the template this board came from, see what
 * duplication dropped, fix it. Everything else stays out of the way.
 */
export function BoardView() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [plan, setPlan] = useState<AccountPlan | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [includeCosmetic, setIncludeCosmetic] = useState(false);

  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [repairPlan, setRepairPlan] = useState<RepairPlan | null>(null);

  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<{ message: string; upsell?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [boardList, templateList, id] = await Promise.all([
        api.listBoards(),
        api.listTemplates(),
        currentBoardId(),
      ]);
      setBoards(boardList.boards);
      setTemplates(templateList.templates);
      setPlan(templateList.plan);
      setBoardId(id);
      if (templateList.templates.length === 1) {
        setTemplateId(templateList.templates[0]?.templateBoardId ?? null);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { message: err.message, upsell: err.upsell }
          : { message: 'Template Guard could not start up.' },
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const compare = useCallback(async () => {
    if (!templateId || !boardId) return;
    setComparing(true);
    setError(null);
    setDiff(null);
    setRepairPlan(null);
    try {
      const result = await api.compare(templateId, boardId, includeCosmetic);
      setDiff(result.diff);
      setRepairPlan(result.repairPlan);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { message: err.message, upsell: err.upsell }
          : { message: 'The comparison could not be run.' },
      );
    } finally {
      setComparing(false);
    }
  }, [templateId, boardId, includeCosmetic]);

  const designate = useCallback(async () => {
    if (!boardId) return;
    setError(null);
    try {
      await api.designateTemplate(boardId);
      await load();
      setTemplateId(boardId);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { message: err.message, upsell: err.upsell }
          : { message: 'That board could not be saved as a template.' },
      );
    }
  }, [boardId, load]);

  const counts = useMemo(() => (diff ? countBySeverity(diff.findings) : null), [diff]);
  const boardName = boards.find((b) => b.id === boardId)?.name ?? 'this board';
  // v1 ships without one-click repair (ADR-025), so the panel shows the
  // manual checklist and says plainly that nothing writes to the board.
  const repairGate = plan
    ? canUseOneClickRepair(plan, false)
    : { allowed: false as const, reason: '', upsell: '' };

  if (loading) {
    return (
      <Flex justify={Flex.justify.CENTER} style={{ padding: 48 }}>
        <Loader size={Loader.sizes.MEDIUM} />
      </Flex>
    );
  }

  const isTemplateItself = templates.some((t) => t.templateBoardId === boardId);

  return (
    <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.MEDIUM} align={Flex.align.STRETCH} style={{ padding: 20, maxWidth: 780 }}>
      <header>
        <Text type={Text.types.TEXT1} weight={Text.weights.BOLD}>
          Template Guard
        </Text>
        <Text type={Text.types.TEXT3} color={Text.colors.SECONDARY} style={{ display: 'block' }}>
          monday drops configuration when you duplicate a board and does not tell you. This finds
          what it dropped on {boardName}.
        </Text>
      </header>

      <PlanBanner plan={plan} templateCount={templates.length} />

      <AlertSettings isPro={plan?.planId === 'pro'} />

      {error && <ErrorNotice message={error.message} upsell={error.upsell} />}

      {templates.length === 0 ? (
        <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.SMALL} align={Flex.align.START}>
          <Text type={Text.types.TEXT2}>
            Start by marking a board as a template. Template Guard records its columns, groups,
            views and board connections, then compares copies against it.
          </Text>
          <Button onClick={designate} disabled={!boardId}>
            Use {boardName} as a template
          </Button>
        </Flex>
      ) : (
        <>
          <Flex gap={Flex.gaps.SMALL} align={Flex.align.END} wrap>
            <div style={{ minWidth: 280 }}>
              <Text type={Text.types.TEXT3} color={Text.colors.SECONDARY}>
                Compare against
              </Text>
              <Dropdown
                placeholder="Pick the template this board came from"
                options={templates.map((t) => ({
                  value: t.templateBoardId,
                  label: t.label || t.snapshot.name,
                }))}
                value={
                  templateId
                    ? {
                        value: templateId,
                        label:
                          templates.find((t) => t.templateBoardId === templateId)?.label ?? templateId,
                      }
                    : null
                }
                onChange={(opt: { value: string } | null) => setTemplateId(opt?.value ?? null)}
              />
            </div>
            <Button onClick={compare} disabled={!templateId || !boardId || comparing} loading={comparing}>
              {comparing ? 'Comparing…' : 'Compare'}
            </Button>
          </Flex>

          {isTemplateItself && (
            <Text type={Text.types.TEXT3} color={Text.colors.SECONDARY}>
              This board is itself saved as a template. Comparing it against itself will not tell
              you much — open one of its copies instead.
            </Text>
          )}

          <Toggle
            isSelected={includeCosmetic}
            onChange={setIncludeCosmetic}
            ariaLabel="Include cosmetic differences"
            offOverrideText="Hiding cosmetic differences"
            onOverrideText="Showing cosmetic differences"
          />
        </>
      )}

      {comparing && (
        <Flex justify={Flex.justify.CENTER} style={{ padding: 24 }}>
          <Loader size={Loader.sizes.SMALL} />
        </Flex>
      )}

      {diff && counts && (
        <section>
          <IncompleteDataNotice diff={diff} />
          <AutomationCoverageNotice diff={diff} />

          <Text type={Text.types.TEXT1} weight={Text.weights.BOLD}>
            {diff.findings.length === 0
              ? 'No problems found'
              : counts.miswired > 0
                ? `${counts.miswired} connect column${counts.miswired === 1 ? '' : 's'} pointing at the wrong board`
                : `${diff.findings.length} difference${diff.findings.length === 1 ? '' : 's'} found`}
          </Text>

          <FindingList findings={diff.findings} />

          {repairPlan && (
            <RepairPanel
              plan={repairPlan}
              canAutoRepair={repairGate.allowed}
              upsell={'upsell' in repairGate ? repairGate.upsell : undefined}
              onRepaired={compare}
            />
          )}
        </section>
      )}
    </Flex>
  );
}

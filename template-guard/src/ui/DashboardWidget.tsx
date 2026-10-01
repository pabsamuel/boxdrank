import { useEffect, useState } from 'react';
import { Flex, Loader, Text } from 'monday-ui-react-core';
import { api, ApiError } from './api.js';
import { ErrorNotice } from './components/Notices.js';
import type { TemplateRecord } from '../snapshot/types.js';

/**
 * The item-less dashboard widget.
 *
 * Deliberately a status tile, not a second copy of the board view. Its job is
 * to answer one question at a glance — "is anything wrong across my client
 * boards?" — and to be honest when it does not know.
 *
 * It reads no items, which is what makes it item-less in monday's sense and
 * also why it stays fast on an account with hundreds of boards.
 */
export function DashboardWidget() {
  const [templates, setTemplates] = useState<TemplateRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { templates: list } = await api.listTemplates();
        setTemplates(list);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Template Guard could not load.');
      }
    })();
  }, []);

  if (error) return <ErrorNotice message={error} />;

  if (!templates) {
    return (
      <Flex justify={Flex.justify.CENTER} style={{ padding: 32 }}>
        <Loader size={Loader.sizes.SMALL} />
      </Flex>
    );
  }

  const linked = templates.reduce((n, t) => n + t.linkedBoardIds.length, 0);

  return (
    <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.SMALL} style={{ padding: 20 }}>
      <Text type={Text.types.TEXT1} weight={Text.weights.BOLD}>
        Template Guard
      </Text>

      {templates.length === 0 ? (
        <Text type={Text.types.TEXT2} color={Text.colors.SECONDARY}>
          No templates yet. Open Template Guard on a board to mark it as a template.
        </Text>
      ) : (
        <>
          <Text type={Text.types.TEXT2}>
            Watching {linked} board{linked === 1 ? '' : 's'} against {templates.length} template
            {templates.length === 1 ? '' : 's'}.
          </Text>
          <Text type={Text.types.TEXT3} color={Text.colors.SECONDARY}>
            Drift results appear here once a scheduled check has run. Until then this widget shows
            what is being watched, not a verdict — it will not tell you everything is fine before
            it has actually looked.
          </Text>
        </>
      )}
    </Flex>
  );
}

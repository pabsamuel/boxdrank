import { useEffect, useState } from 'react';
import { AttentionBox, Button, Checkbox, Flex, Text, TextField } from 'monday-ui-react-core';
import { api, ApiError } from '../api.js';
import type { NotificationSettings } from '../../server/storage.js';

/**
 * Where drift alerts go.
 *
 * Only shown on Pro, because scheduled monitoring is the Pro feature and a
 * settings panel for something you cannot use is an upsell pretending to be a
 * form.
 *
 * The one thing this panel must do well is say, plainly, when monitoring is on
 * and there is **nowhere to deliver**. That state is the product's own
 * signature failure wearing a disguise: everything looks configured, the sweep
 * runs, findings are recorded, and nobody is ever told. So the server computes
 * `deliverable` from what would actually happen rather than from what is
 * filled in, and this renders it as a warning rather than a hint.
 */
export function AlertSettings({ isPro }: { isPro: boolean }) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(null);
  const [deliverable, setDeliverable] = useState(true);
  const [webhookDraft, setWebhookDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isPro) return;
    void api
      .notificationSettings()
      .then((res) => {
        setSettings(res.settings);
        setEffectiveUserId(res.effectiveMondayUserId);
        setDeliverable(res.deliverable);
        setWebhookDraft(res.settings.webhookUrl ?? '');
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not load your alert settings.');
      });
  }, [isPro]);

  if (!isPro || !settings) return null;

  const save = async (patch: Partial<Omit<NotificationSettings, 'accountId'>>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.saveNotificationSettings(patch);
      setSettings(res.settings);
      // Re-read rather than guessing: whether an alert can actually be
      // delivered depends on the install record too, which this panel does
      // not hold.
      const fresh = await api.notificationSettings();
      setDeliverable(fresh.deliverable);
      setEffectiveUserId(fresh.effectiveMondayUserId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your alert settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.SMALL} align={Flex.align.STRETCH}>
      <Text type={Text.types.TEXT2} weight={Text.weights.BOLD}>
        Drift alerts
      </Text>

      <Checkbox
        label="Tell me when a linked board drifts from its template"
        checked={settings.enabled}
        disabled={saving}
        onChange={() => void save({ enabled: !settings.enabled })}
      />

      {settings.enabled && !deliverable && (
        // An alarm, not a hint. This is the product's own signature failure in
        // disguise: the sweep runs, findings are recorded, nobody is told.
        <AttentionBox
          type={AttentionBox.types.WARNING}
          title="Monitoring is on, but nothing can reach you"
          text="Template Guard would find problems on your linked boards and have nowhere to report them. Add a webhook below."
        />
      )}

      {settings.enabled && effectiveUserId && (
        <Text type={Text.types.TEXT3} color={Text.colors.SECONDARY}>
          Notifying monday user {effectiveUserId}
          {settings.mondayUserId ? '' : ' (whoever installed Template Guard)'}.
        </Text>
      )}

      <Flex gap={Flex.gaps.SMALL} align={Flex.align.END} wrap>
        <div style={{ minWidth: 320 }}>
          <TextField
            title="Webhook (optional)"
            placeholder="https://hooks.slack.com/services/…"
            value={webhookDraft}
            onChange={(value: string) => setWebhookDraft(value)}
          />
        </div>
        <Button
          size={Button.sizes.SMALL}
          kind={Button.kinds.SECONDARY}
          disabled={saving || webhookDraft === (settings.webhookUrl ?? '')}
          onClick={() => void save({ webhookUrl: webhookDraft.trim() === '' ? null : webhookDraft.trim() })}
        >
          Save
        </Button>
      </Flex>

      <Text type={Text.types.TEXT3} color={Text.colors.SECONDARY}>
        The alert carries board IDs and what changed. It never carries item data — there is none
        to carry.
      </Text>

      {error && <AttentionBox type={AttentionBox.types.DANGER} title="Alert settings" text={error} />}
    </Flex>
  );
}

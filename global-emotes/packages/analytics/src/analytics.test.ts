import { describe, expect, it } from 'vitest';
import { sanitizeBatch } from './index';

describe('sanitizeBatch — the privacy trust boundary', () => {
  it('accepts allowlisted events', () => {
    const result = sanitizeBatch({
      events: [
        { name: 'emote_selected', props: { emoteId: '00000000-0000-4000-8000-000000000301' } },
        { name: 'keyboard_opened', props: { platform: 'android' } },
      ],
    });
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toBe(0);
  });

  it('rejects unknown event names (no ad-hoc tracking can sneak in)', () => {
    const result = sanitizeBatch({
      events: [{ name: 'user_typed_message', props: {} }],
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toBe(1);
  });

  it('rejects events smuggling message content in unknown props (strict allowlist)', () => {
    const result = sanitizeBatch({
      events: [
        { name: 'emote_selected', props: { messageText: 'secret dm content' } },
        { name: 'emote_selected', props: { recipient: '+15551234' } },
        { name: 'emote_selected', props: { platform: 'ios' } },
      ],
    });
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toBe(2);
  });
});

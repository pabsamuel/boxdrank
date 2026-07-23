import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MockAdapter } from './mock';
import { TwitchAdapter } from './twitch';
import { DiscordAdapter } from './discord';
import { ProviderError, type FetchFn } from '../types';

const NOW = new Date('2026-07-23T12:00:00Z');

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('MockAdapter contract', () => {
  const adapter = new MockAdapter(
    {
      identities: { 'fan-1': { displayName: 'Fan One' } },
      memberships: { 'fan-1': { 'creator-1': 'tier1' } },
    },
    () => NOW,
  );

  it('round-trips the OAuth simulation', async () => {
    const url = await adapter.getAuthorizationUrl({
      redirectUri: 'http://localhost/cb',
      state: 'abc',
      role: 'fan',
    });
    expect(url).toContain('state=abc');
    const tokens = await adapter.exchangeAuthorizationCode({
      code: 'code:fan-1',
      redirectUri: 'http://localhost/cb',
    });
    expect(tokens.accessToken).toBe('mock:fan-1');
    const identity = await adapter.fetchIdentity({ accessToken: tokens.accessToken });
    expect(identity).toMatchObject({ externalAccountId: 'fan-1', displayName: 'Fan One' });
  });

  it('produces positive and negative entitlement evidence', async () => {
    const evidence = await adapter.syncFanEntitlements({
      context: { accessToken: 'mock:fan-1' },
      externalFanAccountId: 'fan-1',
      targets: [
        { externalCreatorAccountId: 'creator-1' },
        { externalCreatorAccountId: 'creator-unknown' },
      ],
    });
    expect(evidence).toHaveLength(2);
    expect(evidence[0]).toMatchObject({ active: true, tier: 'tier1' });
    expect(evidence[1]).toMatchObject({ active: false });
  });

  it('normalizes webhooks', async () => {
    const events = await adapter.handleWebhook({
      headers: {},
      rawBody: JSON.stringify({
        eventId: 'e1',
        fanId: 'fan-1',
        creatorId: 'creator-1',
        tier: 'tier2',
        active: true,
      }),
    });
    expect(events[0]?.entitlement).toMatchObject({ tier: 'tier2', active: true });
  });
});

describe('TwitchAdapter', () => {
  const options = {
    clientId: 'cid',
    clientSecret: 'secret',
    eventSubSecret: 'webhook-secret',
    now: () => NOW,
  };

  it('builds a correct authorization URL with role-based scopes', async () => {
    const adapter = new TwitchAdapter(options);
    const url = await adapter.getAuthorizationUrl({
      redirectUri: 'https://app.example/cb',
      state: 's1',
      role: 'fan',
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://id.twitch.tv/oauth2/authorize');
    expect(parsed.searchParams.get('scope')).toBe('user:read:subscriptions');
    expect(parsed.searchParams.get('client_id')).toBe('cid');
  });

  it('maps a Helix sub response to active tier evidence, and 404 to negative evidence', async () => {
    const fetchFn: FetchFn = async (input) => {
      const url = String(input);
      if (url.includes('broadcaster_id=streamer-yes')) {
        return jsonResponse({
          data: [{ broadcaster_id: 'streamer-yes', tier: '2000', is_gift: false }],
        });
      }
      return new Response('not found', { status: 404 });
    };
    const adapter = new TwitchAdapter({ ...options, fetchFn });
    const evidence = await adapter.syncFanEntitlements({
      context: { accessToken: 'tok' },
      externalFanAccountId: 'fan-9',
      targets: [
        { externalCreatorAccountId: 'streamer-yes' },
        { externalCreatorAccountId: 'streamer-no' },
      ],
    });
    expect(evidence[0]).toMatchObject({ active: true, tier: '2000', kind: 'tier' });
    expect(evidence[1]).toMatchObject({ active: false, tier: null });
  });

  it('verifies EventSub signatures and normalizes subscribe events', async () => {
    const adapter = new TwitchAdapter(options);
    const body = JSON.stringify({
      subscription: { type: 'channel.subscribe' },
      event: { broadcaster_user_id: 'b1', user_id: 'u1', tier: '1000' },
    });
    const timestamp = NOW.toISOString();
    const messageId = 'msg-1';
    const signature =
      'sha256=' +
      createHmac('sha256', 'webhook-secret')
        .update(messageId + timestamp + body)
        .digest('hex');

    const events = await adapter.handleWebhook({
      headers: {
        'twitch-eventsub-message-id': messageId,
        'twitch-eventsub-message-timestamp': timestamp,
        'twitch-eventsub-message-signature': signature,
        'twitch-eventsub-message-type': 'notification',
      },
      rawBody: body,
    });
    expect(events[0]?.entitlement).toMatchObject({
      providerId: 'twitch',
      externalFanAccountId: 'u1',
      externalCreatorAccountId: 'b1',
      tier: '1000',
      active: true,
    });
  });

  it('rejects tampered signatures and replayed messages', async () => {
    const adapter = new TwitchAdapter(options);
    const body = '{}';
    const timestamp = NOW.toISOString();
    await expect(
      adapter.handleWebhook({
        headers: {
          'twitch-eventsub-message-id': 'm',
          'twitch-eventsub-message-timestamp': timestamp,
          'twitch-eventsub-message-signature': 'sha256=deadbeef',
          'twitch-eventsub-message-type': 'notification',
        },
        rawBody: body,
      }),
    ).rejects.toMatchObject({ kind: 'webhook_invalid_signature' });

    const oldTimestamp = new Date(NOW.getTime() - 11 * 60_000).toISOString();
    const oldSig =
      'sha256=' +
      createHmac('sha256', 'webhook-secret')
        .update('m' + oldTimestamp + body)
        .digest('hex');
    await expect(
      adapter.handleWebhook({
        headers: {
          'twitch-eventsub-message-id': 'm',
          'twitch-eventsub-message-timestamp': oldTimestamp,
          'twitch-eventsub-message-signature': oldSig,
          'twitch-eventsub-message-type': 'notification',
        },
        rawBody: body,
      }),
    ).rejects.toMatchObject({ kind: 'webhook_replay' });
  });

  it('answers EventSub verification challenges', async () => {
    const adapter = new TwitchAdapter(options);
    const body = JSON.stringify({ challenge: 'pong' });
    const timestamp = NOW.toISOString();
    const sig =
      'sha256=' +
      createHmac('sha256', 'webhook-secret')
        .update('m2' + timestamp + body)
        .digest('hex');
    const events = await adapter.handleWebhook({
      headers: {
        'twitch-eventsub-message-id': 'm2',
        'twitch-eventsub-message-timestamp': timestamp,
        'twitch-eventsub-message-signature': sig,
        'twitch-eventsub-message-type': 'webhook_callback_verification',
      },
      rawBody: body,
    });
    expect(events[0]?.control).toEqual({ kind: 'challenge_response', body: 'pong' });
  });

  it('throws not_configured without credentials instead of pretending', async () => {
    const adapter = new TwitchAdapter({ clientId: '', clientSecret: '', eventSubSecret: '' });
    await expect(
      adapter.getAuthorizationUrl({ redirectUri: 'x', state: 's', role: 'fan' }),
    ).rejects.toMatchObject({ kind: 'not_configured' });
    expect(adapter.capabilities().status).toBe('credentials_required');
  });
});

describe('DiscordAdapter', () => {
  const options = { clientId: 'cid', clientSecret: 'cs', botToken: 'bot', now: () => NOW };

  it('emits one evidence item per role, inactive when not a member', async () => {
    const fetchFn: FetchFn = async (input) => {
      const url = String(input);
      if (url.includes('/guilds/guild-in/member')) {
        return jsonResponse({ roles: ['role-a', 'role-b'] });
      }
      return new Response('unknown guild', { status: 404 });
    };
    const adapter = new DiscordAdapter({ ...options, fetchFn });
    const evidence = await adapter.syncFanEntitlements({
      context: { accessToken: 'tok' },
      externalFanAccountId: 'fan-1',
      targets: [
        { externalCreatorAccountId: 'guild-in' },
        { externalCreatorAccountId: 'guild-out' },
      ],
    });
    expect(evidence).toHaveLength(3);
    expect(evidence.filter((e) => e.active)).toHaveLength(2);
    expect(evidence.map((e) => e.tier)).toEqual(['role-a', 'role-b', null]);
  });

  it('verifies guild ownership via owner flag or MANAGE_GUILD permission', async () => {
    const fetchFn: FetchFn = async () =>
      jsonResponse([
        { id: 'guild-1', name: 'My Server', owner: true, permissions: '0' },
        { id: 'guild-2', name: 'Managed', owner: false, permissions: String(0x20) },
        { id: 'guild-3', name: 'Just member', owner: false, permissions: '0' },
      ]);
    const adapter = new DiscordAdapter({ ...options, fetchFn });
    await expect(
      adapter.verifyCreatorOwnership({
        context: { accessToken: 't' },
        claimedExternalAccountId: 'guild-1',
      }),
    ).resolves.toMatchObject({ verified: true });
    await expect(
      adapter.verifyCreatorOwnership({
        context: { accessToken: 't' },
        claimedExternalAccountId: 'guild-2',
      }),
    ).resolves.toMatchObject({ verified: true });
    await expect(
      adapter.verifyCreatorOwnership({
        context: { accessToken: 't' },
        claimedExternalAccountId: 'guild-3',
      }),
    ).resolves.toMatchObject({ verified: false });
  });
});

describe('normalized errors', () => {
  it('classifies retryable kinds', () => {
    expect(new ProviderError('rate_limited', 'x').retryable).toBe(true);
    expect(new ProviderError('provider_unavailable', 'x').retryable).toBe(true);
    expect(new ProviderError('auth_expired', 'x').retryable).toBe(false);
  });
});

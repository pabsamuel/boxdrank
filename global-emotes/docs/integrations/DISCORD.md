# Discord integration

Status: **credentials_required** (adapter implemented + tested; polling-based at v1).

- Roles are the entitlement primitive. Fan OAuth scopes: `identify guilds guilds.members.read`; adapter reads `GET /users/@me/guilds/{guildId}/member` → one evidence item per role (404 = not a member = negative evidence).
- Creator verification: creator OAuth `guilds` list must show the claimed guild with `owner` or MANAGE_GUILD permission (implemented in `verifyCreatorOwnership`).
- Webhooks: none for role changes without a persistent gateway bot → `pollingRequired: true`; sync on login, on-demand refresh, and reconciliation sweeps. A bot with the Server Members intent (gateway events) is the post-v1 upgrade path.
- Setup: app + bot at discord.com/developers → `DISCORD_CLIENT_ID/SECRET/BOT_TOKEN` → callback `https://api.<domain>/v1/providers/discord/callback`.

Rule config: `{ guildId, roleIds: [] }` (empty roleIds = any role). Fallback: codes.

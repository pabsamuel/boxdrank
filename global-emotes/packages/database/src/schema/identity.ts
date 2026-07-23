import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date());

export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'deleted']);
export const adminRoleEnum = pgEnum('admin_role', [
  'support',
  'moderator',
  'finance',
  'integration_operator',
  'super_admin',
]);

export const users = pgTable(
  'users',
  {
    id: id(),
    primaryEmail: text('primary_email').notNull(),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    status: userStatusEnum('status').default('active').notNull(),
    /** Null for ordinary users. Admin auth additionally requires MFA (enforced in API). */
    adminRole: adminRoleEnum('admin_role'),
    fanPlan: text('fan_plan').default('fan_free').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('users_primary_email_idx').on(t.primaryEmail)],
);

export const userEmails = pgTable(
  'user_emails',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    isPrimary: boolean('is_primary').default(false).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('user_emails_email_idx').on(t.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the opaque session token; raw token only lives in the cookie. */
    tokenHash: text('token_hash').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_idx').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
  ],
);

/** Single-use magic-link / verification tokens. */
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: id(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    purpose: text('purpose', { enum: ['magic_link', 'email_verify', 'reauth'] }).notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('auth_tokens_hash_idx').on(t.tokenHash),
    index('auth_tokens_email_idx').on(t.email),
  ],
);

/** Passkey storage — schema ships now, flows are post-v1 (ROADMAP). */
export const passkeys = pgTable(
  'passkeys',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull(),
    publicKey: text('public_key').notNull(),
    counter: text('counter').default('0').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('passkeys_credential_idx').on(t.credentialId)],
);

export const oauthIdentities = pgTable(
  'oauth_identities',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    externalAccountId: text('external_account_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('oauth_identities_provider_account_idx').on(t.providerId, t.externalAccountId),
  ],
);

export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    plan: text('plan').default('creator_business').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('organizations_slug_idx').on(t.slug)],
);

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('org_members_unique_idx').on(t.organizationId, t.userId)],
);

export const creatorProfiles = pgTable(
  'creator_profiles',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').references(() => organizations.id),
    handle: text('handle').notNull(),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    avatarUrl: text('avatar_url'),
    brandColor: text('brand_color'),
    plan: text('plan', { enum: ['creator_free', 'creator_pro', 'creator_business'] })
      .default('creator_free')
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('creator_profiles_handle_idx').on(t.handle),
    index('creator_profiles_user_idx').on(t.userId),
  ],
);

export const creatorManagers = pgTable(
  'creator_managers',
  {
    id: id(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['manager', 'editor', 'analyst'] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('creator_managers_unique_idx').on(t.creatorId, t.userId)],
);

export const creatorVerifications = pgTable(
  'creator_verifications',
  {
    id: id(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    externalAccountId: text('external_account_id').notNull(),
    status: text('status', { enum: ['pending', 'verified', 'rejected', 'revoked'] })
      .default('pending')
      .notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().default({}).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('creator_verifications_unique_idx').on(t.creatorId, t.providerId, t.externalAccountId),
  ],
);

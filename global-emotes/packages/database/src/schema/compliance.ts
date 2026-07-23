import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity';

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const termsVersions = pgTable(
  'terms_versions',
  {
    id: id(),
    kind: text('kind', {
      enum: ['tos', 'privacy', 'creator_license', 'acceptable_use', 'community'],
    }).notNull(),
    version: text('version').notNull(),
    url: text('url').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('terms_versions_idx').on(t.kind, t.version)],
);

export const userConsents = pgTable(
  'user_consents',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    termsVersionId: uuid('terms_version_id')
      .notNull()
      .references(() => termsVersions.id),
    consentedAt: createdAt(),
  },
  (t) => [uniqueIndex('user_consents_unique_idx').on(t.userId, t.termsVersionId)],
);

/** Generic abuse reports (spam, impersonation, prohibited content). */
export const reports = pgTable(
  'reports',
  {
    id: id(),
    reporterUserId: uuid('reporter_user_id').references(() => users.id, { onDelete: 'set null' }),
    reporterEmail: text('reporter_email'),
    targetKind: text('target_kind', { enum: ['creator', 'pack', 'emote', 'user'] }).notNull(),
    targetId: uuid('target_id').notNull(),
    category: text('category', {
      enum: ['copyright', 'impersonation', 'prohibited_content', 'spam', 'other'],
    }).notNull(),
    reason: text('reason').notNull(),
    status: text('status', { enum: ['open', 'reviewing', 'resolved', 'dismissed'] })
      .default('open')
      .notNull(),
    createdAt: createdAt(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('reports_status_idx').on(t.status, t.createdAt)],
);

/** Formal DMCA-style copyright cases with claimant details and counter-notice. */
export const copyrightReports = pgTable('copyright_reports', {
  id: id(),
  reportId: uuid('report_id').references(() => reports.id),
  claimantName: text('claimant_name').notNull(),
  claimantEmail: text('claimant_email').notNull(),
  workDescription: text('work_description').notNull(),
  swornStatement: boolean('sworn_statement').default(false).notNull(),
  counterNotice: text('counter_notice'),
  status: text('status', {
    enum: ['received', 'takedown', 'counter_noticed', 'reinstated', 'closed'],
  })
    .default('received')
    .notNull(),
  createdAt: createdAt(),
});

export const moderationCases = pgTable(
  'moderation_cases',
  {
    id: id(),
    reportId: uuid('report_id').references(() => reports.id),
    targetKind: text('target_kind', { enum: ['creator', 'pack', 'emote', 'user'] }).notNull(),
    targetId: uuid('target_id').notNull(),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id),
    status: text('status', { enum: ['open', 'actioned', 'dismissed'] })
      .default('open')
      .notNull(),
    notes: text('notes'),
    createdAt: createdAt(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [index('moderation_cases_status_idx').on(t.status)],
);

/** Admin actions require a reason (spec §20); append-only. */
export const adminActions = pgTable(
  'admin_actions',
  {
    id: id(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    targetKind: text('target_kind').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason').notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('admin_actions_admin_idx').on(t.adminUserId, t.createdAt)],
);

/** Append-only system audit log. Never contains secrets or message content. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    actorType: text('actor_type', { enum: ['user', 'admin', 'system', 'provider'] }).notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    targetKind: text('target_kind'),
    targetId: text('target_id'),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('audit_logs_action_idx').on(t.action, t.createdAt)],
);

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  description: text('description').default('').notNull(),
  enabled: boolean('enabled').default(false).notNull(),
  /** Targeting rules: { environments, userIds, creatorIds, percentage }. */
  rules: jsonb('rules').$type<Record<string, unknown>>().default({}).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productUpdates: boolean('product_updates').default(true).notNull(),
    creatorAnnouncements: boolean('creator_announcements').default(true).notNull(),
    entitlementAlerts: boolean('entitlement_alerts').default(true).notNull(),
    billingAlerts: boolean('billing_alerts').default(true).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('notification_prefs_user_idx').on(t.userId)],
);

export const dataExportRequests = pgTable('data_export_requests', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'processing', 'ready', 'failed', 'expired'] })
    .default('pending')
    .notNull(),
  objectKey: text('object_key'),
  requestedAt: createdAt(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const accountDeletionRequests = pgTable('account_deletion_requests', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'canceled'] })
    .default('pending')
    .notNull(),
  /** Grace window before irreversible deletion. */
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  requestedAt: createdAt(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

import {
  pgTable,
  text,
  timestamp,
  boolean,
  smallint,
  date,
  uuid,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";

// ---------- better-auth tables (user extended with our fields) ----------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // username plugin
  username: text("username").unique(),
  displayUsername: text("display_username"),
  // admin plugin
  role: text("role").notNull().default("user"), // 'admin' | 'user'
  banned: boolean("banned").notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  // clinic extensions
  tier: text("tier").notNull().default("staff"), // 'staff' | 'intern' | 'student' — NEVER exposed to non-admin clients
  color: text("color").notNull().default("#0d9488"),
  pattern: text("pattern").notNull().default("solid"), // 'solid' | 'stripes' | 'dots' — extends color for visual uniqueness
  mustSetPassword: boolean("must_set_password").notNull().default(true),
  seenWelcome: boolean("seen_welcome").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  // last APP_VERSION whose "what's new" dialog this user dismissed
  // (null = fresh user — set silently on first visit, no dialog)
  lastSeenVersion: text("last_seen_version"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------- clinic domain ----------

export const clinicSettings = pgTable("clinic_settings", {
  id: text("id").primaryKey().default("main"),
  clinicName: text("clinic_name").notNull().default("המרפאה"),
  // 0=Sunday ... 5=Friday. Saturday never exists.
  activeDays: jsonb("active_days").$type<number[]>().notNull().default([0, 1, 2, 3, 4]),
  // clinic day bounds in minutes since midnight, 30-min aligned.
  // Engine bitmasks are 32-bit — the span may not exceed 31 slots (15.5 hours).
  dayStartMin: smallint("day_start_min").notNull().default(420),
  dayEndMin: smallint("day_end_min").notNull().default(1140),
  // public read-only share link token (null = sharing off)
  shareToken: text("share_token"),
  // master switch for all Claude/AI features (admin chat + free-text parsing)
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  // Anthropic API key pasted by the admin in-app, encrypted with BETTER_AUTH_SECRET
  // (the ANTHROPIC_API_KEY env var, when set, takes precedence)
  anthropicApiKey: text("anthropic_api_key"),
  // false until the first-run onboarding wizard finishes
  setupComplete: boolean("setup_complete").notNull().default(false),
});

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  isPool: boolean("is_pool").notNull().default(false),
  isGroupRoom: boolean("is_group_room").notNull().default(false),
  hasWindow: boolean("has_window").notNull().default(false),
  hasSink: boolean("has_sink").notNull().default(false),
  isLarge: boolean("is_large").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
});

export const roomAvailability = pgTable(
  "room_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    dayOfWeek: smallint("day_of_week").notNull(), // 0=Sun ... 5=Fri
    startMin: smallint("start_min").notNull(), // minutes since midnight, within clinic day bounds
    endMin: smallint("end_min").notNull(),
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
  },
  (t) => [index("room_availability_room_dow_idx").on(t.roomId, t.dayOfWeek)]
);

export const fixedAssignments = pgTable(
  "fixed_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    dayOfWeek: smallint("day_of_week").notNull(),
    startMin: smallint("start_min").notNull(),
    endMin: smallint("end_min").notNull(),
    effectiveFrom: date("effective_from").notNull().defaultNow(),
    effectiveTo: date("effective_to"),
    source: text("source").notNull().default("base"), // 'base' | 'request' | 'admin'
    kind: text("kind").notNull().default("regular"), // 'regular' | 'group'
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("fixed_assignments_dow_room_idx").on(t.dayOfWeek, t.roomId),
    index("fixed_assignments_user_idx").on(t.userId),
  ]
);

export const recurringReductions = pgTable(
  "recurring_reductions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dayOfWeek: smallint("day_of_week").notNull(),
    startMin: smallint("start_min").notNull(),
    endMin: smallint("end_min").notNull(),
    effectiveFrom: date("effective_from").notNull().defaultNow(),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("recurring_reductions_user_dow_idx").on(t.userId, t.dayOfWeek)]
);

export const oneTimeAbsences = pgTable(
  "one_time_absences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dateFrom: date("date_from").notNull(),
    dateTo: date("date_to").notNull(), // single day = same as dateFrom
    startMin: smallint("start_min"), // null = whole day
    endMin: smallint("end_min"),
    note: text("note"),
    createdBy: text("created_by").notNull().default("self"), // 'self' | 'admin'
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("one_time_absences_user_range_idx").on(t.userId, t.dateFrom, t.dateTo)]
);

export const oneTimeBookings = pgTable(
  "one_time_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    startMin: smallint("start_min").notNull(),
    endMin: smallint("end_min").notNull(),
    status: text("status").notNull().default("active"), // 'active' | 'cancelled'
    source: text("source").notNull().default("request"), // 'request' | 'swap' | 'admin'
    kind: text("kind").notNull().default("regular"), // 'regular' | 'group'
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("one_time_bookings_date_room_idx").on(t.date, t.roomId),
    index("one_time_bookings_user_date_idx").on(t.userId, t.date),
  ]
);

// admin overrides for holiday/closure days (auto-detected days are computed from
// the Hebrew calendar; a row here only records a deviation or a manual closure)
export const clinicClosures = pgTable("clinic_closures", {
  date: date("date").primaryKey(),
  // 'closed' = full day, 'early' = works until endMin, 'open' = override a detected holiday to a work day
  type: text("type").notNull(),
  endMin: smallint("end_min").notNull().default(780), // 13:00 for erev/early
  label: text("label"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// web push subscriptions (one per device)
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)]
);

// free-text labels placed by the admin in a room slot — a temp person without
// an account, a group name, etc. One-time (date) or recurring (dayOfWeek).
export const manualLabels = pgTable(
  "manual_labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    date: date("date"), // set → one-time
    dayOfWeek: smallint("day_of_week"), // set → recurring
    startMin: smallint("start_min").notNull(),
    endMin: smallint("end_min").notNull(),
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    color: text("color").notNull().default("#64748b"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("manual_labels_date_room_idx").on(t.date, t.roomId),
    index("manual_labels_dow_room_idx").on(t.dayOfWeek, t.roomId),
  ]
);

// waitlist: a user waiting for a room to free up in a specific date+window.
// When a matching room opens (someone marks an absence / cancels), they're notified.
export const roomRequests = pgTable(
  "room_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    startMin: smallint("start_min").notNull(),
    endMin: smallint("end_min").notNull(),
    kind: text("kind").notNull().default("regular"), // 'regular' | 'group'
    wantWindow: boolean("want_window").notNull().default(false),
    wantLarge: boolean("want_large").notNull().default(false),
    status: text("status").notNull().default("waiting"), // 'waiting'|'notified'|'cancelled'|'booked'
    notifiedAt: timestamp("notified_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("room_requests_date_status_idx").on(t.date, t.status),
    index("room_requests_user_status_idx").on(t.userId, t.status),
  ]
);

// a regular user's request to ADD a permanent (recurring) fixed slot — needs
// admin approval before it becomes a real fixed_assignment.
export const assignmentRequests = pgTable(
  "assignment_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    dayOfWeek: smallint("day_of_week").notNull(),
    startMin: smallint("start_min").notNull(),
    endMin: smallint("end_min").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    kind: text("kind").notNull().default("regular"),
    status: text("status").notNull().default("pending"), // 'pending'|'approved'|'declined'
    createdAt: timestamp("created_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [index("assignment_requests_status_idx").on(t.status)]
);

export const swapRequests = pgTable(
  "swap_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetUserId: text("target_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    startMin: smallint("start_min").notNull(),
    endMin: smallint("end_min").notNull(),
    // the room the requester wants (target currently holds it)
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    // room offered to the target in return (e.g. requester's own room), optional
    altRoomId: uuid("alt_room_id").references(() => rooms.id, { onDelete: "set null" }),
    status: text("status").notNull().default("pending"), // 'pending'|'accepted'|'declined'|'cancelled'|'expired'
    message: text("message"),
    kind: text("kind").notNull().default("regular"), // 'regular' | 'group' — what the requester will run there
    createdAt: timestamp("created_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [index("swap_requests_target_status_idx").on(t.targetUserId, t.status)]
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // 'swap_request'|'swap_accepted'|'swap_declined'|'booking_confirmed'|'admin_change'|'vacation_added'
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("notifications_user_read_idx").on(t.userId, t.isRead, t.createdAt)]
);

// convenient TS types
export type User = typeof user.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type RoomAvailability = typeof roomAvailability.$inferSelect;
export type FixedAssignment = typeof fixedAssignments.$inferSelect;
export type RecurringReduction = typeof recurringReductions.$inferSelect;
export type OneTimeAbsence = typeof oneTimeAbsences.$inferSelect;
export type OneTimeBooking = typeof oneTimeBookings.$inferSelect;
export type SwapRequest = typeof swapRequests.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ManualLabel = typeof manualLabels.$inferSelect;
export type ClinicClosure = typeof clinicClosures.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type RoomRequest = typeof roomRequests.$inferSelect;
export type AssignmentRequest = typeof assignmentRequests.$inferSelect;

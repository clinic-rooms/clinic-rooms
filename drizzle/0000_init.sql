CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"room_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_min" smallint NOT NULL,
	"end_min" smallint NOT NULL,
	"effective_from" date NOT NULL,
	"kind" text DEFAULT 'regular' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "clinic_closures" (
	"date" date PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"end_min" smallint DEFAULT 780 NOT NULL,
	"label" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinic_settings" (
	"id" text PRIMARY KEY DEFAULT 'main' NOT NULL,
	"clinic_name" text DEFAULT 'המרפאה' NOT NULL,
	"active_days" jsonb DEFAULT '[0,1,2,3,4]'::jsonb NOT NULL,
	"day_start_min" smallint DEFAULT 420 NOT NULL,
	"day_end_min" smallint DEFAULT 1140 NOT NULL,
	"share_token" text,
	"ai_enabled" boolean DEFAULT true NOT NULL,
	"anthropic_api_key" text,
	"setup_complete" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixed_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"room_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_min" smallint NOT NULL,
	"end_min" smallint NOT NULL,
	"effective_from" date DEFAULT now() NOT NULL,
	"effective_to" date,
	"source" text DEFAULT 'base' NOT NULL,
	"kind" text DEFAULT 'regular' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"text" text NOT NULL,
	"date" date,
	"day_of_week" smallint,
	"start_min" smallint NOT NULL,
	"end_min" smallint NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"color" text DEFAULT '#64748b' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "one_time_absences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"start_min" smallint,
	"end_min" smallint,
	"note" text,
	"created_by" text DEFAULT 'self' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "one_time_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"room_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_min" smallint NOT NULL,
	"end_min" smallint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'request' NOT NULL,
	"kind" text DEFAULT 'regular' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "recurring_reductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_min" smallint NOT NULL,
	"end_min" smallint NOT NULL,
	"effective_from" date DEFAULT now() NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_min" smallint NOT NULL,
	"end_min" smallint NOT NULL,
	"effective_from" date,
	"effective_to" date
);
--> statement-breakpoint
CREATE TABLE "room_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"start_min" smallint NOT NULL,
	"end_min" smallint NOT NULL,
	"kind" text DEFAULT 'regular' NOT NULL,
	"want_window" boolean DEFAULT false NOT NULL,
	"want_large" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"notified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_pool" boolean DEFAULT false NOT NULL,
	"is_group_room" boolean DEFAULT false NOT NULL,
	"has_window" boolean DEFAULT false NOT NULL,
	"has_sink" boolean DEFAULT false NOT NULL,
	"is_large" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "swap_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"date" date NOT NULL,
	"start_min" smallint NOT NULL,
	"end_min" smallint NOT NULL,
	"room_id" uuid NOT NULL,
	"alt_room_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"message" text,
	"kind" text DEFAULT 'regular' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"username" text,
	"display_username" text,
	"role" text DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp,
	"tier" text DEFAULT 'staff' NOT NULL,
	"color" text DEFAULT '#0d9488' NOT NULL,
	"pattern" text DEFAULT 'solid' NOT NULL,
	"must_set_password" boolean DEFAULT true NOT NULL,
	"seen_welcome" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_requests" ADD CONSTRAINT "assignment_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_requests" ADD CONSTRAINT "assignment_requests_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assignments" ADD CONSTRAINT "fixed_assignments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assignments" ADD CONSTRAINT "fixed_assignments_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_labels" ADD CONSTRAINT "manual_labels_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_time_absences" ADD CONSTRAINT "one_time_absences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_time_bookings" ADD CONSTRAINT "one_time_bookings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_time_bookings" ADD CONSTRAINT "one_time_bookings_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_reductions" ADD CONSTRAINT "recurring_reductions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_availability" ADD CONSTRAINT "room_availability_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_requests" ADD CONSTRAINT "room_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_alt_room_id_rooms_id_fk" FOREIGN KEY ("alt_room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_requests_status_idx" ON "assignment_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fixed_assignments_dow_room_idx" ON "fixed_assignments" USING btree ("day_of_week","room_id");--> statement-breakpoint
CREATE INDEX "fixed_assignments_user_idx" ON "fixed_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "manual_labels_date_room_idx" ON "manual_labels" USING btree ("date","room_id");--> statement-breakpoint
CREATE INDEX "manual_labels_dow_room_idx" ON "manual_labels" USING btree ("day_of_week","room_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX "one_time_absences_user_range_idx" ON "one_time_absences" USING btree ("user_id","date_from","date_to");--> statement-breakpoint
CREATE INDEX "one_time_bookings_date_room_idx" ON "one_time_bookings" USING btree ("date","room_id");--> statement-breakpoint
CREATE INDEX "one_time_bookings_user_date_idx" ON "one_time_bookings" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recurring_reductions_user_dow_idx" ON "recurring_reductions" USING btree ("user_id","day_of_week");--> statement-breakpoint
CREATE INDEX "room_availability_room_dow_idx" ON "room_availability" USING btree ("room_id","day_of_week");--> statement-breakpoint
CREATE INDEX "room_requests_date_status_idx" ON "room_requests" USING btree ("date","status");--> statement-breakpoint
CREATE INDEX "room_requests_user_status_idx" ON "room_requests" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "swap_requests_target_status_idx" ON "swap_requests" USING btree ("target_user_id","status");
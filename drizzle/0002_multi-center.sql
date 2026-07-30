CREATE TABLE "centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinic_settings" ADD COLUMN "multi_center" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "center_id" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "primary_center_id" uuid;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE set null ON UPDATE no action;
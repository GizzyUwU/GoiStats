CREATE TABLE "lb_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_key" text NOT NULL,
	"reviewer" text NOT NULL,
	"rank" integer NOT NULL,
	"devlogs_last_three_days" integer NOT NULL,
	"locked_in_status" boolean NOT NULL,
	"locked_in_so_far_this_week" integer NOT NULL,
	"projects_reviewed_today" integer NOT NULL,
	"projects_reviewed_last_three_days" integer NOT NULL,
	"stardust_earnt" integer NOT NULL,
	"changed_keys" text[] DEFAULT '{}' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lb_entries" (
	"week_key" text NOT NULL,
	"reviewer" text NOT NULL,
	"rank" integer NOT NULL,
	"devlogs_last_three_days" integer NOT NULL,
	"locked_in_status" boolean NOT NULL,
	"locked_in_so_far_this_week" integer NOT NULL,
	"projects_reviewed_today" integer NOT NULL,
	"projects_reviewed_last_three_days" integer NOT NULL,
	"stardust_earnt" integer NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"change_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "lb_entries_pkey" PRIMARY KEY("week_key","reviewer")
);
--> statement-breakpoint
CREATE TABLE "lb_weeks" (
	"week_key" text PRIMARY KEY NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lb_changes" ADD CONSTRAINT "lb_changes_week_key_lb_weeks_week_key_fk" FOREIGN KEY ("week_key") REFERENCES "public"."lb_weeks"("week_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lb_entries" ADD CONSTRAINT "lb_entries_week_key_lb_weeks_week_key_fk" FOREIGN KEY ("week_key") REFERENCES "public"."lb_weeks"("week_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lb_changes_lookup_idx" ON "lb_changes" USING btree ("week_key","reviewer","captured_at");
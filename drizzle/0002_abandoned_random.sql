ALTER TABLE "lb_changes" ALTER COLUMN "devlogs_last_three_days" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "lb_changes" ALTER COLUMN "locked_in_so_far_this_week" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "lb_changes" ALTER COLUMN "projects_reviewed_today" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "lb_changes" ALTER COLUMN "projects_reviewed_last_three_days" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "lb_entries" ALTER COLUMN "devlogs_last_three_days" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "lb_entries" ALTER COLUMN "locked_in_so_far_this_week" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "lb_entries" ALTER COLUMN "projects_reviewed_today" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "lb_entries" ALTER COLUMN "projects_reviewed_last_three_days" SET DATA TYPE double precision;
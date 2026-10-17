ALTER TABLE "lb_entries" RENAME COLUMN "week_key" TO "day_key";--> statement-breakpoint
ALTER TABLE "lb_changes" RENAME COLUMN "week_key" TO "day_key";--> statement-breakpoint
ALTER TABLE "lb_weeks" RENAME COLUMN "week_key" TO "day_key";--> statement-breakpoint
ALTER TABLE "lb_weeks" RENAME TO "lb_days";--> statement-breakpoint
ALTER TABLE "lb_entries" RENAME CONSTRAINT "lb_entries_week_key_lb_weeks_week_key_fk" TO "lb_entries_day_key_lb_days_day_key_fk";--> statement-breakpoint
ALTER TABLE "lb_changes" RENAME CONSTRAINT "lb_changes_week_key_lb_weeks_week_key_fk" TO "lb_changes_day_key_lb_days_day_key_fk";

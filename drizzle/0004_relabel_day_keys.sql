ALTER TABLE "lb_changes" DROP CONSTRAINT "lb_changes_day_key_lb_days_day_key_fk";
--> statement-breakpoint
ALTER TABLE "lb_entries" DROP CONSTRAINT "lb_entries_day_key_lb_days_day_key_fk";
--> statement-breakpoint
ALTER TABLE "lb_changes" ADD CONSTRAINT "lb_changes_day_key_lb_days_day_key_fk" FOREIGN KEY ("day_key") REFERENCES "public"."lb_days"("day_key") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "lb_entries" ADD CONSTRAINT "lb_entries_day_key_lb_days_day_key_fk" FOREIGN KEY ("day_key") REFERENCES "public"."lb_days"("day_key") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
UPDATE "lb_days" SET "day_key" = '~' || "day_key";--> statement-breakpoint
UPDATE "lb_days" SET "day_key" = to_char((right("day_key", 10))::date + 1, 'YYYY-MM-DD');

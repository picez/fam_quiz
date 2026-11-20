-- Модерація (план 63): позначки «сховав адміністратор» на подіях стрічки, групах і записах груп та індекс журналу за адміном. Лише додавання.
ALTER TABLE "family_group" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "family_group" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "feed_event" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_item" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "admin_action_admin_idx" ON "admin_action" USING btree ("admin_id","at");
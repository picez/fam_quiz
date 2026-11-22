-- «Тебе додали до групи» у «Вхідних» (план 72): колонка inbox_item.group_id з ключем на групу (видалена група — рядок теж геть) та індекс; лише додає.
ALTER TABLE "inbox_item" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_group_id_family_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."family_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_item_group_idx" ON "inbox_item" USING btree ("group_id");
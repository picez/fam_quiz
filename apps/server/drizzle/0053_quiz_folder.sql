-- Особисті категорії вікторин (план 73): таблиця quiz_folder (назва унікальна в автора без огляду на регістр), колонка quiz.folder_id (видалена категорія — вікторина без категорії) та індекси; лише додає.
CREATE TABLE "quiz_folder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "quiz_folder" ADD CONSTRAINT "quiz_folder_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_folder_owner_idx" ON "quiz_folder" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_folder_owner_name_idx" ON "quiz_folder" USING btree ("owner_id",lower("name"));--> statement-breakpoint
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_folder_id_quiz_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."quiz_folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_folder_idx" ON "quiz" USING btree ("folder_id");
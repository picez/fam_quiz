-- Командна гра (план 10j): рядок команди й посилання людини на команду. Старі рядки — is_team false, team_id null.
ALTER TABLE "participant" ADD COLUMN "is_team" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "participant" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_team_id_participant_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participant_team_idx" ON "participant" USING btree ("team_id");
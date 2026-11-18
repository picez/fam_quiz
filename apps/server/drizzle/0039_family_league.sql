-- Сімейна ліга (план 45): враховані ігри, бали членів групи, підсумовані місяці й чемпіони.
CREATE TABLE "league_champion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid,
	"group_name" text NOT NULL,
	"month" text NOT NULL,
	"user_id" text NOT NULL,
	"points" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_game" (
	"game_id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"month" text NOT NULL,
	"members" integer NOT NULL,
	"counted" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_month" (
	"group_id" uuid NOT NULL,
	"month" text NOT NULL,
	"settled_at" timestamp with time zone NOT NULL,
	CONSTRAINT "league_month_group_id_month_pk" PRIMARY KEY("group_id","month")
);
--> statement-breakpoint
CREATE TABLE "league_point" (
	"game_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"month" text NOT NULL,
	"place" integer NOT NULL,
	"points" integer NOT NULL,
	"nickname" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_point_game_id_user_id_pk" PRIMARY KEY("game_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "league_champion" ADD CONSTRAINT "league_champion_group_id_family_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."family_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_champion" ADD CONSTRAINT "league_champion_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_game" ADD CONSTRAINT "league_game_group_id_family_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."family_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_month" ADD CONSTRAINT "league_month_group_id_family_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."family_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_point" ADD CONSTRAINT "league_point_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_point" ADD CONSTRAINT "league_point_group_id_family_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."family_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_champion_unique_idx" ON "league_champion" USING btree ("group_id","month","user_id");--> statement-breakpoint
CREATE INDEX "league_champion_user_idx" ON "league_champion" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "league_game_group_idx" ON "league_game" USING btree ("group_id","month");--> statement-breakpoint
CREATE INDEX "league_point_group_idx" ON "league_point" USING btree ("group_id","month");--> statement-breakpoint
CREATE INDEX "league_point_user_idx" ON "league_point" USING btree ("user_id");
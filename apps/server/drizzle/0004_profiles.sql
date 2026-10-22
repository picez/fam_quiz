CREATE TABLE "follow" (
	"follower_id" text NOT NULL,
	"followee_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id")
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"nickname" text NOT NULL,
	"nickname_key" text NOT NULL,
	"avatar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_nickname_key_unique" UNIQUE("nickname_key")
);
--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_followee_id_user_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follow_followee_idx" ON "follow" USING btree ("followee_id");
CREATE TABLE "showcase_pin" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"item_id" text NOT NULL,
	"slot" integer NOT NULL,
	"pinned_at" timestamp with time zone NOT NULL,
	CONSTRAINT "showcase_pin_user_id_kind_item_id_pk" PRIMARY KEY("user_id","kind","item_id")
);
--> statement-breakpoint
ALTER TABLE "showcase_pin" ADD CONSTRAINT "showcase_pin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "showcase_pin_slot" ON "showcase_pin" USING btree ("user_id","kind","slot");
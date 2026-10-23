-- Живі кімнати (план 9b): стан гри, щоб вона пережила перезапуск сервера.
CREATE TABLE "live_room" (
	"code" text PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"owner" text,
	"heartbeat_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "live_room_room_id_unique" UNIQUE("room_id")
);

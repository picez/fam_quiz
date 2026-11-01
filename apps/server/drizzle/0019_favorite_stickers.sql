-- Улюблені стікери (беклог 7): id з маніфесту, від нещодавно доданих.
ALTER TABLE "profile" ADD COLUMN "favorite_stickers" text[] DEFAULT '{}' NOT NULL;
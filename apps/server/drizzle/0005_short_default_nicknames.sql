-- Нікнейм за замовчуванням тепер лише ім'я (план 6h). Профілі, яких власник не зберігав
-- (saveProfile завжди ставить новий updated_at; аватар теж зберігається лише через нього),
-- видаляються: ensureProfile створить їх знову під час наступного читання. follow посилається на user.
DELETE FROM "profile" WHERE "updated_at" = "created_at" AND "avatar" IS NULL;

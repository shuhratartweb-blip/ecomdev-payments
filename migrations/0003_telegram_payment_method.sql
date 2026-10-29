ALTER TABLE telegram_flow ADD COLUMN method TEXT NOT NULL DEFAULT 'telegram' CHECK(method IN ('telegram','payme','click'));

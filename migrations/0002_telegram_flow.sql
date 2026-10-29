CREATE TABLE telegram_flow (
 user_id INTEGER PRIMARY KEY,
 student_id INTEGER,
 amount TEXT,
 nonce TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);

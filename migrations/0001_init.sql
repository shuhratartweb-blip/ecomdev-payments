PRAGMA foreign_keys = ON;
CREATE TABLE students (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 phone TEXT NOT NULL,
 group_name TEXT NOT NULL,
 monthly_fee INTEGER NOT NULL CHECK(monthly_fee >= 0 AND monthly_fee <= 100000000000),
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE payments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 amount INTEGER NOT NULL CHECK(amount > 0 AND amount <= 100000000000),
 date TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('manual','payme','click','telegram')),
 idempotency_key TEXT UNIQUE,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX payments_student_date ON payments(student_id,date);
CREATE TABLE telegram_preferences (user_id INTEGER PRIMARY KEY, lang TEXT NOT NULL CHECK(lang IN ('ru','uz')));
CREATE TABLE login_attempts (ip_hash TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);

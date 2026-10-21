-- Keep raw study records intact; exports omit only sessions explicitly marked as QA.
CREATE TABLE study_exclusions (
  session_id TEXT PRIMARY KEY REFERENCES sessions(session_id),
  classification TEXT NOT NULL CHECK(classification = 'developer_qa'),
  reason TEXT NOT NULL CHECK(length(trim(reason)) > 0),
  requested_by TEXT NOT NULL CHECK(length(trim(requested_by)) > 0),
  event_count_at_mark INTEGER NOT NULL CHECK(event_count_at_mark >= 0),
  excluded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

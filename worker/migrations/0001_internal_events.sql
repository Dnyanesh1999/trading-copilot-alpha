-- Internal synthetic/dev records only. No participant table or identity fields.
CREATE TABLE journey_events (
  ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  received_at TEXT NOT NULL,
  UNIQUE(session_id, sequence)
);
-- A retry may repeat identical content; reusing an ID with different content is an error.
CREATE TRIGGER immutable_event_id BEFORE INSERT ON journey_events
WHEN EXISTS (SELECT 1 FROM journey_events WHERE event_id = NEW.event_id AND payload <> NEW.payload)
BEGIN
  SELECT RAISE(ABORT, 'event_id_conflict');
END;

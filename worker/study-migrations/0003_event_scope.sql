DROP TRIGGER immutable_study_event;
CREATE TRIGGER immutable_study_event BEFORE INSERT ON usage_events WHEN EXISTS(SELECT 1 FROM usage_events WHERE event_id=NEW.event_id AND (payload<>NEW.payload OR session_id<>NEW.session_id)) BEGIN SELECT RAISE(ABORT,'event_conflict'); END;

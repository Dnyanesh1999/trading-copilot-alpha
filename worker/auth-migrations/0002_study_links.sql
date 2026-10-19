-- Private account-to-study mapping; excluded from study CSV exports.
CREATE TABLE auth_study_link (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE, mode TEXT NOT NULL CHECK(mode IN ('rehearsal','participant')), UNIQUE(user_id,mode));
CREATE TABLE auth_profile (user_id TEXT PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE, trading_style TEXT NOT NULL, experience TEXT NOT NULL, device TEXT NOT NULL);

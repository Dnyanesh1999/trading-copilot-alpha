-- Private product storage. Never included in study analytics exports.
CREATE TABLE account_reviews (
 user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 review_id TEXT NOT NULL,
 payload TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 disclosure_version TEXT NOT NULL,
 PRIMARY KEY(user_id,review_id)
);
CREATE INDEX account_reviews_owner_updated ON account_reviews(user_id,updated_at DESC);

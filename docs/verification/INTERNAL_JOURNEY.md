> Update: the local Worker/D1 transport is now implemented. See [LOCAL_BACKEND.md](LOCAL_BACKEND.md) for current behaviour and verification. The original step-one record below is preserved.

# Internal journey instrumentation — 11 October 2026

Local branch: codex/internal-journey-logging. Not deployed. This is step one of the logging work, not central participant collection.

Run npm run dev and open /trading-copilot-alpha/?internalLogging=1. The explicit internal banner offers JSON export. Logging requires both the Vite development build and the query flag. Production builds cannot enable it through that flag. Default demo remains untracked.

Records include schema/build marker, internal mode, random event/session IDs, sequence, UTC timestamp, stage, fixed action and visible duration. No trade values, strategy text, instrument or participant identifiers. Position interactions are counted without a per-position reference in this first version. AI-rule decision metrics are not implemented.

Start buttons begin a review session. Confirmed rules and successful focus saves are recorded after successful operations; completion is deduplicated within a session. Opening an existing saved review produces a separate browse session without review-start or completion eligibility. Explore another review explicitly begins a new session. Home/reset end the active session. Evidence is counted only on the explicit open button. Visibility changes flush/pause timing, navigation closes intervals, export checkpoints timing without double counting.

Memory only: reload loses the export buffer; no server or persistent retry queue. Export before reload. Closing/crashing cannot guarantee a final event; missing intervals are incomplete, not zero. The 10,000-event buffer exposes droppedEvents; exports with dropped records must not be analysed as complete. No collection-error delivery guarantee, server validation/deduplication, authenticated export, withdrawal or consent system is implemented. Do not enable participant use from this implementation.

Verification: 87 tests pass (82 existing + 5 logger tests), TypeScript and production build pass. CUA in-app browser completed Start → confirm → explicit evidence open → choose later → save → export. Downloaded internal JSON showed 1 start, 1 confirmation, 1 evidence open, 1 save, 3 stage entries and zero dropped events. Synthetic tests cover disabled collection, hidden time, duplicate completion, saved reopening, snapshot isolation and export timing. No broader mobile/keyboard regression claimed this turn.

Next: server-side closed schema validation, duplicate-event rejection, internal transport/retry, authenticated export and a known-journey round trip. Final provider/retention/consent/ethics requirements remain separate gates for participant collection.

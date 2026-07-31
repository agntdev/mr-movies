# MR MOVIES — Bot specification

**Archetype:** content

**Voice:** friendly and helpful — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that lets users search and stream MP4 movies from an admin-curated library. Admins manage content via uploads and inline controls, with notifications for activity and errors.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- general public
- movie enthusiasts

## Success criteria

- User successfully streams requested movie
- Admin receives upload notifications
- Search returns relevant matches within 1 second

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Show welcome message and usage hint
- **Search movie** (message, actor: user, command: /movie_title) — Trigger search for movies matching text
  - inputs: natural language movie title
  - outputs: thumbnail grid with 1-5 matches
- **/list** (command, actor: user, command: /list) — Browse paginated movie listings (10 per page)
- **/upload** (command, actor: admin, command: /upload) — Initiate movie upload flow

## Flows

### Movie search
_Trigger:_ user message

1. Receive movie title query
2. Find top 5 fuzzy matches
3. Display thumbnail grid with metadata

_Data touched:_ Movie

### Exact match shortcut
_Trigger:_ exact title message

1. Validate single clear match
2. Directly serve MP4 file

### Admin upload
_Trigger:_ /upload

1. Receive MP4 file
2. Validate format/size
3. Store metadata
4. Confirm upload success

### Admin management
_Trigger:_ inline button on movie entry

1. Receive action (delete/replace/etc)
2. Update movie status/attributes

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`env.<KEY>` on Workers). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Receive upload notifications and summaries
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` — never ask a user, never treat whoever writes first as the admin.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **Movie** _(retention: persistent)_ — Curated media content with metadata
  - fields: title, filename, alternate_titles, description, thumbnail, duration, file_size, upload_timestamp, uploader_admin_id, visibility
- **Admin** _(retention: persistent)_ — Content manager with access controls
  - fields: telegram_id, display_name, permissions
- **UserRequest** _(retention: persistent)_ — Search and playback activity log
  - fields: search_term, matched_movie_id, timestamp

## Integrations

- **Telegram** (required) — Bot API messaging and file transfers
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Admin user IDs
- Upload format restrictions
- Thumbnail generation policy
- Notification chat ID

## Notifications

- Upload success/failure alerts
- Daily upload summary report
- Error notifications for invalid uploads

## Permissions & privacy

- Admins can only manage their own uploads
- User requests are logged for analytics but not personally identifiable
- MP4 files are stored as-is without transcoding

## Edge cases

- No matches found for search query
- Multiple ambiguous matches
- Upload exceeds Telegram's file size limit
- Invalid MP4 container format

## Required tests

- End-to-end search → playback flow with 5-match fallback
- Admin upload with format/size validation
- Pagination navigation in /list command
- Notification delivery to admin chat

## Assumptions

- Telegram's file storage handles MP4 retention
- Thumbnail generation works for all valid MP4s
- Admins will maintain appropriate content curation

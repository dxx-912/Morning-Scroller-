# Test fixtures

Synthetic Instagram exports (fake shortcodes and usernames) covering the
shapes the parser supports. Used by `npm test`.

| Folder | Shape |
| --- | --- |
| `classic/` | `saved_saved_media` + flat `saved_saved_collections` (header record, then members). Includes duplicates, `/p/`, `/reel/`, `/reels/`, `/tv/`, a username-prefixed URL, a profile link, and mis-encoded UTF-8 (emoji, accents) the way Instagram writes it. |
| `label-values/` | Newer Accounts Center shape: bare array of `{ timestamp, label_values: [...] }`. No collections file. |
| `nested/` | Collections file only, one record per collection with posts nested inside. |
| `legacy/` | Very old `saved_media` tuples with usernames and no links (nothing importable). |

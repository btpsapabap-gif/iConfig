# V87 – Workspace Panel Scrolling

- Corrected the requested layout scope: scrolling now applies to the three main workspace panels, not just the Project card.
- Left Pipeline panel: independent horizontal + vertical scrolling.
- Middle L1–L6 Process Directory: independent horizontal + vertical scrolling; long hierarchy names no longer force the whole page wider.
- Right detail panel: independent horizontal + vertical scrolling for tables, records and deployment content.
- Grid columns use `minmax(0, 1fr)` and `min-width: 0` so one panel cannot push the other panels off-screen.
- Existing Project module editor, Supabase-first L1–L6 logic, Bronze/Silver/Gold and Audit Log behavior are unchanged.
- Frontend asset cache version bumped to V87.

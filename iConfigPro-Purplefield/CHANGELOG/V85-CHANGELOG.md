# iConfigPro V85 – Project Module Assignment Editor

## Change
- Added **Edit Modules** directly to each existing Project card.
- Edit Modules opens the existing module selector with the project's current assignments pre-selected.
- Users can unselect saved modules or select additional modules.
- Save Modules persists the exact selected module set through the existing PUT project-module API.
- Removing a module affects only that project's assignment; the `spro_modules` master data and L1–L6 hierarchy cache are not deleted.
- The project and L1–L6 panel are refreshed immediately after saving.
- Existing V84 Supabase-first L1–L6 behavior is preserved.

# iConfigPro V79 — Direct Project Context / L1-L6 Startup Fix

## Changes
- Automatically restores the last selected project from browser local storage.
- If there is exactly one project, it is opened automatically after project/module data loads.
- L1-L6 Process Directory therefore becomes available without requiring Bronze -> Projects -> Open or a browser refresh.
- Selected project ID is cleared when that project is deleted.
- L1-L6 empty-state message now distinguishes “no project selected” from “selected project has no hierarchy data”.
- `/api/tree/spro` now fails closed with an empty read-only hierarchy instead of returning HTTP 502 for transient SAP/Supabase compatibility failures.
- Canonical module-code linkage remains ER/FI/CO/LG/SD/MM/LE/QM/PD/PP/PS/TM/PY/PM.
- No Bronze/Silver/Gold deployment logic changed.

# Pocket DJ Three-Layer Past/Future Slot Fix

<span style="color:#16a34a;">Fixed:</span> Past and future lyrics were rendering but their CSS position variables were never being created.

<span style="color:#16a34a;">Changed:</span> `applyRoomUtilitySettings()` now writes `--lyrics-past-slot-*` and `--lyrics-future-slot-*` variables used by the three-layer renderer.

<span style="color:#16a34a;">Added:</span> CSS fallback values for past/future slot variables so the lines remain visible even before utility settings finish applying.

<span style="color:#16a34a;">Changed:</span> Room utility storage key bumped to `pocketdj-room-utility-v8` so stale geometry does not block the corrected slot variables.

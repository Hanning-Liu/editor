# Spatial hierarchy interaction plan

Base: ec5bbdbfa6c88f340c54406c1bb6e2fa8cbe37ea. Branch: codex/spatial-hierarchy-ux.

1. Replace persistent tree action buttons with context menus and focus/hover actions. Use native inspector cards, inline rename, and global history shortcuts.
2. Select persistent groups through their movable support roots, reuse the editor's 2D/3D group transform affordances, and support semantic drag/drop of items between groups and groups between functional zones. Never reparent furniture or alter poses while assigning membership.
3. Validate each UI path in a dedicated project: menus, keyboard access, property editing, rename, selection-derived creation, movement/rotation, reassignment, rejected drops, undo/redo, refresh persistence and support relationships. Snapshot all existing scenes before changes and compare afterward.
4. Run focused tests and typechecks, localize new copy, document evidence and limitations, commit and push the review branch.

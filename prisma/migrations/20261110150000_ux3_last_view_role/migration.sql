-- UX3 (UX plan D2a): the role a multi-role person last chose in "Viewing as" (or that a
-- Super Admin last previewed). NULL = land on the highest role held. Presentation only —
-- it never changes permissions. The user table's existing RLS policy applies.
ALTER TABLE "user" ADD COLUMN "last_view_role" TEXT;

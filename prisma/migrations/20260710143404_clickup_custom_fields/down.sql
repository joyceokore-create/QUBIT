-- Reverse of the custom-fields migration (manual rollback; additive → drop only new).
DROP TABLE IF EXISTS "field_value" CASCADE;
DROP TABLE IF EXISTS "field_definition" CASCADE;
DROP TYPE IF EXISTS "FieldType";

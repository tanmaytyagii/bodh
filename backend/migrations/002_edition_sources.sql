-- One edition can translate several sources (a single volume of three
-- Upanishads), so the edition-to-source link moves into the edition's data
-- (`source_ids`) instead of a single foreign key.
ALTER TABLE editions DROP COLUMN IF EXISTS source_id;

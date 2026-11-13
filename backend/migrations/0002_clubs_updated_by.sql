-- Every projection table records who last wrote the row. clubs was created
-- before the record spine projected onto it, so it was the one table missing
-- that column and a club-profile edit failed on it.
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS updated_by VARCHAR(40);
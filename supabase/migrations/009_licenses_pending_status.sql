DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'licenses' AND constraint_name = 'licenses_status_check'
  ) THEN
    ALTER TABLE licenses DROP CONSTRAINT licenses_status_check;
  END IF;
END $$;

ALTER TABLE licenses
ADD CONSTRAINT licenses_status_check
CHECK (status IN ('active', 'pending', 'revoked', 'expired'));

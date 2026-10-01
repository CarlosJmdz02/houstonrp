-- 020_licenses_insurance.sql
-- Agrega el tipo 'insurance' (Seguranza de Vehículo) a la tabla licenses.
-- La Seguranza se paga ($299) y tiene validez de 1 mes.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'licenses' AND constraint_name = 'licenses_type_check'
  ) THEN
    ALTER TABLE licenses DROP CONSTRAINT licenses_type_check;
  END IF;
END $$;

ALTER TABLE licenses
ADD CONSTRAINT licenses_type_check
CHECK (type IN ('drivers', 'weapons', 'insurance'));

-- La validez por defecto de 7 días se mantiene para drivers/weapons.
-- La Seguranza usa expires_at explícito (+30 días) desde el frontend.

NOTIFY pgrst, 'reload schema';

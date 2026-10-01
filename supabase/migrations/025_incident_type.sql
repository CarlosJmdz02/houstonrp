-- 025 — Permitir tipo 'incident' en police_records
-- Los reportes de incidente (incidentes policiales / ITMDT) no son arrestos:
-- hasta ahora se guardaban como type='arrest' y contaminaban las estadísticas
-- de arrestos y los perfiles de los implicados.

ALTER TABLE police_records DROP CONSTRAINT IF EXISTS police_records_type_check;
ALTER TABLE police_records ADD CONSTRAINT police_records_type_check CHECK (type IN ('arrest', 'fine', 'incident'));
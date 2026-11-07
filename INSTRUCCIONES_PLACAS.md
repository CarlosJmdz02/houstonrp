# 📋 Instrucciones: Crear Tabla de Placas en Supabase

## Problema
El panel de gestión necesita guardar las placas de los oficiales (ej: "1K-01"), pero no existe una tabla en Supabase.

## Solución
He creado una migración SQL para crear la tabla `officer_badges`.

## ¿Cómo ejecutar la migración?

### Opción 1: A través de Supabase Dashboard (Recomendado)
1. Abre https://app.supabase.com
2. Ve a tu proyecto Houston RP
3. Abre **SQL Editor** en el menú izquierdo
4. Crea una nueva query
5. Copia y pega el siguiente SQL:

```sql
-- Crear tabla officer_badges para guardar las placas de los oficiales
CREATE TABLE IF NOT EXISTS officer_badges (
  discord_id   TEXT PRIMARY KEY REFERENCES rank_members(discord_id) ON DELETE CASCADE,
  badge_number TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_officer_badges_discord_id ON officer_badges(discord_id);
CREATE INDEX IF NOT EXISTS idx_officer_badges_badge_number ON officer_badges(badge_number);

-- RLS (Row Level Security)
ALTER TABLE officer_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read badge_officers" ON officer_badges
  FOR SELECT USING (true);

CREATE POLICY "Allow insert/update badge_officers for admins" ON officer_badges
  FOR ALL USING (auth.jwt() ->> 'role' = 'authenticated');
```

6. Haz clic en **▶️ Run** (ejecutar)
7. ¡Listo! La tabla está creada

### Opción 2: A través de Migrations (Si usas Supabase CLI)
```bash
cd C:\Users\13462\OneDrive\Desktop\houston-web1ww
supabase db push
```

## ¿Qué hace esta migración?

✅ Crea tabla `officer_badges` con:
- `discord_id`: ID del oficial (llave primaria)
- `badge_number`: Número de placa (ej: "1K-01")
- `created_at`: Fecha de creación
- `updated_at`: Fecha de última actualización

✅ Crea índices para búsquedas rápidas
✅ Configura Row Level Security (RLS)

## Después de crear la tabla

El panel de gestión en https://houstonrp.netlify.app/manages ahora podrá:
- ✅ Guardar placas de oficiales
- ✅ Mostrar placas con el formato: "1K-01 | Carlos Jimenez"
- ✅ Editar placas desde el botón "Editar"

## Soporte

Si hay algún error:
1. Verifica que la tabla `rank_members` exista
2. Comprueba que tienes permisos de administrador en Supabase
3. Si ves error de "badge_number column doesn't exist", la migración no se ejecutó correctamente

---

**Creado**: Noviembre 6, 2026
**Sistema**: Houston RP — Panel de Gestión

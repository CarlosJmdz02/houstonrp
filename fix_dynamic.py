#!/usr/bin/env python3
"""
Fix all dynamically generated corrupted characters in mdt.html
"""

filepath = 'mdt.html'

with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# CRÍTICO: Reemplazos en STRINGS de JavaScript que generan HTML dinámico
replacements = {
    # Caracteres individuales dañados
    '≡ƒôï': '',           # Antes de displayName
    '≡ƒÄ«': 'Usuario: ',  # Antes de usuario
    'ΓÇö': ' - ',         # Guión dañado
    '┬╖': ' • ',          # Separador dañado
    'ΓåÆ': '',           # Después de "Ver Perfil"
    'Γ¥î': '',           # Error symbol
    '├│': 'o',           # ó
    '├ú': 'u',           # ú
    '├¡': 'a',           # á
    '├³': 'o',           # ó
    'Direcci├│n': 'Direccion',
    'Polic├ía': 'Policia',
    'Veh├ículos': 'Vehiculos',
    'Emergencias M├⌐dicas': 'Emergencias Medicas',
    'Seguro de Veh├ículo': 'Seguro de Vehiculo',
    'Escrib├í': 'Escribi',
}

print(f"Reemplazando {len(replacements)} patrones...")

for old, new in replacements.items():
    before = text.count(old)
    text = text.replace(old, new)
    after = text.count(old)
    if before > 0:
        print(f"  {before} → '{old}' reemplazado por '{new}'")

# Limpiar duplicados y espacios extras
text = text.replace('  •  ', ' • ')
text = text.replace('   ', ' ')
text = text.replace('BUSCADO Buscado', 'BUSCADO')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)

print("\n✓ Archivo limpiado y guardado")

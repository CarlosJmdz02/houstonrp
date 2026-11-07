#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re

with open('mdt.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Lista COMPLETA de caracteres dañados
corrupted = [
    '≡ƒôï', '≡ƒÄ«', '≡ƒÜö', '≡ƒö┤', '≡ƒÜù', '≡ƒö½', 
    '≡ƒ¢ú', '≡ƒ¢í', '≡ƒÜÆ', '≡ƒöº', '≡ƒÜæ', '≡ƒÅó', 
    '≡ƒÆ░', '≡ƒô£', '≡ƒôï', '≡ƒùæ', '≡ƒÜ½', '≡ƒæ«', '≡ƒÅ¢',
    'ΓÇö', 'Γ¥î', 'ΓåÆ', 'Γ¡É', 'ΓùÅ', 'ΓùĂ', 'ΓÜû', 'Γ£Å', 'Γ├',
    '├¡', '├│', '├ú', '├³', '├╖', '├║', '├¢',
    '┬╖', '∩╕Å', '∩╕',
]

print(f"Limpiando {len(corrupted)} tipos de caracteres dañados...")

for bad in corrupted:
    before = content.count(bad)
    content = content.replace(bad, '')
    if before > 0:
        print(f"  Removidos {before} x '{bad}'")

# Limpiar espacios dobles
content = re.sub(r'  +', ' ', content)

# Reemplazar textos españoles dañados
replacements = {
    r'Direcci.{1,3}n': 'Direccion',
    r'Polic.{1,3}a': 'Policia',
    r'Veh.{1,3}culos': 'Vehiculos',
    r'Escrib.{1,3}': 'Escribi',
    r'Describ.{1,3}': 'Describi',
    r'C.{1,2}digo': 'Codigo',
}

for pattern, replacement in replacements.items():
    count = len(re.findall(pattern, content))
    if count > 0:
        content = re.sub(pattern, replacement, content)
        print(f"  Reemplazados {count} x '{pattern}'")

with open('mdt.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ Archivo limpiado exitosamente")

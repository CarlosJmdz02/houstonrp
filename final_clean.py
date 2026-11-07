#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re

with open('mdt.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Más caracteres dañados que quedan
remaining = [
    'Ä«', 'ùÅ', 'Üû', 'æ«', 'Å¢', 'òÉ', '£Å', 'Ü½', 'ùæ',
    'Üù', 'ö½', '¢í', 'Üö', 'Æ░', 'ô£', 'ôï',
    '╕Å', '¡culo', '¡'
]

print("Limpiando caracteres restantes...")
for bad in remaining:
    before = content.count(bad)
    content = content.replace(bad, '')
    if before > 0:
        print(f"  Removidos {before} x '{bad}'")

# Limpiar espacios extra
content = re.sub(r'  +', ' ', content)

with open('mdt.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Limpieza completada")

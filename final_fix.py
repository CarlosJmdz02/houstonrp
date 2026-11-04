#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Final comprehensive fix for mdt.html
Only fixes corrupted characters, preserves all valid emojis
"""
import sys
import os

filepath = 'mdt.html'

# Read as binary, then decode as ISO-8859-1 to preserve the corrupted bytes
with open(filepath, 'rb') as f:
    data = f.read()

# Decode from ISO-8859-1 (which preserves all byte values as characters)
text = data.decode('iso-8859-1', errors='ignore')

# ONLY replace corrupted sequences, NOT emojis
corrupted_chars = {
    '≡ƒôï': '',           # Empty - prefix junk
    '≡ƒÄ«': '',           # Empty - prefix junk  
    '≡ƒÜö': '',           # Remove - should be emoji
    '≡ƒÜù': '',           # Remove - should be emoji
    '≡ƒö½': '',           # Remove - should be emoji
    '≡ƒ¢ú': '',           # Remove - should be emoji
    '≡ƒ¢í': '',           # Remove - should be emoji
    '≡ƒÜÆ': '',           # Remove - should be emoji
    '≡ƒöº': '',           # Remove - should be emoji
    '≡ƒÜæ': '',           # Remove - should be emoji
    '≡ƒÅó': '',           # Remove - should be emoji
    '≡ƒÆ░': '',           # Remove - should be emoji
    '≡ƒô£': '',           # Remove - should be emoji
    'ΓÇö': '-',            # Replace with hyphen
    'Γ¥î': '',            # Remove error symbol
    'ΓåÆ': '',            # Remove junk
    '├│': 'o',            # ó
    '├¡': 'a',            # á
    '├ú': 'u',            # ú
    '├³': 'o',            # ó
    'Direcci├│n': 'Direccion',
    'Direcci├³n': 'Direccion',
    'Polic├¡a': 'Policia',
    'Polic├ía': 'Policia',
    'Veh├¡culos': 'Vehiculos',
    'Veh├ículos': 'Vehiculos',
    'Emergencias M├⌐dicas': 'Emergencias Medicas',
    'Seguro de Veh├ículo': 'Seguro de Vehiculo',
    'Escrib├í': 'Escribi',
    'Escrib├¡': 'Escribi',
    '∩╕Å': '',            # Remove suffix junk
    '∩╕': '',             # Remove suffix junk
    '┬╖': ' • ',          # Replace with bullet
}

for old, new in corrupted_chars.items():
    text = text.replace(old, new)

# Clean up double spaces and spacing issues
text = text.replace('  •  ', ' • ')
text = text.replace('   ', ' ')

# Now write back as UTF-8
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)

print("✓ File cleaned and saved as UTF-8")

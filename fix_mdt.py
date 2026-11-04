#!/usr/bin/env python3
import sys

# Leer archivo
filepath = 'C:\\Users\\13462\\OneDrive\\Desktop\\houston-web1ww\\mdt.html'

with open(filepath, 'rb') as f:
    data = f.read()

# Intentar detectar la encoding y convertir
try:
    text = data.decode('utf-8')
except:
    try:
        text = data.decode('iso-8859-1')
    except:
        text = data.decode('utf-8', errors='replace')

# Diccionario de reemplazos específicos para caracteres dañados
replacements = {
    '≡ƒôï': '',
    '≡ƒÄ«': '',
    'ΓÇö': '-',
    '┬╖': ' • ',
    '≡ƒö┤': 'BUSCADO',
    '├ù': 'x',
    'Γ¥î': '',
    'ΓåÆ': '',
    'Direcci├│n': 'Direccion',
    'Direcci├³n': 'Direccion',
    'Escrib├í': 'Escribi',
    'Escrib├¡': 'Escribi',
    'Polic├ía': 'Policia',
    'Polic├¡a': 'Policia',
    'Veh├ículos': 'Vehiculos',
    'Veh├¡culos': 'Vehiculos',
    'M├⌐dicas': 'Medicas',
    'Seguro de Veh├ículo': 'Seguro de Vehiculo',
    '≡ƒÜö': '[POLICIA]',
    'Γ¡É': '[SHERIFF]',
    '≡ƒ¢ú': '[PATRULLA]',
    '≡ƒ¢í': '[ICE]',
    '≡ƒÜÆ': '[BOMBEROS]',
    '≡ƒöº': '[HDOT]',
    '≡ƒÜæ': '[EMS]',
    '≡ƒÅó': '[DC]',
}

# Hacer reemplazos
for old, new in replacements.items():
    text = text.replace(old, new)

# Escribir con UTF-8
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)

print("Archivo limpiado y convertido a UTF-8")

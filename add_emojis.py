#!/usr/bin/env python3
filepath = 'mdt.html'

with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# Reemplazar placeholders por emojis
replacements = {
    '[POLICIA]': '👮',
    '[SHERIFF]': '🛡️',
    '[PATRULLA]': '🚔',
    '[ICE]': '📋',
    '[BOMBEROS]': '🚒',
    '[HDOT]': '🚗',
    '[EMS]': '🚑',
    '[DC]': '🏛️',
}

for old, new in replacements.items():
    text = text.replace(old, new)

# Limpiar duplicados
text = text.replace('BUSCADO Buscado', 'BUSCADO')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)

print("Emojis agregados")

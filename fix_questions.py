#!/usr/bin/env python3
import re

with open('manages.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Patrón: <li><strong> sin estilo, pero que sea pregunta (no opción A/B/C/D)
# Reemplazar con estilo de margen y borde

def fix_questions(content):
    lines = content.split('\n')
    new_lines = []
    
    for line in lines:
        # Si es una pregunta <li><strong> sin el estilo de margin-bottom
        # Y no es una opción (no empieza con A. B. C. D. dentro de ul)
        if '<li><strong>' in line and 'style="margin-bottom:' not in line and 'style="\margin-bottom' not in line:
            # Verificar que no sea una opción dentro de ul (que tiene A., B., C., D.)
            if '<ul>' not in line and not re.search(r'<li>[ABCD]\. ', line):
                # Reemplazar
                line = line.replace(
                    '<li><strong>',
                    '<li style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid rgba(33, 150, 243, 0.2);"><strong>'
                )
        
        new_lines.append(line)
    
    return '\n'.join(new_lines)

content = fix_questions(content)

with open('manages.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ Fixed all question styling in manages.html")

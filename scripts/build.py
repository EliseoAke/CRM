#!/usr/bin/env python3
"""Genera los artefactos desde schema/modulos.json y app/index.src.html:
  - app/index.html            app lista para abrir (modo demo) o servir desde n8n
  - n8n/api.workflow.ts       workflow "Mayalink · API y app web" (SDK de n8n)
La clave de la API NUNCA se guarda en git: se toma de la variable MAYALINK_TOKEN
(si no existe, queda el marcador __MAYALINK_TOKEN__ para reemplazarlo en n8n).
"""
import json, os, pathlib
R = pathlib.Path(__file__).resolve().parent.parent
schema = json.loads((R/'schema/modulos.json').read_text())
schema.pop('_descripcion', None)
html = (R/'app/index.src.html').read_text().replace('/*__SCHEMA__*/{}', json.dumps(schema, ensure_ascii=False))
(R/'app/index.html').write_text(html)

# Tipos por tabla para validar en el servidor
TYPES = {t: {f['n']: f['t'] for f in v['campos']} for t, v in schema['tablas'].items()}
token = os.environ.get('MAYALINK_TOKEN', '__MAYALINK_TOKEN__')
validar_js = (R/'n8n/validar.js').read_text().replace('__TYPES__', json.dumps(TYPES)).replace('__MAYALINK_TOKEN__', token)
tpl = (R/'n8n/api.workflow.tpl.ts').read_text()
code = tpl.replace("'__VALIDAR_JS__'", json.dumps(validar_js))
out = R/('n8n/api.workflow.ts' if token == '__MAYALINK_TOKEN__' else '.build/api.workflow.ts')
out.parent.mkdir(exist_ok=True)
out.write_text(code)
print('ok', out, len(code), 'chars')

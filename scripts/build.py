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

# ---------------------------------------------------------------------------
# Asistente Mayalink (agente de n8n) y flujos de WhatsApp
#   - n8n/asistente.agent.json               config del Agente "Asistente Mayalink"
#   - n8n/whatsapp-asistente.workflow.ts     puente WhatsApp <-> asistente para empleados
#   - n8n/whatsapp-recordatorios.workflow.ts recordatorios de cobro a clientes
# Las herramientas del asistente se definen una sola vez aquí (HERRAMIENTAS).
# ---------------------------------------------------------------------------
INSTR = (R/'n8n/asistente.instrucciones.md').read_text().strip()
TABLE_IDS = {'ml_clientes': 'NtLuJ1Mw2dLrWBSZ', 'ml_planes': 'RhRscMlZ33AS05ga', 'ml_facturas': 'fDXft9y444tDg0EU',
             'ml_tickets': 'BSfKEtnTsE1WfEej', 'ml_inventario': 'nhtCCNNk8DM7c70Y', 'ml_prospectos': 'MFr086vVY2Kqoeb5',
             'ml_cuentas': '4jg23yvj0W7cJD9k'}

def ai(k, d, t='string'):
    return "$fromAI('%s', '%s', '%s')" % (k, d.replace("'", "\\'"), t)

# (nombre, descripción, tabla, filtros [(columna, condición, expresión)], opciones)
HERRAMIENTAS = [
    ('buscar_clientes', 'Busca clientes por nombre (búsqueda parcial, sin distinguir mayúsculas). Devuelve id, teléfono, zona, plan_id, estado, día de corte, IP, etc.',
     'ml_clientes', [('nombre', 'ilike', '%{{ ' + ai('nombre', 'Parte del nombre del cliente a buscar') + ' }}%')], {'limit': 20}),
    ('clientes_por_estado', 'Lista clientes según su estado: instalacion, activo, suspendido o baja.',
     'ml_clientes', [('estado', 'eq', '{{ ' + ai('estado', 'Estado del cliente: instalacion, activo, suspendido o baja') + ' }}')], {'limit': 100}),
    ('ver_planes', 'Lista todos los planes de internet con velocidad de bajada y subida, precio mensual (IVA incluido), costo de instalación y si está activo.',
     'ml_planes', [], {'returnAll': True}),
    ('facturas_de_cliente', 'Lista las facturas de un cliente por su id numérico (cliente_id). Devuelve folio, periodo, total, estado, vencimiento y pago.',
     'ml_facturas', [('cliente_id', 'eq', '{{ ' + ai('cliente_id', 'Id numérico del cliente', 'number') + ' }}')], {'limit': 24, 'desc': True}),
    ('facturas_por_estado', 'Lista facturas por estado: pendiente, pagada, vencida o cancelada. Útil para cartera vencida y cobranza.',
     'ml_facturas', [('estado', 'eq', '{{ ' + ai('estado', 'Estado de la factura: pendiente, pagada, vencida o cancelada') + ' }}')], {'limit': 100, 'desc': True}),
    ('tickets_recientes', 'Lista los 50 tickets de soporte más recientes con cliente_id, asunto, categoría, prioridad, estado y asignado.',
     'ml_tickets', [], {'limit': 50, 'desc': True}),
    ('ver_inventario', 'Lista el inventario de equipos: tipo, marca, modelo, serie, MAC, cantidad, estado, cliente asignado y ubicación.',
     'ml_inventario', [], {'limit': 200}),
    ('ver_prospectos', 'Lista los prospectos de venta del CRM con etapa, origen, zona, valor estimado y próximo contacto.',
     'ml_prospectos', [], {'limit': 100, 'desc': True}),
    ('catalogo_cuentas', 'Devuelve el catálogo de cuentas contables (código, nombre, tipo y naturaleza).',
     'ml_cuentas', [], {'returnAll': True}),
]
TICKET_COLS = [
    ('folio', 'string', "TK-{{ $now.setZone('America/Merida').toFormat('yyMMddHHmmss') }}"),
    ('cliente_id', 'number', '{{ ' + ai('cliente_id', 'Id numérico del cliente', 'number') + ' }}'),
    ('asunto', 'string', '{{ ' + ai('asunto', 'Asunto corto del ticket') + ' }}'),
    ('descripcion', 'string', '{{ ' + ai('descripcion', 'Descripción detallada del problema') + ' }}'),
    ('categoria', 'string', '{{ ' + ai('categoria', 'Una de: sin_servicio, lentitud, intermitencia, instalacion, cambio_plan, facturacion, otro') + ' }}'),
    ('prioridad', 'string', '{{ ' + ai('prioridad', 'Una de: baja, media, alta, urgente') + ' }}'),
    ('estado', 'string', None),
    ('asignado_a', 'number', '{{ ' + ai('asignado_a', 'Id numérico del empleado asignado, 0 si no se sabe', 'number') + ' }}'),
]
TICKET_DESC = 'Crea un ticket de soporte nuevo en estado abierto. Confirma los datos con el empleado antes de usarla.'

def params_get(tabla, filtros, op, table_ref):
    p = {'resource': 'row', 'operation': 'get', 'dataTableId': table_ref}
    if filtros:
        p['matchType'] = 'allConditions'
        p['filters'] = {'conditions': [{'keyName': k, 'condition': c, 'keyValue': '=' + v} for k, c, v in filtros]}
    if op.get('returnAll'):
        p['returnAll'] = True
    else:
        p['returnAll'] = False
        p['limit'] = op['limit']
    if op.get('desc'):
        p.update(orderBy=True, orderByColumn='createdAt', orderByDirection='DESC')
    return p

def params_ticket(table_ref):
    return {'resource': 'row', 'operation': 'insert', 'dataTableId': table_ref,
            'columns': {'mappingMode': 'defineBelow',
                        'value': {n: ('abierto' if v is None else '=' + v) for n, t, v in TICKET_COLS},
                        'schema': [{'id': n, 'displayName': n, 'required': False, 'defaultMatch': False, 'display': True,
                                    'type': t, 'canBeUsedToMatch': True} for n, t, v in TICKET_COLS]}}

# 1) Config del Agente
def ref_id(t):
    return {'__rl': True, 'mode': 'id', 'value': TABLE_IDS.get(t, ''), 'cachedResultName': t}
def node_tool(name, desc, params):
    return {'type': 'node', 'name': name, 'description': desc,
            'node': {'nodeType': 'n8n-nodes-base.dataTableTool', 'nodeTypeVersion': 1.1, 'nodeParameters': params}}
agent_tools = [node_tool(n, d, params_get(t, f, o, ref_id(t))) for n, d, t, f, o in HERRAMIENTAS]
agent_tools.append(node_tool('crear_ticket', TICKET_DESC, params_ticket(ref_id('ml_tickets'))))
(R/'n8n/asistente.agent.json').write_text(json.dumps({'instructions': INSTR, 'tools': agent_tools}, ensure_ascii=False, indent=1))

# 2) Flujo puente de WhatsApp (mismo prompt y herramientas, dentro de un nodo AI Agent)
def ref_name(t):
    return {'__rl': True, 'mode': 'name', 'value': t}
def ts_tool(var, name, desc, params):
    return ("const %s = tool({ type: 'n8n-nodes-base.dataTableTool', version: 1.1, config: { name: %s, parameters: %s } });\n"
            % (var, json.dumps(name), json.dumps(dict(params, descriptionType='manual', toolDescription=desc), ensure_ascii=False)))
tool_code, tool_vars = '', []
for i, (n, d, t, f, o) in enumerate(HERRAMIENTAS + [('crear_ticket', TICKET_DESC, None, None, None)]):
    var = 'h%d' % i
    p = params_ticket(ref_name('ml_tickets')) if n == 'crear_ticket' else params_get(t, f, o, ref_name(t))
    tool_code += ts_tool(var, n, d, p)
    tool_vars.append(var)
tpl = (R/'n8n/whatsapp-asistente.workflow.tpl.ts').read_text()
code = (tpl.replace("'__INSTRUCCIONES__'", json.dumps(INSTR, ensure_ascii=False))
           .replace("'__IDENTIFICAR_JS__'", json.dumps((R/'n8n/identificar.js').read_text(), ensure_ascii=False))
           .replace('/*__HERRAMIENTAS__*/', tool_code)
           .replace('/*__LISTA_HERRAMIENTAS__*/', ', '.join(tool_vars)))
(R/'n8n/whatsapp-asistente.workflow.ts').write_text(code)

# 3) Recordatorios de cobro
tpl = (R/'n8n/whatsapp-recordatorios.workflow.tpl.ts').read_text()
(R/'n8n/whatsapp-recordatorios.workflow.ts').write_text(
    tpl.replace("'__RECORDATORIOS_JS__'", json.dumps((R/'n8n/recordatorios.js').read_text(), ensure_ascii=False)))
print('ok asistente y whatsapp')

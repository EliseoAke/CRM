import { workflow, node, trigger, sticky, expr, placeholder, newCredential } from '@n8n/workflow-sdk';

const cadaDia = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.3,
  config: { name: 'Todos los días 9:00', parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 9, triggerAtMinute: 0 }] } } },
  output: [{}]
});

const leerFacturas = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Leer facturas por cobrar', parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'ml_facturas' },
    matchType: 'allConditions', filters: { conditions: [{ keyName: 'estado', condition: 'neq', keyValue: 'pagada' }, { keyName: 'estado', condition: 'neq', keyValue: 'cancelada' }] }, returnAll: true } },
  output: [{ id: 3, folio: 'F-0003', cliente_id: 1, total: 499, fecha_vencimiento: '2026-12-01', estado: 'pendiente' }]
});

const leerClientes = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Leer clientes', executeOnce: true, parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'ml_clientes' }, returnAll: true } },
  output: [{ id: 1, nombre: 'María Pérez', telefono: '9991234567', estado: 'activo' }]
});

const leerMensajes = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Leer mensajes enviados', executeOnce: true, alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'ml_mensajes' }, returnAll: true } },
  output: [{ id: 1, factura_id: 2, tipo: 'emitida', estado: 'enviado' }]
});

const preparar = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Preparar recordatorios', executeOnce: true, parameters: { mode: 'runOnceForAllItems', jsCode: "// Decide qué recordatorio de WhatsApp le toca hoy a cada factura sin pagar.\n// Cada factura recibe cada tipo de aviso una sola vez (se revisa ml_mensajes).\nconst PLANTILLAS = {\n  emitida: 'mayalink_factura_emitida',\n  por_vencer: 'mayalink_pago_por_vencer',\n  vencida: 'mayalink_pago_vencido',\n  suspension: 'mayalink_servicio_suspendido',\n};\nconst IDIOMA = 'es_MX';\nconst hoy = $now.setZone('America/Merida');\nconst HOY = hoy.toISODate();\nconst MANANA = hoy.plus({ days: 1 }).toISODate();\nconst dia = s => (s ? String(s).slice(0, 10) : '');\nconst fecha = s => (s ? dia(s).split('-').reverse().join('/') : '');\nconst tel = t => { let d = String(t || '').replace(/\\D/g, ''); if (d.length === 10) d = '52' + d; return d.length >= 11 ? d : ''; };\n\nconst clientes = {};\nfor (const c of $('Leer clientes').all().map(i => i.json)) if (c.id !== undefined) clientes[c.id] = c;\nconst enviados = new Set($('Leer mensajes enviados').all().map(i => i.json)\n  .filter(m => m.id !== undefined && m.estado === 'enviado').map(m => m.factura_id + ':' + m.tipo));\nconst porCobrar = $('Leer facturas por cobrar').all().map(i => i.json);\n// Un cliente suspendido recibe un solo aviso de suspensión mientras tenga adeudos sin pagar.\nconst idsPorCobrar = new Set(porCobrar.map(f => f.id));\nconst suspendidosAvisados = new Set($('Leer mensajes enviados').all().map(i => i.json)\n  .filter(m => m.estado === 'enviado' && m.tipo === 'suspension' && idsPorCobrar.has(m.factura_id)).map(m => m.cliente_id));\nconst out = [];\nfor (const f of porCobrar) {\n  if (f.id === undefined || f.estado === 'pagada' || f.estado === 'cancelada') continue;\n  const c = clientes[f.cliente_id];\n  if (!c || c.estado === 'baja') continue;\n  const telefono = tel(c.telefono);\n  if (!telefono) continue;\n  const venc = dia(f.fecha_vencimiento);\n  let tipo = 'emitida';\n  if (c.estado === 'suspendido') tipo = 'suspension';\n  else if (venc && venc < HOY) tipo = 'vencida';\n  else if (venc === MANANA) tipo = 'por_vencer';\n  if (enviados.has(f.id + ':' + tipo)) continue;\n  if (tipo === 'suspension') { if (suspendidosAvisados.has(c.id)) continue; suspendidosAvisados.add(c.id); }\n  out.push({ json: {\n    factura_id: f.id, cliente_id: c.id, tipo, telefono,\n    plantilla: PLANTILLAS[tipo] + '|' + IDIOMA,\n    nombre: String(c.nombre || 'cliente').split(' ')[0],\n    folio: String(f.folio || ''),\n    total: '$' + Number(f.total || 0).toFixed(2),\n    vence: fecha(f.fecha_vencimiento),\n  } });\n}\nreturn out;\n" } },
  output: [{ factura_id: 3, cliente_id: 1, tipo: 'emitida', telefono: '529991234567', plantilla: 'mayalink_factura_emitida|es_MX', nombre: 'María', folio: 'F-0003', total: '$499.00', vence: '01/12/2026' }]
});

const enviar = node({
  type: 'n8n-nodes-base.whatsApp', version: 1.1,
  config: { name: 'Enviar plantilla de WhatsApp', onError: 'continueRegularOutput', parameters: { resource: 'message', operation: 'sendTemplate',
      phoneNumberId: placeholder('Phone Number ID de WhatsApp Business'),
      recipientPhoneNumber: expr('{{ $json.telefono }}'),
      template: expr('{{ $json.plantilla }}'),
      components: { component: [{ type: 'body', bodyParameters: { parameter: [
        { type: 'text', text: expr('{{ $json.nombre }}') },
        { type: 'text', text: expr('{{ $json.folio }}') },
        { type: 'text', text: expr('{{ $json.total }}') },
        { type: 'text', text: expr('{{ $json.vence }}') }
      ] } }] } },
    credentials: { whatsAppApi: newCredential('WhatsApp Mayalink') } },
  output: [{ messages: [{ id: 'wamid.ABC' }] }]
});

const registrar = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Registrar envío', parameters: { resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'name', value: 'ml_mensajes' },
    columns: { mappingMode: 'defineBelow', value: {
        factura_id: expr("{{ $('Preparar recordatorios').item.json.factura_id }}"),
        cliente_id: expr("{{ $('Preparar recordatorios').item.json.cliente_id }}"),
        tipo: expr("{{ $('Preparar recordatorios').item.json.tipo }}"),
        telefono: expr("{{ $('Preparar recordatorios').item.json.telefono }}"),
        estado: expr("{{ $json.messages ? 'enviado' : 'error' }}"),
        wa_id: expr("{{ $json.messages ? $json.messages[0].id : '' }}"),
        detalle: expr("{{ $json.error ? JSON.stringify($json.error).slice(0, 500) : '' }}")
      },
      schema: [
        { id: 'factura_id', displayName: 'factura_id', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
        { id: 'cliente_id', displayName: 'cliente_id', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
        { id: 'tipo', displayName: 'tipo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        { id: 'telefono', displayName: 'telefono', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        { id: 'estado', displayName: 'estado', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        { id: 'wa_id', displayName: 'wa_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
        { id: 'detalle', displayName: 'detalle', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
      ] }, options: {} } },
  output: [{ id: 1 }]
});

const nota = sticky('## Recordatorios de cobro por WhatsApp\nCorre a las 9:00, después de Facturación (6:00) y Cobranza (7:00). A cada factura sin pagar le manda **una sola vez** el aviso que le toque:\n\n| tipo | cuándo | plantilla de Meta |\n|---|---|---|\n| emitida | primera vez que se ve la factura | mayalink_factura_emitida |\n| por_vencer | un día antes del vencimiento | mayalink_pago_por_vencer |\n| vencida | ya pasó la fecha límite | mayalink_pago_vencido |\n| suspension | el cliente está suspendido | mayalink_servicio_suspendido |\n\nLas 4 plantillas usan las variables {{1}} nombre, {{2}} folio, {{3}} total, {{4}} fecha de vencimiento, en idioma es_MX. Cada envío queda en **ml_mensajes**; los que fallan se reintentan al día siguiente.', [], { color: 5 });

export default workflow('mayalink-whatsapp-recordatorios', 'Mayalink · Recordatorios WhatsApp')
  .add(cadaDia).to(leerFacturas).to(leerClientes).to(leerMensajes).to(preparar).to(enviar).to(registrar)
  .add(nota);

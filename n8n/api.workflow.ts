import { workflow, node, trigger, sticky, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

const APP_URL = 'https://raw.githubusercontent.com/EliseoAke/CRM/main/app/index.html';
const validarJs = "// Valida la solicitud de la app y la normaliza para el resto del workflow.\n// Cuerpo esperado: { token, action: list|create|update|delete, table, id?, data? }\nconst TOKEN = '__MAYALINK_TOKEN__';\nconst TYPES = {\"clientes\": {\"nombre\": \"text\", \"telefono\": \"tel\", \"email\": \"email\", \"direccion\": \"textarea\", \"zona\": \"text\", \"rfc\": \"text\", \"plan_id\": \"ref\", \"estado\": \"select\", \"fecha_alta\": \"date\", \"dia_corte\": \"number\", \"ip_asignada\": \"text\", \"coordenadas\": \"text\", \"notas\": \"textarea\"}, \"planes\": {\"nombre\": \"text\", \"tipo\": \"select\", \"bajada_mbps\": \"number\", \"subida_mbps\": \"number\", \"precio\": \"money\", \"costo_instalacion\": \"money\", \"activo\": \"bool\"}, \"prospectos\": {\"nombre\": \"text\", \"telefono\": \"tel\", \"email\": \"email\", \"zona\": \"text\", \"plan_id\": \"ref\", \"etapa\": \"select\", \"origen\": \"select\", \"valor_estimado\": \"money\", \"proximo_contacto\": \"date\", \"notas\": \"textarea\"}, \"facturas\": {\"folio\": \"text\", \"cliente_id\": \"ref\", \"periodo\": \"text\", \"concepto\": \"text\", \"fecha_emision\": \"date\", \"fecha_vencimiento\": \"date\", \"subtotal\": \"money\", \"iva\": \"money\", \"total\": \"money\", \"estado\": \"select\", \"fecha_pago\": \"date\", \"metodo_pago\": \"select\"}, \"movimientos\": {\"fecha\": \"date\", \"tipo\": \"select\", \"categoria\": \"select\", \"descripcion\": \"text\", \"monto\": \"money\", \"cuenta\": \"select\", \"referencia\": \"text\"}, \"cuentas\": {\"codigo\": \"text\", \"nombre\": \"text\", \"tipo\": \"select\", \"naturaleza\": \"select\"}, \"asientos\": {\"fecha\": \"date\", \"concepto\": \"text\", \"cuenta_cargo\": \"cuenta\", \"cuenta_abono\": \"cuenta\", \"monto\": \"money\", \"referencia\": \"text\"}, \"empleados\": {\"nombre\": \"text\", \"puesto\": \"text\", \"departamento\": \"select\", \"telefono\": \"tel\", \"email\": \"email\", \"fecha_ingreso\": \"date\", \"salario_mensual\": \"money\", \"curp\": \"text\", \"nss\": \"text\", \"estado\": \"select\"}, \"nomina\": {\"periodo\": \"text\", \"empleado_id\": \"ref\", \"salario_base\": \"money\", \"bonos\": \"money\", \"deducciones\": \"money\", \"neto\": \"money\", \"estado\": \"select\", \"fecha_pago\": \"date\"}, \"inventario\": {\"tipo\": \"select\", \"marca\": \"text\", \"modelo\": \"text\", \"serie\": \"text\", \"mac\": \"text\", \"cantidad\": \"number\", \"estado\": \"select\", \"cliente_id\": \"ref\", \"ubicacion\": \"text\", \"costo\": \"money\", \"fecha_compra\": \"date\"}, \"tickets\": {\"folio\": \"text\", \"cliente_id\": \"ref\", \"asunto\": \"text\", \"descripcion\": \"textarea\", \"categoria\": \"select\", \"prioridad\": \"select\", \"estado\": \"select\", \"asignado_a\": \"ref\", \"fecha_cierre\": \"date\", \"solucion\": \"textarea\"}};\nconst ACTIONS = ['list', 'create', 'update', 'delete'];\n\nconst req = $input.first().json;\nconst b = req.body || {};\nconst fail = (status, error) => [{ json: { ok: false, status, error } }];\n\nif (!b.token || b.token !== TOKEN) return fail(401, 'Clave de acceso inv\u00e1lida');\nif (!ACTIONS.includes(b.action)) return fail(400, 'Acci\u00f3n no v\u00e1lida: ' + b.action);\nif (!TYPES[b.table]) return fail(400, 'Tabla no v\u00e1lida: ' + b.table);\n\nconst id = b.id === undefined || b.id === null || b.id === '' ? null : Number(b.id);\nif ((b.action === 'update' || b.action === 'delete') && !Number.isInteger(id)) return fail(400, 'Falta el id del registro');\n\nconst data = {};\nconst tipos = TYPES[b.table];\nfor (const [k, v] of Object.entries(b.data || {})) {\n  const t = tipos[k];\n  if (!t) continue; // ignora columnas desconocidas\n  if (['number', 'money', 'ref'].includes(t)) {\n    const n = v === '' || v === null || v === undefined ? null : Number(v);\n    data[k] = Number.isFinite(n) ? n : null;\n  } else if (t === 'bool') data[k] = v === true || v === 'true' || v === 1;\n  else data[k] = v === null || v === undefined ? '' : String(v).slice(0, 5000);\n}\nif (b.action !== 'list' && b.action !== 'delete' && !Object.keys(data).length) return fail(400, 'Sin datos para guardar');\n\nreturn [{ json: { ok: true, action: b.action, table: 'ml_' + b.table, id, data } }];\n";

const tablaDinamica = { __rl: true, mode: 'name', value: expr("{{ $('Validar solicitud').item.json.table }}") };
const filtroPorId = { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr("{{ $('Validar solicitud').item.json.id }}") }] };
const headersJson = { entries: [{ name: 'Cache-Control', value: 'no-store' }] };

const paginaWebhook = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'GET /mayalink (app web)', parameters: { httpMethod: 'GET', path: 'mayalink', responseMode: 'responseNode', options: {} } },
  output: [{ headers: {}, query: {} }]
});

const construirPagina = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.2,
  config: { name: 'Descargar app (GitHub)', parameters: { method: 'GET', url: APP_URL,
    options: { response: { response: { responseFormat: 'text', outputPropertyName: 'html' } } } } },
  output: [{ html: '<html></html>' }]
});

const responderPagina = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Responder HTML', parameters: { respondWith: 'text', responseBody: expr('{{ $json.html }}'),
    options: { responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }] } } } }
});

const apiWebhook = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'POST /mayalink/api', parameters: { httpMethod: 'POST', path: 'mayalink/api', responseMode: 'responseNode', options: {} } },
  output: [{ body: { token: 'x', action: 'list', table: 'clientes' } }]
});

const validar = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Validar solicitud', parameters: { mode: 'runOnceForAllItems', jsCode: validarJs } },
  output: [{ ok: true, action: 'list', table: 'ml_clientes', id: null, data: {} }]
});

const esValida = ifElse({
  version: 2.2,
  config: { name: '¿Solicitud válida?', parameters: { conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: expr('{{ $json.ok }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and' } } }
});

const responderError = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Responder error', parameters: { respondWith: 'json',
    responseBody: expr('{{ JSON.stringify({ ok: false, error: $json.error }) }}'),
    options: { responseCode: expr('{{ $json.status }}') } } }
});

const reglaList = { outputKey: 'list', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'list' }], combinator: 'and' } };
const reglaCreate = { outputKey: 'create', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'create' }], combinator: 'and' } };
const reglaUpdate = { outputKey: 'update', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'update' }], combinator: 'and' } };
const reglaDelete = { outputKey: 'delete', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'delete' }], combinator: 'and' } };

const porAccion = switchCase({
  version: 3.2,
  config: { name: 'Según acción', parameters: { rules: { values: [reglaList, reglaCreate, reglaUpdate, reglaDelete] }, options: {} } }
});

const listar = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Leer filas', alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: tablaDinamica, returnAll: true } },
  output: [{ id: 1, nombre: 'Ejemplo' }]
});

const empaquetar = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Empaquetar lista', parameters: { mode: 'runOnceForAllItems',
    jsCode: 'const rows = $input.all().map(i => i.json).filter(r => r && r.id !== undefined);\nreturn [{ json: { ok: true, rows } }];' } },
  output: [{ ok: true, rows: [] }]
});

const responderLista = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Responder lista', parameters: { respondWith: 'firstIncomingItem', options: { responseHeaders: headersJson } } }
});

const datosCrear = node({
  type: 'n8n-nodes-base.set', version: 3.4,
  config: { name: 'Datos a insertar', parameters: { mode: 'raw', jsonOutput: expr('{{ JSON.stringify($json.data) }}'), options: {} } },
  output: [{ nombre: 'Ejemplo' }]
});

const insertar = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Insertar fila', parameters: { resource: 'row', operation: 'insert', dataTableId: tablaDinamica,
    columns: { mappingMode: 'autoMapInputData', value: {}, schema: [] }, options: {} } },
  output: [{ id: 1, nombre: 'Ejemplo' }]
});

const responderFila = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Responder fila creada', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify({ ok: true, row: $json }) }}'), options: { responseHeaders: headersJson } } }
});

const datosActualizar = node({
  type: 'n8n-nodes-base.set', version: 3.4,
  config: { name: 'Datos a actualizar', parameters: { mode: 'raw', jsonOutput: expr('{{ JSON.stringify($json.data) }}'), options: {} } },
  output: [{ estado: 'activo' }]
});

const actualizar = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Actualizar fila', alwaysOutputData: true, parameters: { resource: 'row', operation: 'update', dataTableId: tablaDinamica,
    matchType: 'allConditions', filters: filtroPorId, columns: { mappingMode: 'autoMapInputData', value: {}, schema: [] }, options: {} } },
  output: [{ id: 1, estado: 'activo' }]
});

const responderActualizada = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Responder fila actualizada', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify({ ok: true, row: $json }) }}'), options: { responseHeaders: headersJson } } }
});

const borrar = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Eliminar fila', alwaysOutputData: true, parameters: { resource: 'row', operation: 'deleteRows', dataTableId: tablaDinamica,
    matchType: 'allConditions', filters: filtroPorId, options: {} } },
  output: [{ id: 1 }]
});

const responderBorrado = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Responder eliminado', parameters: { respondWith: 'json', responseBody: '{ "ok": true }', options: {} } }
});

const nota = sticky('## Mayalink ERP · API\n**GET /webhook/mayalink** sirve la app web (descarga `app/index.html` de la rama main del repo EliseoAke/CRM).\n**POST /webhook/mayalink/api** recibe `{ token, action, table, id, data }` y lee/escribe las Data Tables `ml_*`.\n\nLa clave de acceso está en el nodo **Validar solicitud** (constante `TOKEN`). Cámbiala ahí si se filtra.', [], { color: 4 });

export default workflow('mayalink-api', 'Mayalink · API y app web')
  .add(paginaWebhook).to(construirPagina).to(responderPagina)
  .add(apiWebhook).to(validar).to(esValida
    .onTrue(porAccion
      .onCase(0, listar.to(empaquetar).to(responderLista))
      .onCase(1, datosCrear.to(insertar).to(responderFila))
      .onCase(2, datosActualizar.to(actualizar).to(responderActualizada))
      .onCase(3, borrar.to(responderBorrado)))
    .onFalse(responderError))
  .add(nota);

import { workflow, node, trigger, sticky, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

const APP_URL = 'https://raw.githubusercontent.com/EliseoAke/CRM/main/app/index.html';
const validarJs = '__VALIDAR_JS__';

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

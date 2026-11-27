import { workflow, node, trigger, sticky, expr, ifElse, languageModel, memory, tool, newCredential } from '@n8n/workflow-sdk';

const entrante = trigger({
  type: 'n8n-nodes-base.whatsAppTrigger', version: 1,
  config: { name: 'Mensaje de WhatsApp', parameters: { updates: ['messages'], options: { messageStatusUpdates: ['failed'] } },
    credentials: { whatsAppTriggerApi: newCredential('WhatsApp Trigger Mayalink') } },
  output: [{ metadata: { phone_number_id: '123456789' }, contacts: [{ wa_id: '5219991234567' }], messages: [{ from: '5219991234567', type: 'text', text: { body: '¿Cómo registro un pago?' } }] }]
});

const leerEmpleados = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Leer empleados activos', executeOnce: true, parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'ml_empleados' },
    matchType: 'allConditions', filters: { conditions: [{ keyName: 'estado', condition: 'eq', keyValue: 'activo' }] }, returnAll: true } },
  output: [{ id: 1, nombre: 'Ana López', puesto: 'Técnica', departamento: 'tecnico', telefono: '9991234567', estado: 'activo' }]
});

const identificar = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Identificar empleado', parameters: { mode: 'runOnceForAllItems', jsCode: '__IDENTIFICAR_JS__' } },
  output: [{ de: '5219991234567', texto: '¿Cómo registro un pago?', phone_number_id: '123456789', autorizado: true, empleado: 'Ana López', puesto: 'Técnica', departamento: 'tecnico' }]
});

const esEmpleado = ifElse({
  version: 2.2,
  config: { name: '¿Es empleado?', parameters: { conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: expr('{{ $json.autorizado }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and' } } }
});

const modelo = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic', version: 1.6,
  config: { name: 'Claude', parameters: { model: { __rl: true, mode: 'list', value: 'claude-sonnet-5-5', cachedResultName: 'Claude Sonnet 5.5' }, options: { maxTokensToSample: 1500 } },
    credentials: { anthropicApi: newCredential('Anthropic') } }
});

const memoria = memory({
  type: '@n8n/n8n-nodes-langchain.memoryBufferWindow', version: 1.4,
  config: { name: 'Memoria por empleado', parameters: { sessionIdType: 'customKey', sessionKey: expr("{{ 'wa-' + $('Identificar empleado').item.json.de }}"), contextWindowLength: 10 } }
});

/*__HERRAMIENTAS__*/
const asistente = node({
  type: '@n8n/n8n-nodes-langchain.agent', version: 3.1,
  config: { name: 'Asistente Mayalink', parameters: {
      promptType: 'define',
      text: expr('Empleado: {{ $json.empleado }} ({{ $json.puesto }}, departamento {{ $json.departamento }})\nMensaje: {{ $json.texto }}'),
      options: { systemMessage: '__INSTRUCCIONES__', maxIterations: 8 } },
    subnodes: { model: modelo, memory: memoria, tools: [/*__LISTA_HERRAMIENTAS__*/] } },
  output: [{ output: 'Para registrar un pago entra a Facturación y usa el botón Cobrar.' }]
});

const responder = node({
  type: 'n8n-nodes-base.whatsApp', version: 1.1,
  config: { name: 'Responder al empleado', parameters: { resource: 'message', operation: 'send',
      phoneNumberId: expr("{{ $('Identificar empleado').item.json.phone_number_id }}"),
      recipientPhoneNumber: expr("{{ $('Identificar empleado').item.json.de }}"),
      messageType: 'text', textBody: expr('{{ $json.output.slice(0, 4000) }}') },
    credentials: { whatsAppApi: newCredential('WhatsApp Mayalink') } }
});

const noAutorizado = node({
  type: 'n8n-nodes-base.whatsApp', version: 1.1,
  config: { name: 'Responder a no empleados', parameters: { resource: 'message', operation: 'send',
      phoneNumberId: expr('{{ $json.phone_number_id }}'),
      recipientPhoneNumber: expr('{{ $json.de }}'),
      messageType: 'text', textBody: 'Hola, gracias por escribir a Mayalink. Este número atiende al personal interno. Para soporte o pagos, comunícate a nuestras oficinas y con gusto te ayudamos.' },
    credentials: { whatsAppApi: newCredential('WhatsApp Mayalink') } }
});

const nota = sticky('## Asistente por WhatsApp\nLos empleados escriben al número de WhatsApp Business de Mayalink y el asistente les responde.\n\n- Solo responde a números registrados en **RRHH > Empleados** con estado activo (campo teléfono).\n- Usa el mismo prompt y las mismas herramientas que el Agente "Asistente Mayalink" (se generan desde `scripts/build.py`).\n- Recuerda la conversación de cada empleado (últimos 10 mensajes).', [], { color: 4 });

export default workflow('mayalink-whatsapp-asistente', 'Mayalink · Asistente por WhatsApp')
  .add(entrante).to(leerEmpleados).to(identificar)
  .to(esEmpleado.onTrue(asistente.to(responder)).onFalse(noAutorizado))
  .add(nota);

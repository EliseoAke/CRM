import { workflow, node, trigger, sticky, expr, ifElse, languageModel, memory, tool, newCredential } from '@n8n/workflow-sdk';

const entrada = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'POST /mayalink/chat', parameters: { httpMethod: 'POST', path: 'mayalink/chat', responseMode: 'responseNode', options: {} } },
  output: [{ body: { token: 'x', mensaje: '¿Cómo registro un pago?', sesion: 'crm-abc', modulo: 'facturas' } }]
});

const validar = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Validar chat', parameters: { mode: 'runOnceForAllItems', jsCode: '__VALIDAR_CHAT_JS__' } },
  output: [{ ok: true, mensaje: '¿Cómo registro un pago?', sesion: 'crm-abc', modulo: 'facturas' }]
});

const esValido = ifElse({
  version: 2.2,
  config: { name: '¿Clave válida?', parameters: { conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and' } } }
});

const modelo = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic', version: 1.6,
  config: { name: 'Claude', parameters: { model: { __rl: true, mode: 'list', value: 'claude-sonnet-5-5', cachedResultName: 'Claude Sonnet 5.5' }, options: { maxTokensToSample: 1500 } },
    credentials: { anthropicApi: newCredential('Anthropic') } }
});

const memoria = memory({
  type: '@n8n/n8n-nodes-langchain.memoryBufferWindow', version: 1.4,
  config: { name: 'Memoria por conversación', parameters: { sessionIdType: 'customKey', sessionKey: expr("{{ $('Validar chat').item.json.sesion }}"), contextWindowLength: 10 } }
});

/*__HERRAMIENTAS__*/
const asistente = node({
  type: '@n8n/n8n-nodes-langchain.agent', version: 3.1,
  config: { name: 'Asistente Mayalink', onError: 'continueRegularOutput', parameters: {
      promptType: 'define',
      text: expr('[Escribe desde el ERP web, módulo: {{ $json.modulo }}]\n{{ $json.mensaje }}'),
      options: { systemMessage: '__INSTRUCCIONES__', maxIterations: 8 } },
    subnodes: { model: modelo, memory: memoria, tools: [/*__LISTA_HERRAMIENTAS__*/] } },
  output: [{ output: 'Para registrar un pago entra a Facturación y usa el botón Cobrar.' }]
});

const responder = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Responder al chat', parameters: { respondWith: 'json',
    responseBody: expr("{{ JSON.stringify($json.output ? { ok: true, respuesta: $json.output } : { ok: false, error: 'El asistente tuvo un problema. Intenta de nuevo en un momento.' }) }}"),
    options: { responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }] } } } }
});

const responderError = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Responder error', parameters: { respondWith: 'json',
    responseBody: expr('{{ JSON.stringify({ ok: false, error: $json.error }) }}'),
    options: { responseCode: expr('{{ $json.status }}') } } }
});

const nota = sticky('## Asistente dentro del ERP\nLa ventana de chat de la app web manda `{ token, mensaje, sesion, modulo }` a `POST /webhook/mayalink/chat`.\n\n- Usa la misma clave de acceso que la API (constante `TOKEN` en *Validar chat*).\n- Mismo prompt y herramientas que el Agente "Asistente Mayalink" (generados por `scripts/build.py`).\n- Recuerda los últimos 10 mensajes de cada conversación.', [], { color: 4 });

export default workflow('mayalink-chat', 'Mayalink · Asistente en el CRM')
  .add(entrada).to(validar)
  .to(esValido.onTrue(asistente.to(responder)).onFalse(responderError))
  .add(nota);

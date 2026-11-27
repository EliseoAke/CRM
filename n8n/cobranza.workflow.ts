import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

const suspenderJs = "// Suspende a los clientes activos con una factura sin pagar vencida hace m\u00e1s de DIAS_GRACIA d\u00edas.\n// (No depende de que la rama de vencimientos haya corrido antes.)\nconst DIAS_GRACIA = 3;\nconst limite = $now.setZone('America/Merida').minus({ days: DIAS_GRACIA }).toISODate();\nconst porCobrar = $('Leer facturas por cobrar').all().map(i => i.json)\n  .filter(f => f.id !== undefined && ['pendiente', 'vencida'].includes(f.estado));\nconst activos = $('Leer clientes activos').all().map(i => i.json).filter(c => c.id !== undefined);\nreturn activos\n  .filter(c => porCobrar.some(f => f.cliente_id === c.id && f.fecha_vencimiento && String(f.fecha_vencimiento) < limite))\n  .map(c => ({ json: { id: c.id, nombre: c.nombre } }));";

const cadaDia = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.3,
  config: { name: 'Todos los días 7:00', parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 7, triggerAtMinute: 0 }] } } },
  output: [{}]
});

const leerPendientes = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Leer facturas pendientes', parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'ml_facturas' },
    matchType: 'allConditions', filters: { conditions: [{ keyName: 'estado', condition: 'eq', keyValue: 'pendiente' }] }, returnAll: true } },
  output: [{ id: 3, folio: 'F-0003', fecha_vencimiento: '2026-11-01', estado: 'pendiente' }]
});

const soloAtrasadas = node({
  type: 'n8n-nodes-base.filter', version: 2.2,
  config: { name: 'Solo las ya vencidas', parameters: { conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: expr("{{ !!$json.fecha_vencimiento && $json.fecha_vencimiento < $now.setZone('America/Merida').toISODate() }}"), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and' } } },
  output: [{ id: 3, folio: 'F-0003', fecha_vencimiento: '2026-11-01', estado: 'pendiente' }]
});

const marcarVencida = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Marcar como vencida', parameters: { resource: 'row', operation: 'update', dataTableId: { __rl: true, mode: 'name', value: 'ml_facturas' },
    matchType: 'allConditions', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.id }}') }] },
    columns: { mappingMode: 'defineBelow', value: { estado: 'vencida' },
      schema: [{ id: 'estado', displayName: 'estado', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }] }, options: {} } },
  output: [{ id: 3, estado: 'vencida' }]
});

const leerVencidas = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Leer facturas por cobrar', parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'ml_facturas' },
    matchType: 'allConditions', filters: { conditions: [{ keyName: 'estado', condition: 'neq', keyValue: 'pagada' }] }, returnAll: true } },
  output: [{ id: 3, cliente_id: 1, fecha_vencimiento: '2026-11-01', estado: 'vencida' }]
});

const leerActivos = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Leer clientes activos', executeOnce: true, parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'ml_clientes' },
    matchType: 'allConditions', filters: { conditions: [{ keyName: 'estado', condition: 'eq', keyValue: 'activo' }] }, returnAll: true } },
  output: [{ id: 1, nombre: 'María', estado: 'activo' }]
});

const elegir = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Elegir clientes a suspender', executeOnce: true, parameters: { mode: 'runOnceForAllItems', jsCode: suspenderJs } },
  output: [{ id: 1, nombre: 'María' }]
});

const suspender = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Suspender cliente', parameters: { resource: 'row', operation: 'update', dataTableId: { __rl: true, mode: 'name', value: 'ml_clientes' },
    matchType: 'allConditions', filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $json.id }}') }] },
    columns: { mappingMode: 'defineBelow', value: { estado: 'suspendido' },
      schema: [{ id: 'estado', displayName: 'estado', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }] }, options: {} } },
  output: [{ id: 1, estado: 'suspendido' }]
});

const nota = sticky('## Cobranza diaria\n1. Marca como **vencida** cada factura pendiente cuya fecha límite ya pasó.\n2. Cambia a **suspendido** a los clientes activos con una factura vencida hace más de 3 días (constante `DIAS_GRACIA`).\n\nSolo cambia el estado en el ERP: el corte real en el router/OLT sigue siendo manual. Al cobrar desde la app, el cliente se reactiva.', [], { color: 3 });

export default workflow('mayalink-cobranza', 'Mayalink · Cobranza y suspensiones')
  .add(cadaDia).to(leerPendientes).to(soloAtrasadas).to(marcarVencida)
  .add(cadaDia).to(leerVencidas).to(leerActivos).to(elegir).to(suspender)
  .add(nota)
  .group('Vencimientos', [leerPendientes, soloAtrasadas, marcarVencida], { description: 'Facturas pendientes con fecha límite pasada pasan a vencidas' })
  .group('Suspensiones', [leerVencidas, leerActivos, elegir, suspender], { description: 'Suspende clientes con más de 3 días de atraso' });

import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

const calcularJs = "// Genera la factura del mes para cada cliente activo cuyo d\u00eda de corte ya lleg\u00f3\n// y que todav\u00eda no tiene factura (no cancelada) del periodo actual.\nconst IVA = 0.16, DIAS_PARA_PAGAR = 5;\nconst hoy = $now.setZone('America/Merida');\nconst periodo = hoy.toFormat('yyyy-MM');\nconst clientes = $('Leer clientes activos').all().map(i => i.json).filter(c => c.id !== undefined);\nconst planes = $('Leer planes').all().map(i => i.json);\nconst facturas = $('Leer facturas').all().map(i => i.json).filter(f => f.id !== undefined);\nlet folio = facturas.reduce((m, f) => Math.max(m, parseInt(String(f.folio || '').replace(/\\D/g, '')) || 0), 0);\nconst out = [];\nfor (const c of clientes) {\n  const corte = Math.min(28, Math.max(1, Number(c.dia_corte) || 1));\n  if (hoy.day < corte) continue;\n  if (facturas.some(f => f.cliente_id === c.id && f.periodo === periodo && f.estado !== 'cancelada')) continue;\n  const plan = planes.find(p => p.id === c.plan_id);\n  if (!plan || !plan.precio) continue;\n  const total = Number(plan.precio), subtotal = Math.round(total / (1 + IVA) * 100) / 100;\n  folio += 1;\n  out.push({ json: { folio: 'F-' + String(folio).padStart(4, '0'), cliente_id: c.id, periodo,\n    concepto: 'Servicio de internet ' + plan.nombre, fecha_emision: hoy.toISODate(),\n    fecha_vencimiento: hoy.plus({ days: DIAS_PARA_PAGAR }).toISODate(), subtotal,\n    iva: Math.round((total - subtotal) * 100) / 100, total, estado: 'pendiente', fecha_pago: '', metodo_pago: '' } });\n}\nreturn out;";

const polizasJs = "// P\u00f3liza de cada factura: Clientes (105) contra Ingresos (401) e IVA trasladado (208).\nconst out = [];\nfor (const { json: f } of $input.all()) {\n  out.push({ json: { fecha: f.fecha_emision, concepto: 'Factura ' + f.folio, cuenta_cargo: '105', cuenta_abono: '401', monto: f.subtotal, referencia: f.folio } });\n  if (f.iva) out.push({ json: { fecha: f.fecha_emision, concepto: 'IVA factura ' + f.folio, cuenta_cargo: '105', cuenta_abono: '208', monto: f.iva, referencia: f.folio } });\n}\nreturn out;";

const cadaDia = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.3,
  config: { name: 'Todos los días 6:00', parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 6, triggerAtMinute: 0 }] } } },
  output: [{}]
});

const leerClientes = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Leer clientes activos', parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'ml_clientes' },
    matchType: 'allConditions', filters: { conditions: [{ keyName: 'estado', condition: 'eq', keyValue: 'activo' }] }, returnAll: true } },
  output: [{ id: 1, nombre: 'María', plan_id: 1, dia_corte: 5, estado: 'activo' }]
});

const leerPlanes = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Leer planes', executeOnce: true, parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'ml_planes' }, returnAll: true } },
  output: [{ id: 1, nombre: 'Hogar 20', precio: 349 }]
});

const leerFacturas = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Leer facturas', executeOnce: true, alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'ml_facturas' }, returnAll: true } },
  output: [{ id: 1, folio: 'F-0001', cliente_id: 1, periodo: '2026-10', estado: 'pagada' }]
});

const calcular = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Calcular facturas del mes', executeOnce: true, parameters: { mode: 'runOnceForAllItems', jsCode: calcularJs } },
  output: [{ folio: 'F-0002', cliente_id: 1, periodo: '2026-11', concepto: 'Servicio de internet Hogar 20', fecha_emision: '2026-11-05', fecha_vencimiento: '2026-11-10', subtotal: 300.86, iva: 48.14, total: 349, estado: 'pendiente', fecha_pago: '', metodo_pago: '' }]
});

const guardarFacturas = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Guardar facturas', parameters: { resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'name', value: 'ml_facturas' },
    columns: { mappingMode: 'autoMapInputData', value: {}, schema: [] }, options: {} } },
  output: [{ id: 2, folio: 'F-0002', fecha_emision: '2026-11-05', subtotal: 300.86, iva: 48.14 }]
});

const polizas = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Armar pólizas contables', parameters: { mode: 'runOnceForAllItems', jsCode: polizasJs } },
  output: [{ fecha: '2026-11-05', concepto: 'Factura F-0002', cuenta_cargo: '105', cuenta_abono: '401', monto: 300.86, referencia: 'F-0002' }]
});

const guardarPolizas = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Guardar pólizas', parameters: { resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'name', value: 'ml_asientos' },
    columns: { mappingMode: 'autoMapInputData', value: {}, schema: [] }, options: {} } },
  output: [{ id: 1 }]
});

const nota = sticky('## Facturación mensual automática\nCada día a las 6:00 (hora de Mérida) emite la factura del mes a cada cliente **activo** cuyo **día de corte** ya llegó y que aún no tiene factura del periodo. Precio = plan del cliente (IVA incluido). Vence en 5 días. Registra su póliza contable.', [], { color: 5 });

export default workflow('mayalink-facturacion', 'Mayalink · Facturación mensual')
  .add(cadaDia).to(leerClientes).to(leerPlanes).to(leerFacturas).to(calcular).to(guardarFacturas).to(polizas).to(guardarPolizas)
  .add(nota)
  .group('Reunir datos', [leerClientes, leerPlanes, leerFacturas], { description: 'Lee clientes activos, planes y facturas existentes' })
  .group('Emitir facturas', [calcular, guardarFacturas], { description: 'Calcula y guarda las facturas faltantes del mes' })
  .group('Contabilidad', [polizas, guardarPolizas], { description: 'Registra la póliza de cada factura (105 / 401 / 208)' });

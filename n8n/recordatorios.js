// Decide qué recordatorio de WhatsApp le toca hoy a cada factura sin pagar.
// Cada factura recibe cada tipo de aviso una sola vez (se revisa ml_mensajes).
const PLANTILLAS = {
  emitida: 'mayalink_factura_emitida',
  por_vencer: 'mayalink_pago_por_vencer',
  vencida: 'mayalink_pago_vencido',
  suspension: 'mayalink_servicio_suspendido',
};
const IDIOMA = 'es_MX';
const hoy = $now.setZone('America/Merida');
const HOY = hoy.toISODate();
const MANANA = hoy.plus({ days: 1 }).toISODate();
const dia = s => (s ? String(s).slice(0, 10) : '');
const fecha = s => (s ? dia(s).split('-').reverse().join('/') : '');
const tel = t => { let d = String(t || '').replace(/\D/g, ''); if (d.length === 10) d = '52' + d; return d.length >= 11 ? d : ''; };

const clientes = {};
for (const c of $('Leer clientes').all().map(i => i.json)) if (c.id !== undefined) clientes[c.id] = c;
const enviados = new Set($('Leer mensajes enviados').all().map(i => i.json)
  .filter(m => m.id !== undefined && m.estado === 'enviado').map(m => m.factura_id + ':' + m.tipo));
const porCobrar = $('Leer facturas por cobrar').all().map(i => i.json);
// Un cliente suspendido recibe un solo aviso de suspensión mientras tenga adeudos sin pagar.
const idsPorCobrar = new Set(porCobrar.map(f => f.id));
const suspendidosAvisados = new Set($('Leer mensajes enviados').all().map(i => i.json)
  .filter(m => m.estado === 'enviado' && m.tipo === 'suspension' && idsPorCobrar.has(m.factura_id)).map(m => m.cliente_id));
const out = [];
for (const f of porCobrar) {
  if (f.id === undefined || f.estado === 'pagada' || f.estado === 'cancelada') continue;
  const c = clientes[f.cliente_id];
  if (!c || c.estado === 'baja') continue;
  const telefono = tel(c.telefono);
  if (!telefono) continue;
  const venc = dia(f.fecha_vencimiento);
  let tipo = 'emitida';
  if (c.estado === 'suspendido') tipo = 'suspension';
  else if (venc && venc < HOY) tipo = 'vencida';
  else if (venc === MANANA) tipo = 'por_vencer';
  if (enviados.has(f.id + ':' + tipo)) continue;
  if (tipo === 'suspension') { if (suspendidosAvisados.has(c.id)) continue; suspendidosAvisados.add(c.id); }
  out.push({ json: {
    factura_id: f.id, cliente_id: c.id, tipo, telefono,
    plantilla: PLANTILLAS[tipo] + '|' + IDIOMA,
    nombre: String(c.nombre || 'cliente').split(' ')[0],
    folio: String(f.folio || ''),
    total: '$' + Number(f.total || 0).toFixed(2),
    vence: fecha(f.fecha_vencimiento),
  } });
}
return out;

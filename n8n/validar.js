// Valida la solicitud de la app y la normaliza para el resto del workflow.
// Cuerpo esperado: { token, action: list|create|update|delete, table, id?, data? }
const TOKEN = '__MAYALINK_TOKEN__';
const TYPES = __TYPES__;
const ACTIONS = ['list', 'create', 'update', 'delete'];

const req = $input.first().json;
const b = req.body || {};
const fail = (status, error) => [{ json: { ok: false, status, error } }];

if (!b.token || b.token !== TOKEN) return fail(401, 'Clave de acceso inválida');
if (!ACTIONS.includes(b.action)) return fail(400, 'Acción no válida: ' + b.action);
if (!TYPES[b.table]) return fail(400, 'Tabla no válida: ' + b.table);

const id = b.id === undefined || b.id === null || b.id === '' ? null : Number(b.id);
if ((b.action === 'update' || b.action === 'delete') && !Number.isInteger(id)) return fail(400, 'Falta el id del registro');

const data = {};
const tipos = TYPES[b.table];
for (const [k, v] of Object.entries(b.data || {})) {
  const t = tipos[k];
  if (!t) continue; // ignora columnas desconocidas
  if (['number', 'money', 'ref'].includes(t)) {
    const n = v === '' || v === null || v === undefined ? null : Number(v);
    data[k] = Number.isFinite(n) ? n : null;
  } else if (t === 'bool') data[k] = v === true || v === 'true' || v === 1;
  else data[k] = v === null || v === undefined ? '' : String(v).slice(0, 5000);
}
if (b.action !== 'list' && b.action !== 'delete' && !Object.keys(data).length) return fail(400, 'Sin datos para guardar');

return [{ json: { ok: true, action: b.action, table: 'ml_' + b.table, id, data } }];

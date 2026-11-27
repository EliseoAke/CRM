// Valida la clave de acceso y limpia el mensaje que llega desde la ventana de chat del ERP.
const TOKEN = '__MAYALINK_TOKEN__';
const MODULOS = ['tablero', 'crm', 'clientes', 'facturas', 'finanzas', 'contabilidad', 'rrhh', 'inventario', 'soporte', 'config'];
const b = $input.first().json.body || {};
const fail = (status, error) => [{ json: { ok: false, status, error } }];
if (!b.token || b.token !== TOKEN) return fail(401, 'Clave de acceso inválida');
const mensaje = String(b.mensaje || '').trim().slice(0, 2000);
if (!mensaje) return fail(400, 'Escribe un mensaje');
const sesion = String(b.sesion || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'crm-general';
const modulo = MODULOS.includes(b.modulo) ? b.modulo : 'tablero';
return [{ json: { ok: true, mensaje, sesion, modulo } }];

// Toma los mensajes de texto entrantes y revisa si el remitente es un empleado activo
// (compara los últimos 10 dígitos del teléfono registrado en ml_empleados).
const ult10 = t => String(t || '').replace(/\D/g, '').slice(-10);
const empleados = $('Leer empleados activos').all().map(i => i.json).filter(e => e.id !== undefined && ult10(e.telefono).length === 10);
const out = [];
for (const item of $('Mensaje de WhatsApp').all()) {
  const v = item.json || {};
  const m = (v.messages || [])[0];
  if (!m || m.type !== 'text' || !m.text || !m.text.body) continue;
  const de = String(m.from);
  const emp = empleados.find(e => ult10(e.telefono) === ult10(de));
  out.push({ json: {
    de,
    texto: String(m.text.body).slice(0, 2000),
    phone_number_id: v.metadata ? String(v.metadata.phone_number_id) : '',
    autorizado: !!emp,
    empleado: emp ? emp.nombre : '',
    puesto: emp ? emp.puesto : '',
    departamento: emp ? emp.departamento : '',
  } });
}
return out;

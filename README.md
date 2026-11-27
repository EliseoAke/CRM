# Mayalink ERP

ERP/CRM para **Mayalink** (proveedor de servicio de internet), construido sobre **n8n**: las tablas de datos de n8n son la base de datos, los workflows de n8n son la API y las automatizaciones, y una app web de una sola página es la interfaz.

## Módulos

| Módulo | Qué hace |
|---|---|
| **Tablero** | Clientes activos, ingreso recurrente (MRR), cuentas por cobrar, utilidad del mes, tickets, prospectos, nómina e inventario. |
| **CRM · Ventas** | Tablero de prospectos por etapa (nuevo → contactado → visita técnica → cotizado → ganado/perdido). Un clic convierte un prospecto en cliente. |
| **Clientes y planes** | Suscriptores con plan, zona, IP, día de corte y estado (instalación / activo / suspendido / baja). Catálogo de planes con velocidad y precio. |
| **Facturación** | Facturas mensuales por cliente, cobro con método de pago, recibo imprimible y "Generar facturación del mes". |
| **Finanzas** | Ingresos y egresos por categoría, saldo de caja y banco, resultado del mes. |
| **Contabilidad** | Catálogo de cuentas, pólizas automáticas, balanza de comprobación y estado de resultados. |
| **Recursos humanos** | Empleados, nómina mensual y registro del pago. |
| **Inventario** | Routers, ONU, antenas, etc., con existencias por modelo y en qué cliente está instalado cada equipo. |
| **Soporte técnico** | Tickets con folio, prioridad, técnico asignado y solución. |

### Contabilidad automática
Cada operación genera su póliza (cargo / abono):

| Operación | Cargo | Abono |
|---|---|---|
| Emitir factura | 105 Clientes | 401 Ingresos por servicio (subtotal) y 208 IVA trasladado (IVA) |
| Cobrar factura | 101 Caja o 102 Bancos | 105 Clientes |
| Gasto (egreso) | Cuenta de gasto según categoría (501, 601, 602…) | 101 Caja o 102 Bancos |
| Otro ingreso | 101 Caja o 102 Bancos | 402 / 403 según categoría |

Los precios de los planes incluyen IVA (16 %).

## Arquitectura

```
Navegador ──GET /webhook/mayalink──────▶ n8n: "Mayalink · API y app web" ──▶ descarga app/index.html de este repo (rama main)
          ──POST /webhook/mayalink/api─▶ n8n: valida clave ─▶ lee/escribe Data Tables ml_*
n8n (programado 6:00) "Mayalink · Facturación mensual"  ─▶ facturas + pólizas
n8n (programado 7:00) "Mayalink · Cobranza y suspensiones" ─▶ marca vencidas, suspende morosos
n8n (programado 9:00) "Mayalink · Recordatorios WhatsApp" ─▶ plantillas de WhatsApp a clientes ─▶ ml_mensajes
Ventana de chat ──POST /webhook/mayalink/chat─▶ n8n: "Mayalink · Asistente en el CRM" ─▶ valida clave ─▶ Asistente (Claude + Data Tables)
WhatsApp del empleado ─▶ "Mayalink · Asistente por WhatsApp" ─▶ ¿empleado activo? ─▶ Asistente (Claude + Data Tables) ─▶ respuesta
```

- **Data Tables** (n8n): `ml_clientes`, `ml_planes`, `ml_prospectos`, `ml_facturas`, `ml_movimientos`, `ml_cuentas`, `ml_asientos`, `ml_empleados`, `ml_nomina`, `ml_inventario`, `ml_tickets`, `ml_mensajes` (bitácora de WhatsApp).
- **API**: `POST /webhook/mayalink/api` con `{ token, action: "list"|"create"|"update"|"delete", table, id?, data? }`. El servidor valida la clave, la tabla y el tipo de cada campo antes de escribir.
- Los workflows están en la carpeta **Mayalink ERP** de n8n, con zona horaria `America/Merida`.

## Uso

1. Abre `https://<tu-instancia>.app.n8n.cloud/webhook/mayalink`.
2. La URL de la API se llena sola. Escribe la clave de acceso y entra.
3. Sin conexión, abre `app/index.html` en el navegador y elige **modo demostración** para probar con datos de ejemplo (se guardan solo en ese navegador).

**La clave de acceso no está en este repositorio** (es público). Vive en el nodo *Validar solicitud* del workflow de API, constante `TOKEN`. Para cambiarla, edítala ahí y vuelve a entrar en la app con la nueva.

## Automatizaciones

- **Facturación mensual** (diario 6:00): a cada cliente *activo* cuyo día de corte ya llegó y sin factura del mes, le emite factura (precio de su plan, vence en 5 días) y registra la póliza.
- **Cobranza** (diario 7:00): las facturas pendientes con fecha límite pasada pasan a *vencida*; los clientes activos con una factura sin pagar más de 3 días después del vencimiento pasan a *suspendido*. Al registrar el cobro en la app, el cliente se reactiva solo. El corte real en el router/OLT sigue siendo manual.
- **Recordatorios WhatsApp** (diario 9:00): a cada factura sin pagar le manda una sola vez el aviso que le toque (factura emitida, pago por vencer un día antes, pago vencido, servicio suspendido) y lo anota en `ml_mensajes`. Los envíos con error se reintentan al día siguiente.

## Asistente para empleados

El **Asistente Mayalink** explica los módulos y procesos del ERP, consulta clientes, planes, facturas, tickets, inventario, prospectos y el catálogo de cuentas, y levanta tickets de soporte. No ve salarios, nómina, CURP ni NSS, y no modifica facturas ni pagos.

Está disponible de tres formas, con el mismo prompt (`n8n/asistente.instrucciones.md`) y las mismas herramientas (definidas en `scripts/build.py`):

1. **Dentro del ERP web** (activo): botón 💬 abajo a la derecha. Usa la misma clave de acceso que la app, sabe en qué módulo estás y recuerda la conversación hasta que presionas *Nueva*. Lo atiende el workflow "Mayalink · Asistente en el CRM" con los créditos de IA incluidos en n8n. En modo demostración no está disponible.
2. **Agente de n8n** "Asistente Mayalink": para chatear desde n8n. Necesita una credencial de Anthropic (Claude Sonnet 5.5).
3. **Workflow "Mayalink · Asistente por WhatsApp"** (en pausa): los empleados escriben al número de WhatsApp Business. Solo contesta a teléfonos registrados en RRHH > Empleados con estado *activo* (compara los últimos 10 dígitos); a otros números les da un mensaje genérico. Recuerda los últimos 10 mensajes de cada empleado.

## Puesta en marcha de WhatsApp

1. En Meta for Developers crea una app de tipo *Business* con el producto **WhatsApp** y registra el número de Mayalink. Anota el **Phone Number ID**, el **WhatsApp Business Account ID** y genera un **token de acceso permanente** (usuario del sistema).
2. En n8n crea las credenciales **WhatsApp API** (token + Business Account ID) y **WhatsApp OAuth API** para el disparador (App ID y App Secret de la app de Meta). Asígnalas a los nodos de los dos workflows.
3. En *Recordatorios WhatsApp*, nodo *Enviar plantilla de WhatsApp*, escribe el Phone Number ID.
4. En WhatsApp Manager crea y envía a aprobación 4 plantillas de categoría *Utilidad*, idioma **Español (MEX) `es_MX`**, con 4 variables en el cuerpo ({{1}} nombre, {{2}} folio, {{3}} total, {{4}} fecha de vencimiento):

   | Nombre | Texto sugerido |
   |---|---|
   | `mayalink_factura_emitida` | Hola {{1}}, ya está disponible tu factura {{2}} de Mayalink por {{3}}. Fecha límite de pago: {{4}}. ¡Gracias por tu preferencia! |
   | `mayalink_pago_por_vencer` | Hola {{1}}, te recordamos que tu factura {{2}} por {{3}} vence mañana {{4}}. Evita la suspensión de tu servicio pagando a tiempo. |
   | `mayalink_pago_vencido` | Hola {{1}}, tu factura {{2}} por {{3}} venció el {{4}}. Realiza tu pago para evitar la suspensión del servicio. |
   | `mayalink_servicio_suspendido` | Hola {{1}}, tu servicio de internet fue suspendido por falta de pago de la factura {{2}} ({{3}}, vencida el {{4}}). Al pagar se reactiva el mismo día. |

5. Registra el teléfono (10 dígitos) de cada empleado en RRHH > Empleados y los teléfonos de los clientes.
6. Publica los dos workflows. Al publicar el del asistente, n8n registra el webhook en Meta automáticamente.

## Desarrollo

```
schema/modulos.json        modelo de datos (fuente única: tablas, campos, tipos, opciones)
app/index.src.html         código de la app (Alpine.js + Tailwind por CDN, sin compilación)
app/index.html             app generada (no editar a mano)
n8n/validar.js             validación de la API (se inyecta en el workflow)
n8n/asistente.instrucciones.md  prompt del asistente (agente y WhatsApp)
n8n/recordatorios.js, identificar.js  código de los workflows de WhatsApp
n8n/*.tpl.ts               plantillas de workflows que completa build.py
n8n/*.workflow.ts          workflows en el SDK de n8n (generados o de referencia)
n8n/asistente.agent.json   configuración generada del Agente (prompt + herramientas)
scripts/build.py           genera la app, los workflows y la config del asistente
```

Tras editar el esquema o la app: `python3 scripts/build.py`, haz commit y fusiona a `main`; n8n sirve la versión nueva automáticamente. Si cambias la clave, cámbiala también en el nodo *Validar chat* del workflow del asistente. Si agregas un campo, crea también la columna en la Data Table correspondiente y actualiza el nodo *Validar solicitud* (o regenera con `MAYALINK_TOKEN=<clave> python3 scripts/build.py` y copia `.build/api.workflow.ts`).

## Siguientes pasos sugeridos
- Que el asistente reciba fotos o notas de voz de los técnicos.
- Facturación electrónica CFDI 4.0 mediante un PAC.
- Corte y reconexión automáticos en MikroTik / OLT.
- Usuarios con roles (técnico, cobranza, administración) en lugar de una sola clave.

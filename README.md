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
```

- **Data Tables** (n8n): `ml_clientes`, `ml_planes`, `ml_prospectos`, `ml_facturas`, `ml_movimientos`, `ml_cuentas`, `ml_asientos`, `ml_empleados`, `ml_nomina`, `ml_inventario`, `ml_tickets`.
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

## Desarrollo

```
schema/modulos.json        modelo de datos (fuente única: tablas, campos, tipos, opciones)
app/index.src.html         código de la app (Alpine.js + Tailwind por CDN, sin compilación)
app/index.html             app generada (no editar a mano)
n8n/validar.js             validación de la API (se inyecta en el workflow)
n8n/*.workflow.ts          workflows en el SDK de n8n (referencia / reimportación)
scripts/build.py           genera app/index.html y n8n/api.workflow.ts
```

Tras editar el esquema o la app: `python3 scripts/build.py`, haz commit y fusiona a `main`; n8n sirve la versión nueva automáticamente. Si agregas un campo, crea también la columna en la Data Table correspondiente y actualiza el nodo *Validar solicitud* (o regenera con `MAYALINK_TOKEN=<clave> python3 scripts/build.py` y copia `.build/api.workflow.ts`).

## Siguientes pasos sugeridos
- Recordatorios de pago por WhatsApp o correo (requiere conectar la credencial en n8n).
- Facturación electrónica CFDI 4.0 mediante un PAC.
- Corte y reconexión automáticos en MikroTik / OLT.
- Usuarios con roles (técnico, cobranza, administración) en lugar de una sola clave.

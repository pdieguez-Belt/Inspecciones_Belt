# Plan de Migración a Railway — Belt Fotos

> Creado: 24/08/2026
> Estado: **PLANIFICACIÓN**

---

## 1. Análisis de la situación actual

### 1.1 Tabla `vehiculos` en `inspecciones.db`

**¿Qué es?** Es una tabla SQLite que guarda los **datos del vehículo extraídos por OCR de la cédula** cada vez que un inspector sube una inspección. No es una base de datos de inspecciones completa — es un índice de datos vehiculares.

```sql
CREATE TABLE vehiculos (
  dni         TEXT NOT NULL,
  carpeta     TEXT NOT NULL,   -- ej: "36905183-BELT-260716-1069"
  tipo        TEXT,            -- "Moto" o "Auto"
  dominio     TEXT,            -- patente (ej: "A275QSZ")
  marca       TEXT,            -- ej: "HONDA"
  modelo      TEXT,            -- ej: "CB 190R 2.0"
  chasis      TEXT,
  motor       TEXT,
  cuadro      TEXT,
  actualizado TEXT,            -- timestamp ISO (ej: "2026-08-24T19:19:51.431Z")
  PRIMARY KEY (dni, carpeta)
);
```

**Datos clave:**
- **Total registros:** 105
- **Primer registro:** 16/07/2026 (hace ~5 semanas)
- **Último registro:** 24/08/2026 (hoy)
- **Ritmo:** ~3 inspecciones/día hábil
- **Consulta desde el CRM:** el CRM de Belt (también en Railway) lee esta DB para mostrar los datos del vehículo sin tener que parsear el `datos.txt`.

**¿Tiene sentido migrarla?** SÍ — es liviana (105 filas, < 100KB), se adapta perfectamente a PostgreSQL, y al estar ambos servicios (Belt Fotos + CRM) en Railway, la comunicación será mucho más directa que ahora (el CRM tiene que acceder a un archivo SQLite remoto vía red/API).

### 1.2 Almacenamiento de fotos

- **127 carpetas** (una por inspección)
- **~722 MB** total actualmente
- **~5.7 MB promedio** por inspección (~9 fotos comprimidas de 400-800KB cada una)
- **Crecimiento estimado:** ~3 inspecciones/día × 5.7 MB = ~17 MB/día = ~500 MB/mes

### 1.3 Railway Volume — viabilidad

| Aspecto | Detalle |
|---------|---------|
| **Tamaño máximo** | Configurable (plan Pro: hasta 100 GB) |
| **Persistencia** | Sobrevive redeploys, NO sobrevive si eliminas el servicio |
| **Acceso entre servicios** | Los volumes son exclusivos de UN servicio — pero pueden exponerse via endpoints internos de Railway (Private Networking) |
| **Backup** | No tiene snapshots automáticos — hay que implementar backup manual |
| **Performance** | SSD NVMe, buen rendimiento para lectura/escritura |

**Ventaja clave para tu caso:** como el CRM ya está en Railway, puede acceder a las fotos vía la **red privada interna de Railway** (`belt-fotos.railway.internal:3003`) sin pasar por internet. Esto es rápido y gratis (sin egress).

---

## 2. Arquitectura propuesta en Railway

```
Celular (PWA)
    │  HTTPS
    ▼
inspecciones-belt.com (DNS → Railway)
    │
    ▼
┌─────────────────────────────────────┐
│  Railway Service: "belt-fotos"      │
│  Node.js / Express (server.js)      │
│  Puerto: $PORT (Railway lo asigna)  │
│                                     │
│  Volume montado en /data            │
│    └─ /data/fotos/<DNI>-<GESTION>/  │
│         ├─ 1.jpg ... 9.jpg          │
│         ├─ datos.txt                │
│         └─ meta.json                │
└───────────┬─────────────────────────┘
            │  Private Network
            ▼
┌─────────────────────────────────────┐
│  Railway Service: "belt-postgres"   │
│  PostgreSQL (managed by Railway)    │
│  Tabla: vehiculos                   │
└───────────┬─────────────────────────┘
            │  Private Network
            ▼
┌─────────────────────────────────────┐
│  Railway Service: "crm-belt"        │
│  (ya existente en Railway)          │
│  Accede a vehiculos via Postgres    │
│  Accede a fotos via HTTP interno    │
│    → http://belt-fotos.railway.internal/api/imagen/... │
└─────────────────────────────────────┘
```

---

## 3. Cambios en el código

### 3.1 Base de datos: SQLite → PostgreSQL

| Cambio | Detalle |
|--------|---------|
| **Dependencia** | Sacar `better-sqlite3`, agregar `pg` (node-postgres) |
| **Conexión** | Usar `DATABASE_URL` (Railway la inyecta automáticamente) |
| **Schema** | Mismo esquema, adaptado a Postgres (TEXT → VARCHAR, etc.) |
| **Upsert** | `ON CONFLICT ... DO UPDATE` funciona igual en Postgres |
| **Init** | `CREATE TABLE IF NOT EXISTS` funciona igual |

**Migración de datos existentes:**
```sql
-- Los 105 registros se migran con un INSERT masivo (script de una vez)
INSERT INTO vehiculos (dni, carpeta, tipo, dominio, marca, modelo, chasis, motor, cuadro, actualizado)
VALUES ...
```

### 3.2 Storage: `DB_BASE` filesystem → Volume mount

| Cambio | Detalle |
|--------|---------|
| **Variable** | `DB_BASE` → apunta a `/data/fotos` (mount point del Volume) |
| **Sin cambio en lógica** | `fs.writeFile`, `fs.readdir`, `path.join(DB_BASE, ...)` — todo sigue igual, solo cambia la ruta base |
| **No necesita SDK de S3** | Al usar Volume, el filesystem es local al container |

Esto es la **gran ventaja** de usar Railway Volume: el código de manejo de archivos **no cambia** — solo la ruta.

### 3.3 Red / Puerto

```js
// Antes:
const PORT = 3003

// Después:
const PORT = process.env.PORT || 3003
```

Railway asigna `$PORT` dinámicamente.

### 3.4 SMTP / APIs externas

Sin cambios — las API keys se configuran como variables de entorno en Railway Dashboard.

### 3.5 Dominio

- Configurar `inspecciones-belt.com` como Custom Domain en Railway.
- Eliminar la ruta del túnel Cloudflare en el servidor viejo (o dejarlo apagado).
- Railway provee HTTPS automático (Let's Encrypt).

---

## 4. Cómo accede el CRM a las fotos (Railway Private Networking)

Hoy el CRM accede vía API pública (`https://inspecciones-belt.com/api/imagen/:carpeta/:foto`).

En Railway, el CRM puede acceder vía **red privada interna** (gratis, sin latencia de internet):

```
http://belt-fotos.railway.internal:${PORT}/api/imagen/:carpeta/:foto
```

Para los datos vehiculares, el CRM se conecta directamente a la **misma instancia PostgreSQL** que usa belt-fotos (ambos comparten la DB). Esto reemplaza la necesidad de leer un archivo SQLite remoto.

---

## 5. Plan de ejecución paso a paso

### Fase 1 — Preparar código (local, sin afectar producción)

1. **Crear branch** `railway-migration`
2. **Reemplazar `better-sqlite3` por `pg`** en `package.json`
3. **Adaptar `server.js`:**
   - Conexión Postgres via `DATABASE_URL`
   - `upsertVehiculo()` → usar `pg` client con misma query (ON CONFLICT)
   - `DB_BASE = process.env.DB_BASE || '/data/fotos'`
   - `PORT = process.env.PORT || 3003`
4. **Quitar `node-windows`** de dependencies (ya no es necesario)
5. **Agregar `Procfile`** o configurar start command: `node server.js`
6. **Crear `railway.json`** (o usar Railway CLI):
   ```json
   {
     "$schema": "https://railway.com/railway.schema.json",
     "build": { "builder": "NIXPACKS" },
     "deploy": {
       "startCommand": "node server.js",
       "healthcheckPath": "/api/health"
     }
   }
   ```
7. **Testear localmente** con Postgres local (Docker) + carpeta `/data/fotos` simulada.

### Fase 2 — Crear infraestructura en Railway

1. **Crear proyecto** "Belt Fotos" en Railway
2. **Agregar servicio PostgreSQL** (plugin de Railway, plan Hobby $5/mes)
3. **Crear el servicio Node.js** (desde GitHub repo, branch `railway-migration`)
4. **Crear Volume** de 5 GB inicial (expandible) montado en `/data/fotos`
5. **Configurar variables de entorno:**
   - `DATABASE_URL` → Railway la inyecta automáticamente al vincular Postgres
   - `DB_BASE` = `/data/fotos`
   - `ANTHROPIC_KEY` = (misma key)
   - `ANTHROPIC_MODEL` = `claude-sonnet-4-6`
   - `GEMINI_KEY` = (misma key)
   - `SMTP_USER` / `SMTP_PASS` = (mismos valores)
   - `NOTIFY_EMAIL` = `emision@beltseguros.com`
   - `ADMIN_KEY` = (misma key)
6. **Configurar Custom Domain:** `inspecciones-belt.com`

### Fase 3 — Migrar datos existentes

1. **Exportar los 105 registros de SQLite** a SQL INSERT (script de una vez)
2. **Importar en Postgres** via `psql` o script Node
3. **Subir las 127 carpetas de fotos (722 MB)** al Volume:
   - Opción A: `railway volume upload` (CLI)
   - Opción B: Script que suba via `scp`/`rsync` al container
   - Opción C: Endpoint temporal `POST /api/migrate-upload` que recibe y guarda
4. **Verificar integridad:** contar carpetas + fotos en el Volume vs local

### Fase 4 — Switchover (corte)

1. **Cambiar DNS** de `inspecciones-belt.com`: de Cloudflare Tunnel → Railway CNAME
2. **Probar desde el celular** que la PWA funciona (subir inspección nueva)
3. **Verificar que el CRM** lee datos via Postgres y fotos via red interna
4. **Apagar el servidor local:**
   - `sc.exe stop beltfotos.exe`
   - Detener tarea programada `CloudflareTunnel` (en servidor del cliente)
5. **Mantener el servidor local como backup** 1-2 semanas por si hay que rollback

---

## 6. Costos estimados (Railway)

| Recurso | Costo mensual |
|---------|---------------|
| **Servicio Node.js** (Hobby plan) | ~$5 (512 MB RAM, siempre encendido) |
| **PostgreSQL** (managed) | ~$5 (1 GB storage incluido) |
| **Volume** (5 GB → expandir según uso) | ~$0.25/GB/mes = $1.25 iniciales, crece ~$0.12/mes |
| **Egress** (tráfico saliente) | 100 GB gratis/mes en Hobby, luego $0.10/GB |
| **Total estimado** | **~$11-15/mes** |

Con crecimiento de ~500 MB/mes en fotos:
- Año 1: ~6.7 GB total en Volume → ~$1.70/mes en storage
- Año 2: ~12.7 GB → ~$3.20/mes en storage

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| **Volume se pierde si eliminas servicio** | Backup semanal a R2/S3 (cron job) |
| **Cold start** | Railway Pro mantiene siempre encendido; Hobby puede dormir tras 10 min sin tráfico (configurar "always on") |
| **Fallo de deploy deja app caída** | Railway tiene rollback automático al último deploy exitoso |
| **Fotos exceden capacidad Volume** | Monitorear uso, expandir, o migrar a R2 en el futuro si supera 50 GB |
| **Postgres se llena** | 105 registros → irrelevante (crecimiento: ~90 filas/mes, años de margen) |

---

## 8. Qué NO cambia

- **Frontend (React/Vite):** sin cambios — se sigue sirviendo desde `dist/`
- **PWA (manifest.json, sw.js):** sin cambios
- **OCR de cédula (Anthropic API):** sin cambios
- **Detección de encuadre (Gemini):** sin cambios
- **Lógica de negocio:** sin cambios
- **Email de notificación:** sin cambios
- **Estructura de carpetas de fotos:** misma (`<DNI>-<GESTION>/1.jpg...9.jpg`)

---

## 9. Decisión pendiente: ¿Qué hacer con el servidor local?

| Opción | Ventaja | Desventaja |
|--------|---------|------------|
| **A) Apagar completamente** | Sin mantenimiento | Sin backup local |
| **B) Dejar como mirror/backup** | Rollback rápido si Railway falla | Hay que mantener sincronizado |
| **C) Eliminar después de 1 mes sin incidentes** | Limpio, sin costos | Irreversible |

Recomendación: **Opción C** — mantener 1 mes como backup, luego apagar.

---

## Próximos pasos inmediatos

1. [ ] Confirmar que el CRM en Railway puede conectarse a una Postgres compartida
2. [ ] Crear branch `railway-migration` y adaptar `server.js`
3. [ ] Testear localmente con Docker (Postgres + carpeta simulada)
4. [ ] Crear proyecto en Railway Dashboard
5. [ ] Migrar datos (105 registros + 722 MB fotos)
6. [ ] Switchover DNS

# Túnel Cloudflare — Belt Fotos

Documento explicativo de **cómo está montado el túnel** que expone la app a internet
y **cómo funciona**. Sirve como referencia para mantenimiento, diagnóstico y recuperación.

---

## 1. ¿Qué es y para qué sirve?

La app `Belt Fotos` corre **localmente** en el servidor Windows como un servidor Node.js
en el puerto **3003** (`http://localhost:3003`). Ese puerto **no está expuesto a internet**
directamente (no hay IP pública ni apertura de puertos en el router/firewall).

Para que los usuarios puedan entrar desde su celular usando un dominio público
(**https://inspecciones-belt.com**), usamos un **Túnel de Cloudflare** (`cloudflared`).

El túnel crea una conexión **saliente y segura** desde el servidor hacia la red de
Cloudflare. Cuando un usuario visita el dominio, Cloudflare recibe la petición y la
reenvía por ese túnel hasta `localhost:3003` en el servidor. La respuesta vuelve por el
mismo camino.

**Ventajas de este enfoque:**

- No hay que abrir puertos en el router ni exponer la IP del servidor.
- Cloudflare provee **HTTPS/SSL automático** (certificado gestionado por Cloudflare).
- Protección DDoS y CDN de Cloudflare incluidas.
- Funciona aunque el servidor esté detrás de un router doméstico / IP dinámica.

---

## 2. Diagrama de flujo

```
                                  Internet
   Usuario (celular)                 │
        │  https://inspecciones-belt.com
        ▼                            │
 ┌─────────────────┐                 │
 │  Cloudflare CDN │ ◄───────────────┘
 │   + SSL + DNS   │
 └────────┬────────┘
          │  Túnel Cloudflare (conexión saliente segura, cifrada)
          │  UUID: 302b9d1e-d76e-4400-b88f-5c405a77711b
          ▼
 ┌──────────────────────────────────────────┐
 │  Servidor Windows (DESKTOP-K5IO86R)        │
 │                                            │
 │   cloudflared.exe  ── reenvía a ──►        │
 │                     http://localhost:3003  │
 │                              │             │
 │                              ▼             │
 │                   Node.js (beltfotos.exe)  │
 │                              │             │
 │                              ▼             │
 │                   D:\Fotos - Asegurados    │
 └──────────────────────────────────────────┘
```

**Puntos clave del flujo:**

1. El usuario entra a `https://inspecciones-belt.com`.
2. El **DNS de Cloudflare** resuelve ese dominio hacia el túnel (registro CNAME que
   apunta a `<UUID>.cfargotunnel.com`).
3. Cloudflare recibe la petición HTTPS y la manda por el túnel ya establecido.
4. `cloudflared.exe` (corriendo en el servidor) recibe la petición y la entrega a
   `http://localhost:3003`.
5. El servidor Node.js (`beltfotos.exe`) procesa la petición y guarda las fotos en
   `D:\Fotos - Asegurados`.
6. La respuesta vuelve por el mismo túnel hasta el navegador del usuario.

---

## 3. Componentes del túnel

| Componente | Valor / Ubicación |
|------------|-------------------|
| **Nombre del túnel** | `belt-fotos` |
| **UUID del túnel** | `302b9d1e-d76e-4400-b88f-5c405a77711b` |
| **Ejecutable** | `C:\BELT\cloudflared.exe` |
| **Archivo de configuración** | `C:\BELT\config.yml` |
| **Credenciales del túnel** | `C:\Users\Usuario\.cloudflared\302b9d1e-d76e-4400-b88f-5c405a77711b.json` |
| **Arranque automático** | Tarea Programada de Windows: `CloudflareTunnel` (AtStartup) |
| **Versión cloudflared** | v2026.6.1 |
| **Puerto local destino** | `3003` (Node.js `beltfotos.exe`) |

### 3.1. Archivo `config.yml`

Es el archivo que le dice a `cloudflared` **qué túnel usar** y **cómo enrutar** cada
dominio hacia el servicio local. Contenido actual:

```yaml
tunnel: 302b9d1e-d76e-4400-b88f-5c405a77711b
credentials-file: C:\Users\Usuario\.cloudflared\302b9d1e-d76e-4400-b88f-5c405a77711b.json
ingress:
  - hostname: inspecciones-belt.com
    service: http://localhost:3003
  - hostname: www.inspecciones-belt.com
    service: http://localhost:3003
  - service: http_status:404
```

**Cómo leer el bloque `ingress`:**

- Se evalúa **de arriba hacia abajo**, la primera regla que coincide gana.
- `inspecciones-belt.com` y `www.inspecciones-belt.com` → se reenvían a `localhost:3003`.
- La última regla `service: http_status:404` es un **catch-all obligatorio**: cualquier
  dominio que no coincida con los anteriores devuelve un 404. Siempre debe ir al final.

> Para agregar un nuevo dominio (ej. un ambiente de test), se agrega una nueva entrada
> `- hostname: ... / service: http://localhost:PUERTO` **antes** del catch-all `404`.

### 3.2. Credenciales (`*.json`)

El archivo `302b9d1e-...json` contiene el **secreto** que autentica este servidor como
dueño del túnel ante Cloudflare. **No debe compartirse ni subirse a repositorios.**
Si se pierde, hay que recrear el túnel.

---

## 4. Arranque automático (Tarea Programada)

El túnel **no** está instalado como servicio de Windows, sino como **Tarea Programada**
llamada `CloudflareTunnel`, configurada para ejecutarse **al iniciar el sistema**
(AtStartup). Así, si el servidor se reinicia, el túnel vuelve solo.

La tarea ejecuta, en esencia:

```powershell
C:\BELT\cloudflared.exe tunnel --config C:\BELT\config.yml run
```

**Comandos para gestionar la tarea:**

```powershell
# Ver estado de la tarea (debe decir "Ready" o "Running")
Get-ScheduledTask -TaskName "CloudflareTunnel" | Select-Object TaskName, State

# Arrancar manualmente
Start-ScheduledTask -TaskName "CloudflareTunnel"

# Detener
Stop-ScheduledTask -TaskName "CloudflareTunnel"
```

---

## 5. DNS en Cloudflare

En el panel de Cloudflare, la zona `inspecciones-belt.com` (plan Free) tiene registros
**CNAME** que apuntan al túnel:

| Tipo | Nombre | Destino | Proxy |
|------|--------|---------|-------|
| CNAME | `@` (raíz) | `302b9d1e-d76e-4400-b88f-5c405a77711b.cfargotunnel.com` | Proxied (naranja) |
| CNAME | `www` | `302b9d1e-d76e-4400-b88f-5c405a77711b.cfargotunnel.com` | Proxied (naranja) |

> El **Proxy activado (nube naranja)** es lo que permite que Cloudflare intercepte el
> tráfico y lo mande por el túnel. Si estuviera en gris (DNS only), no funcionaría.

---

## 6. Comandos útiles de diagnóstico

```powershell
# Ver información y conexiones activas del túnel
cd C:\BELT
.\cloudflared.exe tunnel info belt-fotos

# Listar todos los túneles de la cuenta
.\cloudflared.exe tunnel list

# Ver la versión de cloudflared
.\cloudflared.exe --version

# Verificar que el servicio Node esté escuchando en el 3003
netstat -ano | findstr ":3003"

# Verificar estado del servicio de la app
sc.exe query beltfotos.exe
```

---

## 7. Troubleshooting

### La web no carga — Error 1033 / "Argo Tunnel error"

Significa que el túnel **no está conectado** (cloudflared no está corriendo).

```powershell
Get-ScheduledTask -TaskName "CloudflareTunnel" | Select-Object State
# Si no está corriendo:
Start-ScheduledTask -TaskName "CloudflareTunnel"
```

### La web da Error 502 / Bad Gateway

El túnel está OK pero el **servidor Node no responde** en el 3003.

```powershell
sc.exe query beltfotos.exe
netstat -ano | findstr ":3003"
# Si no está corriendo:
sc.exe start beltfotos.exe
```

### Cambié el `config.yml` y no toma los cambios

Hay que **reiniciar el túnel** para que relea la configuración:

```powershell
Stop-ScheduledTask -TaskName "CloudflareTunnel"
Start-Sleep 3
Start-ScheduledTask -TaskName "CloudflareTunnel"
```

### Verificar de punta a punta

1. `Get-ScheduledTask -TaskName "CloudflareTunnel"` → State = Running/Ready
2. `sc.exe query beltfotos.exe` → RUNNING
3. `netstat -ano | findstr ":3003"` → hay algo escuchando (LISTENING)
4. En el navegador del servidor: `http://localhost:3003` carga la app
5. Desde afuera: `https://inspecciones-belt.com` carga la app

Si 1-4 están OK pero 5 falla, el problema está en **DNS/Cloudflare** (revisar que los
CNAME estén "Proxied").

---

## 8. Resumen en una línea

> `cloudflared.exe` mantiene una conexión saliente segura con Cloudflare; Cloudflare
> recibe el tráfico de `inspecciones-belt.com` y lo reenvía por ese túnel hasta
> `localhost:3003`, donde corre la app Node.js. Todo arranca solo al prender el servidor
> gracias a la Tarea Programada `CloudflareTunnel` y al servicio `beltfotos.exe`.

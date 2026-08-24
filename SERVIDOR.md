# Configuración del Servidor — Belt Fotos

## Datos del servidor

| Dato | Valor |
|------|-------|
| **OS** | Windows |
| **Hostname** | DESKTOP-K5IO86R |
| **Usuario** | Usuario |
| **IP LAN** | 192.168.0.23 |
| **Carpeta app** | `C:\BELT` |
| **Carpeta fotos** | `D:\Fotos - Asegurados` |
| **Puerto app** | 3003 |
| **Dominio** | https://inspecciones-belt.com |

---

## Arquitectura

```
Internet → Cloudflare CDN → Túnel Cloudflare → localhost:3003 (Node.js)
                                                      ↓
                                              D:\Fotos - Asegurados
```

---

## Componentes instalados

### 1. Belt Fotos (App Node.js)

- **Servicio Windows**: `beltfotos.exe` (instalado con node-windows)
- **Script**: `C:\BELT\server.js`
- **Puerto**: 3003
- **Variables de entorno** (configuradas a nivel Machine):
  - `DB_BASE` = `D:\Fotos - Asegurados`
  - `SMTP_USER` = `notificaciones@beltseguros.com`
  - `SMTP_PASS` = (contraseña de app de Google)
  - `NOTIFY_EMAIL` = `emision@beltseguros.com`

**Comandos:**
```powershell
# Ver estado
sc.exe query beltfotos.exe

# Reiniciar
sc.exe stop beltfotos.exe; Start-Sleep 5; sc.exe start beltfotos.exe

# Ver logs (carpeta de node-windows)
dir C:\BELT\daemon\
```

### 2. Cloudflare Tunnel

- **Método**: Tarea Programada de Windows (`CloudflareTunnel`)
- **Túnel**: `belt-fotos` (UUID: `302b9d1e-d76e-4400-b88f-5c405a77711b`)
- **Config**: `C:\BELT\config.yml`
- **Credenciales**: `C:\Users\Usuario\.cloudflared\302b9d1e-d76e-4400-b88f-5c405a77711b.json`
- **Ejecutable**: `C:\BELT\cloudflared.exe`

**Comandos:**
```powershell
# Ver estado de la tarea
Get-ScheduledTask -TaskName "CloudflareTunnel" | Select-Object TaskName, State

# Arrancar manualmente
Start-ScheduledTask -TaskName "CloudflareTunnel"

# Detener
Stop-ScheduledTask -TaskName "CloudflareTunnel"

# Ver conexiones activas
cd C:\BELT
.\cloudflared tunnel info belt-fotos
```

**Contenido de `config.yml`:**
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

---

## DNS (Cloudflare Dashboard)

Zona: `inspecciones-belt.com` (Plan Free)

| Tipo | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME (Tunnel) | `@` | `302b9d1e-d76e-4400-b88f-5c405a77711b.cfargotunnel.com` | Proxied |
| CNAME (Tunnel) | `www` | `302b9d1e-d76e-4400-b88f-5c405a77711b.cfargotunnel.com` | Proxied |

---

## Email de notificaciones

- **Remitente**: `notificaciones@beltseguros.com` (Google Workspace)
- **Destinatario**: `emision@beltseguros.com`
- **SMTP**: smtp.gmail.com:587
- **Autenticación**: Contraseña de aplicación (2FA activada en la cuenta)

Cada inspección enviada genera un email automático al equipo de emisión.

---

## Deploy de actualizaciones

### Paso 1 — En la PC de desarrollo (Windows, carpeta del proyecto)

Carpeta del proyecto: `C:\Users\pablo\OneDrive\Escritorio\BELT-FOTOS`

```powershell
# Buildear la app (genera la carpeta dist/)
npx vite build

# Crear zip versionado (cambiar el número de versión según corresponda)
Compress-Archive -Path "dist", "server.js", "package.json", "package-lock.json", "public" -DestinationPath "belt-fotos-1.6.2.zip" -Force
```

> El zip se crea en la misma carpeta del proyecto:  
> `C:\Users\pablo\OneDrive\Escritorio\BELT-FOTOS\belt-fotos-1.6.2.zip`

**Contenido del zip:**
- `dist/` — frontend compilado (HTML, CSS, JS)
- `server.js` — servidor Express
- `package.json` + `package-lock.json` — dependencias
- `public/` — imágenes de referencia, manifest, sw, etc.

### Paso 2 — Copiar el zip al servidor

Conectar por **TeamViewer / Escritorio Remoto** y arrastrar el archivo `.zip` a `C:\BELT\`

### Paso 3 — En el servidor (PowerShell como Administrador)

```powershell
# Descomprimir (sobreescribe archivos existentes)
Expand-Archive -Path "C:\BELT\belt-fotos-1.6.2.zip" -DestinationPath "C:\BELT" -Force

# Instalar/actualizar dependencias (necesario si cambió package.json)
npm install --prefix C:\BELT

# Reiniciar el servicio de la app
sc.exe stop beltfotos.exe
Start-Sleep 5
sc.exe start beltfotos.exe
```

> ⚠️ **NO usar `taskkill /F /IM node.exe`**: mata el wrapper del servicio (node-windows) y el
> servicio queda caído con código 1067. Reiniciar SOLO con `sc.exe stop`/`start`.

> ⚠️ **`npm install` y node-windows**: `node-windows` (el que crea el servicio Windows) debe
> figurar en `dependencies` del `package.json`. Si no está, `npm install` lo **poda**
> ("removed N packages") y el servicio crashea con 1067
> (`Cannot find module ...node-windows\lib\wrapper.js`). Si pasa, reinstalarlo:
> `npm install node-windows --prefix C:\BELT`.

**Variables de entorno (nivel Machine) que usa la app:**
- `DB_BASE` = `D:\Fotos - Asegurados`
- `GEMINI_KEY` = validación de encuadre en vivo
- `ANTHROPIC_KEY` = OCR de cédula (desde v1.6.0). Setear con:
  `setx ANTHROPIC_KEY "sk-ant-..." /M` y reiniciar el servicio.
- (Opcional) `ANTHROPIC_MODEL`, por defecto `claude-sonnet-4-6` (mejoró la precisión de OCR de chasis/dominio respecto a `claude-sonnet-4-5`; alternativa aún más precisa pero más cara: `claude-opus-4-5-20251101`).

**Datos de cédula (v1.6.0+):** el server extrae con Claude y guarda en
`D:\Fotos - Asegurados\inspecciones.db` (tabla `vehiculos`, para el CRM) y en un
`datos.txt` dentro de la carpeta de cada inspección.

### Verificar que funciona

```powershell
# Chequear que el servicio esté corriendo
sc.exe query beltfotos.exe

# Probar en el navegador
Start-Process "http://localhost:3003"
```

Luego verificar desde el celular en https://inspecciones-belt.com que la versión nueva aparece.

---

## Arranque automático (post-reinicio)

Ambos servicios arrancan solos al iniciar Windows:

| Componente | Método | Tipo inicio |
|------------|--------|-------------|
| Belt Fotos | Servicio Windows (`beltfotos.exe`) | AUTO_START |
| Cloudflare Tunnel | Tarea Programada (`CloudflareTunnel`) | AtStartup |

---

## Troubleshooting

### La app no carga (Error 1033 en el navegador)
```powershell
# Verificar que el túnel esté corriendo
Get-ScheduledTask -TaskName "CloudflareTunnel" | Select-Object State
# Si dice "Ready", arrancarlo:
Start-ScheduledTask -TaskName "CloudflareTunnel"
```

### La app da error 502
```powershell
# Verificar que Node esté corriendo
sc.exe query beltfotos.exe
netstat -ano | findstr ":3003"
# Si no está corriendo:
sc.exe start beltfotos.exe
```

### Las fotos no se guardan
```powershell
# Verificar que la carpeta exista y tenga permisos
dir "D:\Fotos - Asegurados"
# Si no existe, crearla:
New-Item -ItemType Directory -Path "D:\Fotos - Asegurados" -Force
```

### El servicio dice "detenido" (`sc.exe stop` → error 1062) pero la app sigue respondiendo con datos/versión vieja tras un deploy

**CAUSA RAÍZ CONFIRMADA (04/08/2026):** además del servicio Windows `beltfotos.exe`
(node-windows), en el servidor había un **PM2 instalado bajo el usuario "Usuario"**
corriendo su propia copia de la app (`pm2` proceso llamado `belt-fotos`, versión
congelada en `1.2.1`, con **482 reinicios automáticos** acumulados). Nadie lo instaló
a propósito para producción — quedó de alguna prueba/instalación vieja y desde entonces
compite en silencio con el servicio oficial por el puerto 3003.

**Síntoma:** cada deploy actualiza bien los archivos en `C:\BELT\`, pero el navegador
sigue viendo la versión vieja. Al matar el proceso que escucha en el 3003 (`taskkill /PID`),
vuelve a aparecer solo con otro PID unos segundos después — porque **PM2 lo revive
automáticamente**, no es un simple proceso huérfano suelto.

**Diagnóstico — correr en este orden:**

```powershell
# 1) Ver qué PID está realmente escuchando en el 3003
netstat -ano | findstr "LISTENING" | findstr ":3003"

# 2) Ver el PID que reporta la SCM (el servicio Windows "oficial")
sc.exe query beltfotos.exe

# 3) Si son distintos PIDs, buscar el comando real de ese proceso
Get-CimInstance Win32_Process -Filter "name='node.exe'" | Select-Object ProcessId,CommandLine | Format-List
# Si aparece "...pm2\lib\ProcessContainerFork.js" o similar → CONFIRMADO, es PM2.

# 4) Listar procesos de PM2 (puede necesitar la ruta completa si "pm2" no se reconoce)
pm2 list
# o: node "C:\Users\Usuario\AppData\Roaming\npm\node_modules\pm2\bin\pm2" list
```

**Solución definitiva:**

```powershell
# 1) Eliminar el proceso de PM2 (no solo "stop": "delete" para que no quede registrado)
pm2 delete belt-fotos

# 2) Guardar la lista de PM2 sin belt-fotos, para que no vuelva a arrancar solo
#    ni siquiera después de reiniciar Windows
pm2 save

# 3) Confirmar que el puerto quedó libre
netstat -ano | findstr ":3003"

# 4) Reiniciar el servicio Windows (el único que debe manejar la app de acá en adelante)
sc.exe stop beltfotos.exe
Start-Sleep 3
sc.exe start beltfotos.exe
sc.exe query beltfotos.exe

# 5) Confirmar la versión real
Invoke-RestMethod http://localhost:3003/api/health
```

> ⚠️ Antes de cada deploy futuro, agregar como chequeo previo: `pm2 list` en el servidor
> del cliente. Si vuelve a aparecer algo ahí (`belt-fotos` u otro nombre), eliminarlo
> con `pm2 delete <nombre>` + `pm2 save` **antes** de tocar el servicio Windows.

### El email no se envía
- Verificar que las variables de entorno estén configuradas:
```powershell
[System.Environment]::GetEnvironmentVariable('SMTP_USER', 'Machine')
[System.Environment]::GetEnvironmentVariable('SMTP_PASS', 'Machine')
```
- Si la contraseña de app se revocó, generar una nueva en https://myaccount.google.com/apppasswords

---

## Versión actual

- **App**: Belt Fotos v1.6.2
- **Fuente**: GitLab (belt-fotos-master)
- **Cloudflared**: v2026.6.1
- **Node.js**: instalado en `C:\Program Files\nodejs\`

> Ver `DEPLOY-1.6.2.md` en la raíz del proyecto para el procedimiento paso a paso
> de esta actualización puntual (fix de OCR de cédula + corrección de 9 inspecciones).

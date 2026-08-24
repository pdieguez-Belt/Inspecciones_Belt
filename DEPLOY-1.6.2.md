---
description: Deploy v1.6.2 — Fix de OCR de cédula (dominio/chasis) + corrección de 9 inspecciones
---

# Deploy v1.6.2 — Fix OCR de cédula

## Qué cambia esta versión

- Modelo de OCR de cédula: `claude-sonnet-4-5` → **`claude-sonnet-4-6`** (default en `server.js`).
- Prompt de extracción más estricto (transcripción carácter por carácter, no adivina si hay duda).
- Se corrigieron localmente (`datos.txt`) 9 inspecciones con datos de cédula incorrectos.
  Falta propagar esas 9 correcciones a la base SQLite de producción (`inspecciones.db`),
  que solo puede actualizarse de forma segura ejecutando algo en el propio servidor.

**Ya preparado en esta carpeta:**
- `belt-fotos-1.6.2.zip` — build + server listo para copiar al servidor.
- `fix-9-inspecciones.mjs` — script para correr EN el servidor después del deploy,
  que dispara la re-extracción real de esas 9 inspecciones contra la nueva base.

---

## Paso 1 — Copiar archivos al servidor

Con acceso remoto (TeamViewer / Escritorio Remoto) al servidor `DESKTOP-K5IO86R`:

1. Copiar `belt-fotos-1.6.2.zip` a `C:\BELT\`
2. Copiar `fix-9-inspecciones.mjs` también a `C:\BELT\` (se usa en el Paso 4)

## Paso 2 — Actualizar la app (PowerShell como Administrador, en el servidor)

```powershell
# Descomprimir (sobreescribe archivos existentes)
Expand-Archive -Path "C:\BELT\belt-fotos-1.6.2.zip" -DestinationPath "C:\BELT" -Force

# Instalar/actualizar dependencias
npm install --prefix C:\BELT

# Reiniciar el servicio
sc.exe stop beltfotos.exe
Start-Sleep 5
sc.exe start beltfotos.exe
```

> ⚠️ No usar `taskkill /F /IM node.exe` (mata el wrapper de node-windows). Reiniciar
> SOLO con `sc.exe stop` / `sc.exe start`.

## Paso 3 — Verificar que levantó bien

```powershell
sc.exe query beltfotos.exe
Start-Process "http://localhost:3003"
```

Confirmar en el navegador que la versión mostrada es **1.6.2** (footer/versión de la app).

Opcional — confirmar que tomó el modelo nuevo (no debería hacer falta setear nada,
`claude-sonnet-4-6` ya es el default):
```powershell
[System.Environment]::GetEnvironmentVariable('ANTHROPIC_MODEL', 'Machine')
# Si devuelve vacío o $null, está usando el default del código (claude-sonnet-4-6) -> OK
```

## Paso 4 — Corregir las 9 inspecciones en la base real

Este paso reenvía la misma foto de cédula de cada inspección al endpoint
`/api/corregir-inspeccion`, para que el propio servidor vuelva a correr el OCR
(con el modelo/prompt nuevo) y actualice **su** `inspecciones.db` de forma segura.

```powershell
cd C:\BELT
node fix-9-inspecciones.mjs
```

Esto va a:
- Re-leer las fotos de cédula-frente de esas 9 carpetas desde `D:\Fotos - Asegurados`.
- Re-extraer los datos con el modelo nuevo.
- Sobrescribir `datos.txt` y el registro en `inspecciones.db` de cada una.
- **Enviar 9 emails de "corrección" a `emision@beltseguros.com`** (comportamiento normal
  del endpoint) — avisar al equipo de emisión antes de correrlo para que no genere confusión.

## Paso 5 — Verificar resultados

Revisar que los `datos.txt` de estas carpetas coincidan con lo que ya se validó en desarrollo:

- `28029429-BELT-260723-9629` → Dominio `A252MHX`, Cuadro `8EZCNEGT6TB000039`
- `25154543-BELT-260723-3193` → Dominio `A285ITI`, Cuadro `8CVA21BZ9SA015662`
- `29801925-BELT-260722-1979` → Dominio `NHB220`, Chasis `9BRK29BT1E0014472`
- `22639003-BELT-260721-5831` → Dominio `A236QBM`, Cuadro `8EZDJERT5SB000690`
- `35274167-BELT-260721-8850` → Dominio `A250HUI`, Cuadro `8CHNC6300SP004066`
- `22331225-BELT-260720-7944` → Dominio `A2412JM`, Cuadro `8EZDJERT5SB000831`
- `43628496-BELT-260717-8691` → Dominio `AYT67281`, Cuadro `8CHKF2400HP003044`
- `38843858-BELT-260717-3353` → **Chasis/Cuadro quedan vacíos** (foto borrosa, sin dato confiable — requiere re-sacar la foto de la cédula o verificar manualmente)
- `38843858-BELT-260717-2073` → Dominio `A132DKV`, Cuadro `8CMKA12A5M1001085`

Si alguno no coincide, revisar el log de `node fix-9-inspecciones.mjs` (imprime el JSON
de respuesta de cada corrección) y los logs del servicio en `C:\BELT\daemon\`.

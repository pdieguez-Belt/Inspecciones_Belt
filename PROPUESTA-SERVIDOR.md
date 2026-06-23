# Propuesta: Migración del Servidor de Fotos BELT al Servidor Central

**Fecha:** 22 de junio de 2026  
**Proyecto:** BELT Seguros – Sistema de Inspección Vehicular con Fotos  
**Elaborado por:** Equipo de Desarrollo BELT

---

## 1. Situación Actual

El sistema BELT Fotos permite a los clientes y productores de seguros realizar inspecciones vehiculares tomando fotos guiadas desde el celular, accediendo a la dirección web **fotos-belt.proyectopd.com.ar**.

### Arquitectura actual (problemática):

```
Celular del usuario
    ↓ (internet)
Cloudflare Tunnel
    ↓
PC de desarrollo (localhost:3003)
    ↓ (VPN Radmin)
Servidor central (26.100.60.112)
```

**El flujo actual depende de 3 eslabones frágiles:**
- La PC de desarrollo debe estar encendida permanentemente
- La VPN Radmin debe estar conectada y estable
- El túnel de Cloudflare debe estar activo en la PC

**Si falla cualquiera de los tres, el sistema deja de funcionar.**

---

## 2. Propuesta: Mover el Servicio al Servidor Central

### Arquitectura propuesta (robusta):

```
Celular del usuario
    ↓ (internet)
Cloudflare Tunnel
    ↓
Servidor central (26.100.60.112:3003)
    ↓ (disco local)
C:\BELT\database\imagenes\
```

**Se elimina la PC de desarrollo como intermediario.** El servidor de fotos corre directamente en el servidor central, y las imágenes se guardan en el disco local del mismo servidor.

---

## 3. ¿Qué se necesita instalar en el servidor?

| Software | Tamaño | Descripción |
|----------|--------|-------------|
| **Node.js** (v18 LTS) | ~70 MB | Motor para ejecutar la aplicación web |
| **Cloudflared** | ~30 MB | Túnel seguro para exponer el servicio a internet |
| **Proyecto BELT Fotos** | ~10 MB | Código de la aplicación + imágenes de referencia |

**Total: ~110 MB de espacio en disco** (sin contar fotos de inspecciones).

### Espacio estimado para fotos:
- Cada inspección genera **11 fotos** (~300 KB c/u) = **~3.3 MB por inspección**
- 100 inspecciones = ~330 MB
- 1000 inspecciones = ~3.3 GB

---

## 4. Beneficios de la migración

### Estabilidad y disponibilidad
- **Sin dependencia de la PC de desarrollo:** El servicio corre 24/7 en el servidor, sin depender de que una PC personal esté encendida.
- **Sin dependencia de la VPN:** Las fotos se guardan en el disco local del servidor, eliminando la latencia y los fallos de la conexión VPN.
- **Mayor velocidad de respuesta:** Al guardar directamente en disco local, el tiempo de upload se reduce significativamente.

### Seguridad
- **Tunnel encriptado:** Cloudflare Tunnel establece una conexión saliente encriptada (el servidor no expone puertos al exterior).
- **Sin puertos abiertos en el firewall:** No es necesario abrir ningún puerto en el servidor. Cloudflare Tunnel funciona con conexión saliente solamente.
- **Fotos almacenadas en el servidor controlado:** Los datos quedan bajo la infraestructura propia, no en una PC personal.

### Simplicidad operativa
- **Menos puntos de falla:** De 3 dependencias (PC + VPN + Tunnel) se pasa a 1 (servidor).
- **Reinicio automático:** Se puede configurar el servicio para que arranque automáticamente si el servidor se reinicia.
- **Mantenimiento remoto:** La VPN Radmin se usa únicamente para administración y actualizaciones, no para el funcionamiento diario.

### Escalabilidad
- **Preparado para crecer:** Si aumenta el volumen de inspecciones, el servidor tiene los recursos para manejarlo.
- **Backups centralizados:** Las fotos están en un único lugar, facilitando las copias de seguridad.

---

## 5. ¿Qué NO cambia para el usuario final?

- Sigue entrando a **fotos-belt.proyectopd.com.ar** desde su celular
- La interfaz y el flujo de fotos son exactamente iguales
- No necesita instalar nada ni conectarse a ninguna VPN
- El cambio es 100% transparente

---

## 6. Información y acceso requerido

Para realizar la migración necesitamos:

| Requerimiento | Detalle |
|--------------|---------|
| **Acceso al servidor** | Escritorio remoto (RDP) o acceso por VPN para instalar software |
| **Permisos de administrador** | Para instalar Node.js y Cloudflared como servicio |
| **Puerto de salida 443 (HTTPS)** | Cloudflare Tunnel usa conexión saliente por HTTPS. No se necesitan puertos entrantes. |
| **Carpeta de trabajo** | Confirmar `C:\BELT\` como ubicación del proyecto y datos (ya creada) |
| **Permiso para crear servicio Windows** | Para que el servidor de fotos arranque automáticamente con el sistema operativo |

---

## 7. Proceso de migración (estimado: 1-2 horas)

1. Conectar al servidor por escritorio remoto
2. Descargar e instalar Node.js (5 min)
3. Descargar e instalar Cloudflared (5 min)
4. Copiar el proyecto BELT Fotos al servidor (5 min)
5. Configurar el túnel de Cloudflare (10 min)
6. Probar el servicio completo (15 min)
7. Configurar inicio automático del servicio (10 min)
8. Redirigir el dominio al nuevo túnel (5 min)
9. Validación final y pruebas con celular (15 min)

---

## 8. Riesgos y mitigación

| Riesgo | Mitigación |
|--------|-----------|
| Servidor se reinicia | Servicio configurado para inicio automático |
| Disco lleno por fotos | Monitoreo de espacio + política de retención |
| Fallo de internet del servidor | Es el mismo riesgo que existe hoy, pero con menos dependencias |
| Necesidad de actualizar la app | Se accede por VPN para actualizar código cuando sea necesario |

---

## 9. Resumen ejecutivo

| Aspecto | Actual | Propuesto |
|---------|--------|-----------|
| **Dependencias** | PC + VPN + Tunnel | Solo servidor |
| **Puntos de falla** | 3 | 1 |
| **Velocidad de guardado** | Lenta (red VPN) | Rápida (disco local) |
| **Disponibilidad** | Depende de PC personal | 24/7 con el servidor |
| **Seguridad de datos** | Fotos en PC personal | Fotos en servidor controlado |
| **Costo adicional** | $0 | $0 (software gratuito) |
| **Impacto en usuarios** | Ninguno | Ninguno (cambio transparente) |

---

**La migración no tiene costo, mejora la estabilidad, la seguridad y la velocidad del sistema, y elimina la dependencia de una PC personal para el funcionamiento del servicio en producción.**

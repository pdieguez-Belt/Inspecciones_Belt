# BELT Fotos - Setup en Mac para iOS App

## Proyecto
App de inspección vehicular con captura de fotos. Actualmente funciona como web app (PWA) y queremos compilarla como app nativa de iOS usando Capacitor.

## Repositorio GitLab
- **URL**: https://gitlab.com/pablodieguez92/belt-fotos.git
- **Branch principal**: `master` (NO main)
- **Usuario GitLab**: `pablodieguez92`

## Clonar el proyecto
```bash
cd ~/Desktop
git clone -b master https://gitlab.com/pablodieguez92/belt-fotos.git
cd belt-fotos
npm install
```

## Stack técnico
- **Frontend**: React + Vite + TailwindCSS
- **Backend**: Express.js (server.js) en puerto 3003
- **Build**: `npm run build` genera carpeta `dist/`
- **Server**: `npm start` sirve `dist/` + API en puerto 3003

## Estructura del proyecto
```
belt-fotos/
├── src/
│   ├── FotosVehiculo.jsx    # Componente principal (toda la app)
│   ├── main.jsx             # Entry point React
│   └── index.css            # Estilos (Tailwind)
├── public/
│   ├── img/                 # Siluetas PNG para guía de fotos
│   ├── icons/               # Íconos PWA (192x192, 512x512)
│   ├── manifest.json        # PWA manifest
│   ├── sw.js                # Service Worker
│   └── logo-belt.png        # Logo BELT
├── img/                     # Imágenes fuente (originales del usuario)
├── server.js                # Express server (API + static files)
├── index.html               # HTML principal
├── vite.config.js           # Config Vite
├── tailwind.config.js       # Config Tailwind
├── postcss.config.js        # Config PostCSS
└── package.json             # Dependencias
```

## Funcionalidad de la app
1. Selección de tipo de vehículo (Auto o Moto)
2. Captura de 11 fotos guiadas con siluetas overlay
3. Formulario de DNI + Patente
4. Upload al servidor (guarda en carpeta por DNI-Patente)
5. Opción de guardar fotos en galería del dispositivo

## Fotos que captura
### Auto (11 fotos):
- Sección A: Frente, Lateral Derecho, Lateral Izquierdo, Trasera
- Sección B: Tablero, Cédula Frente, Cédula Dorso, DNI Frente, DNI Dorso
- Sección C: Cristales y Parabrisas, Neumáticos

### Moto (11 fotos):
- Sección A: Frente, Perfil Derecho, Perfil Izquierdo, Trasera
- Sección B: N° Chasis/VIN, N° Motor, Tablero, Cédula Frente, Cédula Dorso, DNI Frente, DNI Dorso

## API Endpoints
- `POST /api/guardar` - Sube fotos (multipart, hasta 15 archivos, 20MB c/u)
- `GET /api/inspecciones` - Lista todas las inspecciones guardadas
- `GET /api/imagen/:carpeta/:foto` - Sirve una imagen específica
- `GET /api/health` - Health check

## Servidor de producción
- **Dominio**: fotos-belt.proyectopd.com.ar
- **Puerto local**: 3003
- **Túnel**: Cloudflare Tunnel (cloudflared) desde PC Windows
- **Fotos se guardan en**: `BELT/database/imagenes/vehiculos_asegurados/{DNI}-{PATENTE}/`

## Objetivo en la Mac
Configurar **Capacitor** para compilar la app como app nativa de iOS:
1. Instalar Capacitor (`@capacitor/core`, `@capacitor/ios`)
2. Configurar `capacitor.config.ts`
3. Generar proyecto Xcode con `npx cap add ios`
4. Configurar permisos de cámara en Info.plist
5. Compilar y subir al App Store

## Requisitos Mac
- macOS 12+ (Monterey o superior)
- Xcode (última versión compatible con tu macOS)
- Node.js 18+ (`brew install node`)
- CocoaPods (`brew install cocoapods`)
- Cuenta Apple Developer ($99 USD/año) para publicar

## Colores de la app
- Fondo: `#0a0a0a` (negro)
- Acento: `#c9e100` (amarillo/verde BELT)
- Texto: blanco

import express from 'express'
import multer from 'multer'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = 3003

// Carpeta destino: configurable por entorno
// LOCAL: carpeta relativa para desarrollo
// SERVIDOR: D:/Fotos - Asegurados
const DB_BASE = process.env.DB_BASE || path.resolve(__dirname, 'database', 'imagenes', 'vehiculos_asegurados')

app.use(cors())
app.use(express.json())

// Forzar no-cache en HTML para evitar problemas con Cloudflare cache
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Content-Disposition', 'inline')
    res.setHeader('X-Content-Type-Options', 'nosniff')
  }
  next()
})

// Servir archivos estáticos del build de producción
const distPath = path.join(__dirname, 'dist')
app.use(express.static(distPath))

// Multer: almacena temporalmente en memoria
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 15 } })

// POST /api/guardar-inspeccion
// Body (multipart): dni, patente, fotos (hasta 15 archivos)
app.post('/api/guardar-inspeccion', (req, res, next) => {
  upload.array('fotos', 15)(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err.message)
      return res.status(400).json({ error: 'Error al subir fotos: ' + err.message })
    }
    next()
  })
}, (req, res) => {
  const { dni, patente, tipo } = req.body
  if (!dni || !patente) {
    return res.status(400).json({ error: 'DNI y Patente son requeridos' })
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No se recibieron fotos' })
  }

  // Normalizar: quitar espacios, mayúsculas
  const dniClean = dni.trim().replace(/\./g, '').replace(/\s/g, '')
  const patenteClean = patente.trim().toUpperCase().replace(/\s/g, '')
  const folderName = `${dniClean}-${patenteClean}`
  const destDir = path.join(DB_BASE, folderName)

  // Crear carpeta
  fs.mkdirSync(destDir, { recursive: true })

  // Guardar metadata
  const meta = { tipo: tipo || 'auto', dni: dniClean, patente: patenteClean, fecha: new Date().toISOString() }
  fs.writeFileSync(path.join(destDir, 'meta.json'), JSON.stringify(meta, null, 2))

  // Guardar cada foto
  const saved = []
  req.files.forEach((file, idx) => {
    const filename = `${idx + 1}.jpg`
    const filepath = path.join(destDir, filename)
    fs.writeFileSync(filepath, file.buffer)
    saved.push(filename)
  })

  console.log(`✓ Inspección guardada: ${folderName}/ (${saved.length} fotos)`)
  res.json({
    ok: true,
    carpeta: folderName,
    fotos: saved,
    ruta: destDir,
  })
})

// GET /api/inspecciones – list all inspection folders
app.get('/api/inspecciones', (req, res) => {
  try {
    if (!fs.existsSync(DB_BASE)) {
      return res.json({ inspecciones: [] })
    }
    const dirs = fs.readdirSync(DB_BASE, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '.gitkeep')
      .map(d => {
        const dirPath = path.join(DB_BASE, d.name)
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jpg'))
        const stat = fs.statSync(dirPath)
        // Read metadata if exists
        let tipo = 'auto'
        const metaPath = path.join(dirPath, 'meta.json')
        if (fs.existsSync(metaPath)) {
          try { tipo = JSON.parse(fs.readFileSync(metaPath, 'utf-8')).tipo || 'auto' }
          catch (e) { /* ignore */ }
        }
        return {
          carpeta: d.name,
          fotos: files.sort(),
          tipo,
          fecha: stat.mtime.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        }
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
    res.json({ inspecciones: dirs })
  } catch (err) {
    console.error('Error en /api/inspecciones:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/imagen/:carpeta/:foto – serve a specific image
app.get('/api/imagen/:carpeta/:foto', (req, res) => {
  const filePath = path.join(DB_BASE, req.params.carpeta, req.params.foto)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Imagen no encontrada' })
  res.sendFile(filePath)
})

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, dbPath: DB_BASE })
})

// Página de diagnóstico para mobile
app.get('/diagnostico', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Disposition', 'inline')
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Diagnostico</title>
<style>body{font-family:monospace;padding:20px;background:#111;color:#0f0}pre{white-space:pre-wrap;word-break:break-all}h1{color:#ff0}.ok{color:#0f0}.err{color:#f00}</style>
</head><body>
<h1>BELT FOTOS - Diagnostico</h1>
<div id="log"></div>
<script>
var log = document.getElementById('log');
function l(msg, cls) { var p = document.createElement('pre'); p.className = cls||'ok'; p.textContent = msg; log.appendChild(p); }
l('1. HTML cargado correctamente');
l('User-Agent: ' + navigator.userAgent);
l('URL: ' + location.href);
l('Protocol: ' + location.protocol);
l('Timestamp: ' + new Date().toISOString());
try {
  l('2. Probando fetch /api/health...');
  fetch('/api/health').then(function(r){return r.json()}).then(function(d){
    l('3. API OK: ' + JSON.stringify(d));
  }).catch(function(e){ l('3. API ERROR: '+e.message, 'err'); });
} catch(e) { l('2. Fetch error: '+e.message, 'err'); }
try {
  l('4. Probando carga de JS bundle...');
  var s = document.createElement('script');
  s.src = '/assets/index-m1oZVwbG.js';
  s.onload = function(){ l('5. JS bundle carg\u00f3 OK'); };
  s.onerror = function(e){ l('5. JS bundle FALLO: ' + JSON.stringify(e), 'err'); };
  document.head.appendChild(s);
} catch(e) { l('4. Script error: '+e.message, 'err'); }
l('6. navigator.mediaDevices: ' + (navigator.mediaDevices ? 'SI' : 'NO'));
l('7. ServiceWorker: ' + ('serviceWorker' in navigator ? 'SI' : 'NO'));
if(navigator.connection) l('8. Connection: ' + navigator.connection.effectiveType + ' downlink:' + navigator.connection.downlink + 'Mbps');
</script>
</body></html>`)
})

// SPA fallback: cualquier ruta no-API devuelve index.html
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next()
  const indexPath = path.join(distPath, 'index.html')
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath)
  } else {
    res.status(503).send('App no compilada. Ejecutá: npm run build')
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Belt Fotos corriendo en http://localhost:${PORT}`)
  console.log(`Guardando en: ${DB_BASE}`)
  if (!fs.existsSync(path.join(distPath, 'index.html'))) {
    console.log('⚠️  No hay build. Ejecutá: npm run build')
  }
})

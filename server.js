import express from 'express'
import multer from 'multer'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import nodemailer from 'nodemailer'
import { GoogleGenerativeAI } from '@google/generative-ai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = 3003

// Carpeta destino: configurable por entorno
// LOCAL: carpeta relativa para desarrollo
// SERVIDOR: D:/Fotos - Asegurados
const DB_BASE = process.env.DB_BASE || path.resolve(__dirname, 'database', 'imagenes', 'vehiculos_asegurados')

app.use(cors())
app.use(express.json())

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})

// Admin API key (set in environment, default blocks access)
const ADMIN_KEY = process.env.ADMIN_KEY || ''

// Email notification config (set SMTP_* environment variables)
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com'
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587')
const SMTP_USER = process.env.SMTP_USER || ''
const SMTP_PASS = process.env.SMTP_PASS || ''
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'emision@beltseguros.com'

const transporter = SMTP_USER ? nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
}) : null

async function sendNotificationEmail({ dni, gestion, tipo, fotos, fecha, carpeta }) {
  if (!transporter) {
    console.log('⚠️  Email no configurado (falta SMTP_USER/SMTP_PASS). Saltando notificación.')
    return
  }
  try {
    await transporter.sendMail({
      from: `"BELT Inspecciones" <${SMTP_USER}>`,
      to: NOTIFY_EMAIL,
      subject: `Nueva Inspección Vehicular - DNI ${dni}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#1a1a1a;border-bottom:3px solid #c9e100;padding-bottom:10px;">
            Nueva Inspección Vehicular
          </h2>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <tr><td style="padding:8px;font-weight:bold;color:#666;">N° Gestión:</td><td style="padding:8px;font-weight:bold;">${gestion}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;color:#666;">DNI:</td><td style="padding:8px;">${dni}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#666;">Tipo:</td><td style="padding:8px;">${tipo === 'moto' ? 'Moto' : 'Auto'}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;color:#666;">Fotos:</td><td style="padding:8px;">${fotos} archivos</td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#666;">Fecha:</td><td style="padding:8px;">${fecha}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;color:#666;">Carpeta:</td><td style="padding:8px;font-family:monospace;">${carpeta}</td></tr>
          </table>
          <p style="color:#888;font-size:12px;margin-top:20px;">Este es un mensaje automático del sistema de inspecciones BELT Fotos.</p>
        </div>
      `,
    })
    console.log(`✉️  Email enviado a ${NOTIFY_EMAIL}`)
  } catch (err) {
    console.error('❌ Error enviando email:', err.message)
  }
}

// Forzar no-cache en HTML y PNGs para evitar problemas con Cloudflare/browser cache
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html') || req.path.endsWith('.png')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Content-Disposition', 'inline')
    res.setHeader('X-Content-Type-Options', 'nosniff')
  }
  next()
})

// Servir archivos estáticos del build de producción
const distPath = path.join(__dirname, 'dist')
app.use(express.static(distPath))

// ── Gemini AI pre-capture validation ─────────────────────────
const GEMINI_KEY = process.env.GEMINI_KEY || ''
const genAI = GEMINI_KEY ? new GoogleGenerativeAI(GEMINI_KEY) : null

const FRAME_PROMPTS = {
  'frente':       'Se pide: FRENTE del vehículo (capó, faros, patente delantera). ¿Esta imagen muestra el frente?',
  'lateral-der':  'Se pide: LATERAL DERECHO del vehículo (lado acompañante, perfil completo de costado). ¿Esta imagen muestra el lateral derecho?',
  'lateral-izq':  'Se pide: LATERAL IZQUIERDO del vehículo (lado conductor, perfil completo de costado). ¿Esta imagen muestra el lateral izquierdo?',
  'trasera':      'Se pide: PARTE TRASERA del vehículo (baúl, luces traseras, patente). ¿Esta imagen muestra la trasera?',
  'perfil-der':   'Se pide: PERFIL DERECHO de una moto (lado derecho completo). ¿Esta imagen muestra el perfil derecho de una moto?',
  'perfil-izq':   'Se pide: PERFIL IZQUIERDO de una moto (lado izquierdo completo). ¿Esta imagen muestra el perfil izquierdo de una moto?',
}

const FRAME_SYSTEM = `Sos un validador de encuadre vehicular. Analizás frames de cámara en tiempo real.
Respondé SOLO con JSON: {"ok": true/false}
Reglas:
- "ok": true si la imagen muestra claramente el ángulo/lado que se pide
- "ok": false si muestra otro ángulo (ej: frente cuando se pide lateral), otro lado, o no se ve un vehículo claro
- Sé rápido y preciso. No agregues nada más que el JSON.`

const frameSingle = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 } }).single('frame')

app.post('/api/validar-frame', (req, res, next) => {
  frameSingle(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false })
    next()
  })
}, async (req, res) => {
  if (!genAI || !req.file) return res.json({ ok: true, skip: true })
  const stepId = req.body.stepId || 'frente'
  const prompt = FRAME_PROMPTS[stepId] || FRAME_PROMPTS['frente']

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite', systemInstruction: FRAME_SYSTEM })
    const imageData = req.file.buffer.toString('base64')
    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: 'image/jpeg', data: imageData } }
    ])
    const text = result.response.text().trim()
    const jsonMatch = text.match(/\{[^}]+\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return res.json({ ok: !!parsed.ok })
    }
    res.json({ ok: true, skip: true })
  } catch (err) {
    console.error('⚡ Frame validation error:', err.message?.slice(0, 80))
    res.json({ ok: true, skip: true })
  }
})

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

  const gestion = req.body.gestion || folderName
  const fecha = new Date().toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })

  console.log(`✓ Inspección guardada: ${folderName}/ (${saved.length} fotos)`)
  res.json({
    ok: true,
    carpeta: folderName,
    fotos: saved,
  })

  // Send email notification (async, don't block response)
  sendNotificationEmail({
    dni: dniClean,
    gestion,
    tipo: tipo || 'auto',
    fotos: saved.length,
    fecha,
    carpeta: folderName,
  })
})

// GET /api/inspecciones – PROTECTED: requires admin key
app.get('/api/inspecciones', (req, res) => {
  if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }
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
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/imagen/:carpeta/:foto – PROTECTED + path traversal prevention
app.get('/api/imagen/:carpeta/:foto', (req, res) => {
  if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }
  // Sanitize: prevent path traversal
  const carpeta = path.basename(req.params.carpeta)
  const foto = path.basename(req.params.foto)
  if (carpeta !== req.params.carpeta || foto !== req.params.foto) {
    return res.status(400).json({ error: 'Parámetros inválidos' })
  }
  const filePath = path.join(DB_BASE, carpeta, foto)
  // Ensure resolved path is within DB_BASE
  if (!filePath.startsWith(path.resolve(DB_BASE))) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Imagen no encontrada' })
  res.sendFile(filePath)
})

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '1.3.0' })
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

// SPA fallback: /1-4-0/* → beta version
app.use('/1-4-0', (req, res, next) => {
  if (req.path.startsWith('/api')) return next()
  // If the file exists in dist/1-4-0, serve it (handled by express.static above)
  const filePath = path.join(distPath, '1-4-0', req.path)
  if (req.path !== '/' && fs.existsSync(filePath)) return next()
  const betaIndex = path.join(distPath, '1-4-0', 'index.html')
  if (fs.existsSync(betaIndex)) {
    res.sendFile(betaIndex)
  } else {
    res.status(503).send('v1.4.0 no compilada')
  }
})

// SPA fallback: cualquier ruta no-API devuelve index.html (versión estable)
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

import express from 'express'
import multer from 'multer'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import nodemailer from 'nodemailer'
import { GoogleGenerativeAI } from '@google/generative-ai'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3003

// Carpeta destino: configurable por entorno
// LOCAL: carpeta relativa para desarrollo
// SERVIDOR: D:/Fotos - Asegurados
const DB_BASE = process.env.DB_BASE || '/data/fotos'

// ── Base PostgreSQL de datos de vehículos ──
// Se consulta desde el CRM. Se inicializa de forma resiliente: si falla, la app
// sigue funcionando igual (solo se pierde el guardado de datos de cédula).
let pgPool = null
try {
  const DATABASE_URL = process.env.DATABASE_URL
  if (DATABASE_URL) {
    pgPool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 })
    // Crear tabla si no existe (idempotente)
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS vehiculos (
        dni         TEXT NOT NULL,
        carpeta     TEXT NOT NULL,
        tipo        TEXT,
        dominio     TEXT,
        marca       TEXT,
        modelo      TEXT,
        chasis      TEXT,
        motor       TEXT,
        cuadro      TEXT,
        actualizado TEXT,
        PRIMARY KEY (dni, carpeta)
      );
    `)
    console.log('🗄️  PostgreSQL lista')
  } else {
    console.log('⚠️  DATABASE_URL no configurada. Se deshabilita guardado de datos.')
  }
} catch (err) {
  console.error('⚠️  No se pudo inicializar PostgreSQL (se deshabilita guardado de datos):', err.message)
  pgPool = null
}

async function upsertVehiculo({ dni, carpeta, tipo, data }) {
  if (!pgPool) return
  try {
    await pgPool.query(`
      INSERT INTO vehiculos (dni, carpeta, tipo, dominio, marca, modelo, chasis, motor, cuadro, actualizado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT(dni, carpeta) DO UPDATE SET
        tipo        = COALESCE(NULLIF(EXCLUDED.tipo, ''), vehiculos.tipo),
        dominio     = COALESCE(NULLIF(EXCLUDED.dominio, ''), vehiculos.dominio),
        marca       = COALESCE(NULLIF(EXCLUDED.marca, ''), vehiculos.marca),
        modelo      = COALESCE(NULLIF(EXCLUDED.modelo, ''), vehiculos.modelo),
        chasis      = COALESCE(NULLIF(EXCLUDED.chasis, ''), vehiculos.chasis),
        motor       = COALESCE(NULLIF(EXCLUDED.motor, ''), vehiculos.motor),
        cuadro      = COALESCE(NULLIF(EXCLUDED.cuadro, ''), vehiculos.cuadro),
        actualizado = EXCLUDED.actualizado
    `, [
      dni, carpeta, tipo || '',
      data.dominio || '', data.marca || '', data.modelo || '',
      data.chasis || '', data.motor || '', data.cuadro || '',
      new Date().toISOString(),
    ])
    console.log(`🗄️  Datos de vehículo guardados: ${dni} / ${carpeta}`)
  } catch (err) {
    console.error('❌ Error guardando en PostgreSQL:', err.message)
  }
}

// Escribe un bloc de notas (datos.txt) con los datos de la cédula dentro de la carpeta
function writeDatosTxt({ dni, carpeta, tipo, data }) {
  data = data || {}
  try {
    const destDir = path.join(DB_BASE, path.basename(carpeta))
    if (!fs.existsSync(destDir)) return
    const dash = (v) => (v && v.trim() ? v.trim() : '-')
    const fecha = new Date().toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })
    // Si ya había un datos.txt (p. ej. de la cédula), se conservan los valores que el nuevo documento no trae
    const prev = {}
    const prevPath = path.join(destDir, 'datos.txt')
    if (fs.existsSync(prevPath)) {
      const claves = { 'Dominio': 'dominio', 'Marca': 'marca', 'Modelo': 'modelo', 'N. Chasis': 'chasis', 'N. Motor': 'motor', 'N. Cuadro': 'cuadro', 'Anio': 'anio', 'Es 0km': 'es_0km' }
      for (const linea of fs.readFileSync(prevPath, 'utf-8').split(/\r?\n/)) {
        const i = linea.indexOf(':')
        const k = i > 0 ? claves[linea.slice(0, i).trim()] : null
        const v = i > 0 ? linea.slice(i + 1).trim() : ''
        if (k && v && v !== '-') prev[k] = v
      }
    }
    const merged = { ...prev }
    for (const [k, v] of Object.entries(data)) if (v && String(v).trim()) merged[k] = v
    data = merged
    const contenido =
`==========================================
   BELT SEGUROS - DATOS DEL VEHICULO
==========================================
DNI:            ${dash(dni)}
Carpeta:        ${dash(carpeta)}
Tipo:           ${tipo === 'moto' ? 'Moto' : 'Auto'}
------------------------------------------
Dominio:        ${dash(data.dominio)}
Marca:          ${dash(data.marca)}
Modelo:         ${dash(data.modelo)}
N. Chasis:      ${dash(data.chasis)}
N. Motor:       ${dash(data.motor)}
N. Cuadro:      ${dash(data.cuadro)}
Anio:           ${dash(data.anio)}
Es 0km:         ${dash(data.es_0km)}
------------------------------------------
Actualizado:    ${fecha}
(Datos extraidos automaticamente de la cedula / documento de no rodamiento)
`
    fs.writeFileSync(path.join(destDir, 'datos.txt'), contenido, 'utf-8')
    console.log(`📝 datos.txt escrito en ${carpeta}`)
  } catch (err) {
    console.error('❌ Error escribiendo datos.txt:', err.message)
  }
}

// Guarda los datos de la cédula en PostgreSQL y en el bloc de notas de la carpeta
async function guardarDatosVehiculo(args) {
  await upsertVehiculo(args)
  writeDatosTxt(args)
}

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

async function sendCorrectionEmail({ dni, carpeta, foto, tipo, fecha, etiqueta }) {
  if (!transporter) {
    console.log('⚠️  Email no configurado. Saltando notificación de corrección.')
    return
  }
  try {
    await transporter.sendMail({
      from: `"BELT Inspecciones" <${SMTP_USER}>`,
      to: NOTIFY_EMAIL,
      subject: `Inspección CORREGIDA - DNI ${dni}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#1a1a1a;border-bottom:3px solid #c9e100;padding-bottom:10px;">
            Inspección Corregida
          </h2>
          <p style="color:#b45309;font-weight:bold;">Se reemplazó una foto de una inspección existente.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <tr><td style="padding:8px;font-weight:bold;color:#666;">DNI:</td><td style="padding:8px;">${dni}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;color:#666;">Tipo:</td><td style="padding:8px;">${tipo === 'moto' ? 'Moto' : 'Auto'}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#666;">Foto reemplazada:</td><td style="padding:8px;">${etiqueta || foto}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;color:#666;">Archivo:</td><td style="padding:8px;font-family:monospace;">${foto}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#666;">Carpeta:</td><td style="padding:8px;font-family:monospace;">${carpeta}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;color:#666;">Fecha:</td><td style="padding:8px;">${fecha}</td></tr>
          </table>
          <p style="color:#888;font-size:12px;margin-top:20px;">Este es un mensaje automático del sistema de inspecciones BELT Fotos.</p>
        </div>
      `,
    })
    console.log(`✉️  Email de corrección enviado a ${NOTIFY_EMAIL}`)
  } catch (err) {
    console.error('❌ Error enviando email de corrección:', err.message)
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

// ── Claude (Anthropic) OCR de cédula ─────────────────────────
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || ''
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

const CEDULA_PROMPT = `Sos un extractor de datos de cédulas de identificación vehicular argentinas (cédula verde/azul o título), especializado en transcribir con máxima precisión el número de chasis/VIN, que suele tener 17 caracteres alfanuméricos sin espacios.

PASO 1 — ANÁLISIS (obligatorio, en texto plano antes del JSON):
Para el campo "chasis" en particular, transcribí el valor carácter por carácter, uno por uno, indicando para cada carácter dudoso qué otra letra/número podría confundirse (ej: "posición 5: parece 'O' pero podría ser '0'"). Prestá especial atención a estos pares que se confunden fácilmente en fotos: O/0, I/1/L, B/8, S/5, Z/2, G/6, U/V. Si la imagen está borrosa, con reflejo o el número está parcialmente tapado, decilo explícitamente.

PASO 2 — JSON FINAL (obligatorio):
Después del análisis, escribí la línea "JSON_FINAL:" seguida SOLO del JSON en la línea siguiente, con estas claves EXACTAS y nada más de texto después:
{"dominio": "", "marca": "", "modelo": "", "chasis": "", "motor": "", "cuadro": ""}

Reglas:
- "dominio": patente/dominio del vehículo (ej: AB123CD o ABC123).
- "marca": marca del vehículo.
- "modelo": modelo/versión del vehículo.
- "chasis": número de chasis / VIN. SOLO completá este campo si pudiste leer TODOS los caracteres con confianza alta tras el análisis del PASO 1; si tenés dudas sobre uno o más caracteres que no pudiste resolver, dejalo como string vacío "" en vez de adivinar.
- "motor": número de motor.
- "cuadro": número de cuadro (en motos suele coincidir con el chasis; si no figura, dejar vacío).
- Transcribí exactamente lo que leas, en MAYÚSCULAS, sin espacios extra.
- Si un dato no se ve o no está, dejá el valor como string vacío "".
- No inventes ni completes datos por suposición. Es preferible dejar un campo vacío antes que adivinar mal.`

const NO_RODAMIENTO_PROMPT = `Sos un extractor de datos de certificados de "no rodamiento" argentinos: el documento que emite una concesionaria o fábrica para un vehículo 0 km que todavía no fue patentado ni usado (dice algo como "certifico que la unidad 0 KM cuyos datos se indican a continuación se encuentra en el concesionario ... sin rodar") y lista tipo, marca, modelo, motor, chasis y año.

PASO 1 — ANÁLISIS (obligatorio, en texto plano antes del JSON):
Para "chasis" y "motor" transcribí el valor carácter por carácter, indicando para cada carácter dudoso qué otra letra/número podría confundirse. Prestá especial atención a: O/0, I/1/L, B/8, S/5, Z/2, G/6, U/V. Si el número está borroso, con reflejo o tapado, decilo explícitamente.

PASO 2 — JSON FINAL (obligatorio):
Después del análisis, escribí la línea "JSON_FINAL:" seguida SOLO del JSON en la línea siguiente, con estas claves EXACTAS y nada más de texto después:
{"marca": "", "modelo": "", "anio": "", "chasis": "", "motor": "", "es_0km_certificado": false}

Reglas:
- "marca": marca del vehículo (ej: CFMOTO, TOYOTA).
- "modelo": SOLO el nombre del modelo, corto (ej: 800MT-X, HILUX, ONIX).
- "anio": año del vehículo, 4 dígitos. Si no figura, vacío.
- "chasis": número de chasis / VIN / cuadro. SOLO completalo si leíste TODOS los caracteres con confianza alta; si tenés dudas, dejalo vacío "".
- "motor": número de motor, sin espacios (ej: 288MW SK23810 -> 288MWSK23810).
- "es_0km_certificado": true SOLO si el documento certifica que la unidad es 0 km / sin rodar / de no rodamiento; false en cualquier otro caso.
- Transcribí exactamente lo que leas, en MAYÚSCULAS. Si un dato no se ve o no está, dejalo como string vacío "". No inventes datos.`

// El VIN/chasis de vehículos no arranca con la letra "B" (no es un carácter válido
// como primer dígito en los prefijos que usan las terminales locales). Si el OCR
// lo transcribió así, es casi siempre una confusión visual con el número "8".
function fixChasisLeadingB(value) {
  if (value && value[0] === 'B') return '8' + value.slice(1)
  return value
}

// Extrae datos de la cédula usando Claude. Devuelve objeto o null.
// documento: 'cedula' (default) o 'no_rodamiento' (certificado de 0 km).
async function extractCedulaData(imageBuffer, mimeType = 'image/jpeg', documento = 'cedula') {
  const esNoRod = documento === 'no_rodamiento'
  if (!ANTHROPIC_KEY) {
    console.log('⚠️  ANTHROPIC_KEY no configurada. Saltando OCR de cédula.')
    return null
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBuffer.toString('base64') } },
            { type: 'text', text: esNoRod ? NO_RODAMIENTO_PROMPT : CEDULA_PROMPT },
          ],
        }],
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      console.error('❌ Anthropic API error:', res.status, errText.slice(0, 200))
      return null
    }
    const json = await res.json()
    const text = (json.content || []).map(c => c.text || '').join('').trim()
    // El modelo debe emitir "JSON_FINAL:" antes del JSON; si no está el marcador,
    // caemos de vuelta a buscar el primer bloque {...} en toda la respuesta.
    const markerIdx = text.indexOf('JSON_FINAL:')
    const jsonSection = markerIdx >= 0 ? text.slice(markerIdx + 'JSON_FINAL:'.length) : text
    const match = jsonSection.match(/\{[\s\S]*\}/)
    if (!match) {
      console.error('❌ OCR cédula: respuesta sin JSON:', text.slice(0, 300))
      return null
    }
    console.log('🔎 OCR cédula - análisis:', text.slice(0, markerIdx >= 0 ? markerIdx : 0).trim().slice(0, 500))
    const parsed = JSON.parse(match[0])
    const up = (v) => (v || '').toString().trim().toUpperCase()
    const out = {
      dominio: up(parsed.dominio),
      marca: up(parsed.marca),
      modelo: up(parsed.modelo),
      chasis: fixChasisLeadingB(up(parsed.chasis)),
      motor: esNoRod ? up(parsed.motor).replace(/\s+/g, '') : up(parsed.motor),
      cuadro: fixChasisLeadingB(up(parsed.cuadro)),
    }
    if (esNoRod) {
      out.anio = up(parsed.anio).replace(/\D/g, '').slice(0, 4)
      // Solo se marca 0 km si el documento lo certifica (una cédula nunca lo marca)
      if (String(parsed.es_0km_certificado).trim().toLowerCase() === 'true') out.es_0km = 'SI'
    }
    return out
  } catch (err) {
    console.error('❌ Error en OCR de cédula:', err.message)
    return null
  }
}

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

  // OCR de cédula → guardar datos en PostgreSQL (async, no bloquea la respuesta)
  // El front envía "pasos": JSON con los ids de cada paso, en el mismo orden que las fotos.
  let pasos = []
  try { pasos = JSON.parse(req.body.pasos || '[]') } catch (e) { pasos = [] }
  const cedulaIdx = pasos.indexOf('cedula-f')
  const noRodIdx = pasos.indexOf('no-rodamiento')
  const cedulaFile = cedulaIdx >= 0 ? req.files[cedulaIdx] : null
  const noRodFile = noRodIdx >= 0 ? req.files[noRodIdx] : null
  if (cedulaFile || noRodFile) {
    // Primero la cédula y después el documento de no rodamiento: los datos de la cédula tienen prioridad
    ;(async () => {
      const dCedula = cedulaFile ? await extractCedulaData(cedulaFile.buffer) : null
      const dNoRod = noRodFile ? await extractCedulaData(noRodFile.buffer, 'image/jpeg', 'no_rodamiento') : null
      const data = { ...(dNoRod || {}) }
      for (const [k, v] of Object.entries(dCedula || {})) if (v) data[k] = v
      if (dNoRod || dCedula) await guardarDatosVehiculo({ dni: dniClean, carpeta: folderName, tipo: tipo || 'auto', data })
    })().catch(err => console.error('❌ OCR cédula/no rodamiento (guardar):', err.message))
  }
})

// POST /api/admin/importar-vehiculos – PROTECTED: upsert masivo de filas de la
// tabla `vehiculos` (usado por migrar-datos-recientes.mjs). Reusa upsertVehiculo
// con el pgPool interno de Railway, sin exponer el DATABASE_URL hacia afuera.
app.post('/api/admin/importar-vehiculos', express.json({ limit: '5mb' }), async (req, res) => {
  if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }
  const filas = req.body?.filas
  if (!Array.isArray(filas)) return res.status(400).json({ error: '"filas" debe ser un array' })
  let ok = 0
  for (const fila of filas) {
    try {
      await upsertVehiculo({
        dni: fila.dni,
        carpeta: fila.carpeta,
        tipo: fila.tipo,
        data: {
          dominio: fila.dominio, marca: fila.marca, modelo: fila.modelo,
          chasis: fila.chasis, motor: fila.motor, cuadro: fila.cuadro,
        },
      })
      ok++
    } catch (e) { console.error('❌ Error importando fila:', e.message) }
  }
  res.json({ ok: true, insertados: ok, total: filas.length })
})

// POST /api/admin/importar-carpeta – PROTECTED: sube (o completa) una carpeta
// de inspección tal cual existe en el servidor viejo (fotos, datos.txt, meta.json)
// al Volume de Railway. Usado por migrar-fotos-recientes.mjs. Idempotente:
// sobrescribe archivos si ya existen.
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 20 } })
app.post('/api/admin/importar-carpeta', (req, res, next) => {
  if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }
  importUpload.array('archivos', 20)(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'Error al subir archivos: ' + err.message })
    next()
  })
}, (req, res) => {
  const carpeta = path.basename(req.body.carpeta || '')
  if (!carpeta || carpeta !== req.body.carpeta) {
    return res.status(400).json({ error: 'Nombre de carpeta inválido' })
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No se recibieron archivos' })
  }
  const destDir = path.join(DB_BASE, carpeta)
  if (!destDir.startsWith(path.resolve(DB_BASE))) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }
  fs.mkdirSync(destDir, { recursive: true })
  const saved = []
  for (const file of req.files) {
    const filename = path.basename(file.originalname)
    if (filename !== file.originalname) continue // evita path traversal
    fs.writeFileSync(path.join(destDir, filename), file.buffer)
    saved.push(filename)
  }
  console.log(`📥 Carpeta importada: ${carpeta}/ (${saved.length} archivos)`)
  res.json({ ok: true, carpeta, archivos: saved })
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
  res.json({ ok: true, version: '1.6.2' })
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

// ── CORRECCIÓN DE INSPECCIONES (público, scope por DNI) ──────────

// GET /api/inspecciones-dni/:dni – busca inspecciones cuyo folder empieza con el DNI
app.get('/api/inspecciones-dni/:dni', (req, res) => {
  const dniClean = String(req.params.dni).replace(/\./g, '').replace(/\s/g, '')
  if (!dniClean || !/^\d+$/.test(dniClean)) return res.status(400).json({ error: 'DNI inválido' })
  try {
    if (!fs.existsSync(DB_BASE)) return res.json({ inspecciones: [] })
    const dirs = fs.readdirSync(DB_BASE, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.startsWith(dniClean + '-'))
      .map(d => {
        const dirPath = path.join(DB_BASE, d.name)
        const files = fs.readdirSync(dirPath)
          .filter(f => /^\d+\.jpg$/i.test(f))
          .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
        const stat = fs.statSync(dirPath)
        let tipo = 'auto'
        const metaPath = path.join(dirPath, 'meta.json')
        if (fs.existsSync(metaPath)) {
          try { tipo = JSON.parse(fs.readFileSync(metaPath, 'utf-8')).tipo || 'auto' } catch (e) { /* ignore */ }
        }
        return {
          carpeta: d.name,
          patente: d.name.slice(dniClean.length + 1),
          tipo,
          fotos: files,
          fecha: stat.mtime.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
          mtime: stat.mtime.getTime(),
        }
      })
      .sort((a, b) => b.mtime - a.mtime)
    res.json({ inspecciones: dirs })
  } catch (err) {
    console.error('Error en /api/inspecciones-dni:', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/foto-correccion/:carpeta/:foto – sirve una foto para el flujo de corrección
app.get('/api/foto-correccion/:carpeta/:foto', (req, res) => {
  const carpeta = path.basename(req.params.carpeta)
  const foto = path.basename(req.params.foto)
  if (carpeta !== req.params.carpeta || foto !== req.params.foto || !/^\d+\.jpg$/i.test(foto)) {
    return res.status(400).json({ error: 'Parámetros inválidos' })
  }
  const filePath = path.join(DB_BASE, carpeta, foto)
  if (!filePath.startsWith(path.resolve(DB_BASE))) return res.status(403).json({ error: 'Acceso denegado' })
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Imagen no encontrada' })
  res.setHeader('Cache-Control', 'no-store')
  res.sendFile(filePath)
})

// POST /api/corregir-inspeccion – reemplaza (pisa) una foto puntual de una inspección
app.post('/api/corregir-inspeccion', (req, res, next) => {
  upload.single('foto')(req, res, (err) => {
    if (err) {
      console.error('Multer error (corrección):', err.message)
      return res.status(400).json({ error: 'Error al subir foto: ' + err.message })
    }
    next()
  })
}, (req, res) => {
  const { dni, carpeta, fotoIndex, tipo, etiqueta } = req.body
  if (!dni || !carpeta || !fotoIndex) return res.status(400).json({ error: 'Datos incompletos' })
  if (!req.file) return res.status(400).json({ error: 'No se recibió la foto' })

  const dniClean = String(dni).replace(/\./g, '').replace(/\s/g, '')
  const carpetaSafe = path.basename(carpeta)
  if (carpetaSafe !== carpeta || !carpetaSafe.startsWith(dniClean + '-')) {
    return res.status(400).json({ error: 'Carpeta inválida' })
  }
  const idx = parseInt(fotoIndex, 10)
  if (!Number.isInteger(idx) || idx < 1 || idx > 15) return res.status(400).json({ error: 'Índice inválido' })

  const destDir = path.join(DB_BASE, carpetaSafe)
  if (!destDir.startsWith(path.resolve(DB_BASE)) || !fs.existsSync(destDir)) {
    return res.status(404).json({ error: 'Inspección no encontrada' })
  }

  const filename = `${idx}.jpg`
  fs.writeFileSync(path.join(destDir, filename), req.file.buffer)

  const fecha = new Date().toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })
  console.log(`✓ Inspección CORREGIDA: ${carpetaSafe}/${filename}`)
  res.json({ ok: true, carpeta: carpetaSafe, foto: filename })

  sendCorrectionEmail({ dni: dniClean, carpeta: carpetaSafe, foto: filename, tipo: tipo || 'auto', fecha, etiqueta })

  // Si se corrigió la cédula frente, re-extraer datos y actualizar PostgreSQL
  if (req.body.stepId === 'cedula-f' || req.body.stepId === 'no-rodamiento') {
    const buf = req.file.buffer
    const documento = req.body.stepId === 'no-rodamiento' ? 'no_rodamiento' : 'cedula'
    extractCedulaData(buf, 'image/jpeg', documento).then(async data => {
      if (data) await guardarDatosVehiculo({ dni: dniClean, carpeta: carpetaSafe, tipo: tipo || 'auto', data })
    }).catch(err => console.error('❌ OCR cédula (corrección):', err.message))
  }
})

// ── API para CRM (Railway Private Networking) ──────────────────────
// Estos endpoints los consume el CRM-BELT via red interna de Railway.
// Protegidos con ADMIN_KEY igual que los endpoints de admin.

// GET /api/crm/inspecciones – Lista completa con metadata y stats
app.get('/api/crm/inspecciones', (req, res) => {
  if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }
  try {
    if (!fs.existsSync(DB_BASE)) return res.json({ inspecciones: [] })
    const dirs = fs.readdirSync(DB_BASE, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => {
        const dirPath = path.join(DB_BASE, d.name)
        let stat
        try { stat = fs.statSync(dirPath) } catch (e) { return null }

        // Fotos
        let fotos = []
        try {
          fotos = fs.readdirSync(dirPath)
            .filter(f => /\.(jpg|png|webp)$/i.test(f))
            .sort()
        } catch (e) { /* ignore */ }

        // meta.json
        let meta = {}
        const metaPath = path.join(dirPath, 'meta.json')
        try {
          if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
        } catch (e) { /* ignore */ }

        // datos.txt existe?
        const tiene_datos = fs.existsSync(path.join(dirPath, 'datos.txt'))

        // El CRM (Python) formatea estos timestamps con la timezone por
        // defecto del server (UTC en Railway), sin convertir a Argentina.
        // Como Argentina es UTC-3 fijo (sin horario de verano), restamos
        // 3hs antes de enviarlos: así el CRM, al mostrarlos "tal cual" en
        // UTC, termina mostrando la hora de Argentina correcta sin tocar
        // su código.
        const ART_OFFSET_MS = 3 * 3600 * 1000
        const metaAjustada = { ...meta }
        if (meta.fecha) {
          const t = Date.parse(meta.fecha)
          if (!isNaN(t)) metaAjustada.fecha = new Date(t - ART_OFFSET_MS).toISOString()
        }

        return {
          nombre: d.name,
          mtime: stat.mtime.getTime() / 1000 - ART_OFFSET_MS / 1000,  // epoch seconds (Python compatible)
          fotos,
          n_fotos: fotos.length,
          meta: metaAjustada,
          tiene_datos,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime)

    res.json({ inspecciones: dirs })
  } catch (err) {
    console.error('Error en /api/crm/inspecciones:', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// GET /api/crm/inspeccion/:carpeta/datos – Datos extraidos de la cedula (datos.txt parseado)
app.get('/api/crm/inspeccion/:carpeta/datos', (req, res) => {
  if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }
  const carpeta = path.basename(req.params.carpeta)
  if (carpeta !== req.params.carpeta) return res.status(400).json({ error: 'Parámetros inválidos' })

  const rutaDatos = path.join(DB_BASE, carpeta, 'datos.txt')
  if (!rutaDatos.startsWith(path.resolve(DB_BASE))) return res.status(403).json({ error: 'Acceso denegado' })
  if (!fs.existsSync(rutaDatos)) return res.json({ datos: {} })

  try {
    const contenido = fs.readFileSync(rutaDatos, 'utf-8')
    const datos = {}
    for (const linea of contenido.split('\n')) {
      const trimmed = linea.trim()
      if (!trimmed || trimmed.startsWith('==') || trimmed.startsWith('--') || trimmed.startsWith('(') || trimmed.startsWith('BELT SEGUROS')) continue
      const idx = trimmed.indexOf(':')
      if (idx > 0) {
        const clave = trimmed.slice(0, idx).trim()
        const valor = trimmed.slice(idx + 1).trim()
        if (valor && valor !== '-') datos[clave] = valor
      }
    }
    res.json({ datos })
  } catch (err) {
    console.error('Error leyendo datos.txt:', err)
    res.json({ datos: {} })
  }
})

// DELETE /api/crm/inspeccion/:carpeta – Eliminar carpeta de inspeccion
app.delete('/api/crm/inspeccion/:carpeta', (req, res) => {
  if (!ADMIN_KEY || req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }
  const carpeta = path.basename(req.params.carpeta)
  if (carpeta !== req.params.carpeta) return res.status(400).json({ error: 'Parámetros inválidos' })

  const ruta = path.join(DB_BASE, carpeta)
  if (!ruta.startsWith(path.resolve(DB_BASE))) return res.status(403).json({ error: 'Acceso denegado' })
  if (!fs.existsSync(ruta) || !fs.statSync(ruta).isDirectory()) {
    return res.status(404).json({ error: 'Inspección no encontrada' })
  }

  try {
    fs.rmSync(ruta, { recursive: true, force: true })
    console.log(`🗑️  Inspección eliminada: ${carpeta}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('Error eliminando inspección:', err)
    res.status(500).json({ error: 'Error al eliminar: ' + err.message })
  }
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

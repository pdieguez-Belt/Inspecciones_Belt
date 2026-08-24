// Re-corre el OCR de cédula (nuevo prompt + modelo) sobre carpetas puntuales
// y actualiza datos.txt si el resultado difiere del guardado. NO toca la
// base SQLite (eso lo hace el servidor en producción para evitar tocar el
// archivo .db compartido desde una máquina distinta).
//
// Uso: node batch-fix-cedulas.mjs
import fs from 'fs'
import path from 'path'

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || ''
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
const DB_BASE = process.env.DB_BASE || '\\\\DESKTOP-K5IO86R\\Fotos - Asegurados'

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

async function extractCedulaData(imageBuffer, mimeType = 'image/jpeg') {
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
          { type: 'text', text: CEDULA_PROMPT },
        ],
      }],
    }),
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const json = await res.json()
  const text = (json.content || []).map(c => c.text || '').join('').trim()
  const markerIdx = text.indexOf('JSON_FINAL:')
  const jsonSection = markerIdx >= 0 ? text.slice(markerIdx + 'JSON_FINAL:'.length) : text
  const match = jsonSection.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Sin JSON en respuesta: ' + text.slice(0, 200))
  const parsed = JSON.parse(match[0])
  return {
    dominio: (parsed.dominio || '').toString().trim().toUpperCase(),
    marca: (parsed.marca || '').toString().trim().toUpperCase(),
    modelo: (parsed.modelo || '').toString().trim().toUpperCase(),
    chasis: fixChasisLeadingB((parsed.chasis || '').toString().trim().toUpperCase()),
    motor: (parsed.motor || '').toString().trim().toUpperCase(),
    cuadro: fixChasisLeadingB((parsed.cuadro || '').toString().trim().toUpperCase()),
  }
}

// El VIN/chasis no arranca con la letra "B" — si el OCR la puso primera, casi
// siempre es una confusión visual con el número "8".
function fixChasisLeadingB(value) {
  if (value && value[0] === 'B') return '8' + value.slice(1)
  return value
}

function parseDatosTxt(txt) {
  const get = (label) => {
    const m = txt.match(new RegExp(label + ':\\s*(.*)'))
    return m ? m[1].trim() : ''
  }
  return {
    dni: get('DNI'),
    carpeta: get('Carpeta'),
    tipo: get('Tipo'),
    dominio: get('Dominio'),
    marca: get('Marca'),
    modelo: get('Modelo'),
    chasis: get('N\\. Chasis'),
    motor: get('N\\. Motor'),
    cuadro: get('N\\. Cuadro'),
  }
}

function writeDatosTxt(destDir, { dni, carpeta, tipo, data }) {
  const dash = (v) => (v && v.trim() ? v.trim() : '-')
  const fecha = new Date().toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })
  const contenido = `==========================================
   BELT SEGUROS - DATOS DEL VEHICULO
==========================================
DNI:            ${dni}
Carpeta:        ${carpeta}
Tipo:           ${tipo === 'moto' ? 'Moto' : 'Auto'}
------------------------------------------
Dominio:        ${dash(data.dominio)}
Marca:          ${dash(data.marca)}
Modelo:         ${dash(data.modelo)}
N. Chasis:      ${dash(data.chasis)}
N. Motor:       ${dash(data.motor)}
N. Cuadro:      ${dash(data.cuadro)}
------------------------------------------
Actualizado:    ${fecha}
(Datos extraidos automaticamente de la cedula - CORREGIDO con claude-sonnet-4-6)
`
  fs.writeFileSync(path.join(destDir, 'datos.txt'), contenido, 'utf-8')
}

const SUFIJOS = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [
  'BELT-260804-5406',
  'BELT-260803-2148',
  'BELT-260804-3995',
  'BELT-260803-3185',
  'BELT-260803-6790',
  'BELT-260731-7962',
  'BELT-260730-4401',
  'BELT-260730-5063',
  'BELT-260729-1725',
  'BELT-260729-7839',
  'BELT-260728-2241',
  'BELT-260728-8569',
]

const DRY_RUN = process.env.DRY_RUN === '1'

async function main() {
  if (!ANTHROPIC_KEY) {
    console.error('Falta ANTHROPIC_KEY')
    process.exit(1)
  }
  const allDirs = fs.readdirSync(DB_BASE, { withFileTypes: true }).filter(d => d.isDirectory())
  const resumen = []

  for (const sufijo of SUFIJOS) {
    const dirEntry = allDirs.find(d => d.name.endsWith(sufijo))
    if (!dirEntry) {
      console.log(`⚠️  No se encontró carpeta para ${sufijo}`)
      resumen.push({ sufijo, estado: 'NO_ENCONTRADA' })
      continue
    }
    const carpeta = dirEntry.name
    const destDir = path.join(DB_BASE, carpeta)
    const metaPath = path.join(destDir, 'meta.json')
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    const tipo = meta.tipo || 'auto'
    const dni = meta.dni
    const fotoIdx = tipo === 'moto' ? 8 : 6
    const fotoPath = path.join(destDir, `${fotoIdx}.jpg`)

    const datosTxtPath = path.join(destDir, 'datos.txt')
    const anterior = fs.existsSync(datosTxtPath) ? parseDatosTxt(fs.readFileSync(datosTxtPath, 'utf-8')) : null

    console.log(`\n=== ${carpeta} (tipo=${tipo}, foto=${fotoIdx}.jpg) ===`)
    try {
      const buf = fs.readFileSync(fotoPath)
      const nuevo = await extractCedulaData(buf)

      const campos = ['dominio', 'marca', 'modelo', 'chasis', 'motor', 'cuadro']
      const cambios = campos.filter(c => (anterior?.[c] || '') !== (nuevo[c] || '') && !(anterior?.[c] === '-' && nuevo[c] === ''))

      console.log('Anterior:', anterior)
      console.log('Nuevo:   ', nuevo)
      if (cambios.length === 0) {
        console.log('✓ Sin cambios (el dato ya era correcto).')
        resumen.push({ sufijo, carpeta, estado: 'SIN_CAMBIOS' })
      } else {
        console.log('✏️  Cambios detectados en:', cambios.join(', '))
        if (DRY_RUN) {
          console.log('(DRY_RUN=1: no se escribió datos.txt)')
        } else {
          writeDatosTxt(destDir, { dni, carpeta, tipo, data: nuevo })
          console.log('✓ datos.txt actualizado.')
        }
        resumen.push({ sufijo, carpeta, estado: 'CORREGIDO', cambios, anterior, nuevo })
      }
    } catch (err) {
      console.error('❌ Error:', err.message)
      resumen.push({ sufijo, carpeta, estado: 'ERROR', error: err.message })
    }
  }

  console.log('\n\n========== RESUMEN ==========')
  for (const r of resumen) {
    console.log(JSON.stringify(r))
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

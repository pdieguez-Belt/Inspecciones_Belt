// Script de prueba manual para el OCR de cédula con Claude.
// Uso: ANTHROPIC_KEY=sk-... node test-cedula-ocr.mjs "C:\\ruta\\a\\cedula-frente.jpg"
import fs from 'fs'

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

async function main() {
  const imgPath = process.argv[2]
  if (!imgPath) {
    console.error('Uso: node test-cedula-ocr.mjs <ruta-imagen>')
    process.exit(1)
  }
  if (!ANTHROPIC_KEY) {
    console.error('Falta ANTHROPIC_KEY en el entorno.')
    process.exit(1)
  }
  const buf = fs.readFileSync(imgPath)
  const ext = imgPath.toLowerCase().split('.').pop()
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg'

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
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: buf.toString('base64') } },
          { type: 'text', text: CEDULA_PROMPT },
        ],
      }],
    }),
  })

  if (!res.ok) {
    console.error('Error API:', res.status, await res.text())
    process.exit(1)
  }
  const json = await res.json()
  const text = (json.content || []).map(c => c.text || '').join('').trim()
  console.log('──── RESPUESTA COMPLETA ────')
  console.log(text)
  console.log('────────────────────────────')

  const markerIdx = text.indexOf('JSON_FINAL:')
  const jsonSection = markerIdx >= 0 ? text.slice(markerIdx + 'JSON_FINAL:'.length) : text
  const match = jsonSection.match(/\{[\s\S]*\}/)
  if (match) {
    const parsed = JSON.parse(match[0])
    const fixB = (v) => (v && v[0] === 'B' ? '8' + v.slice(1) : v)
    if (parsed.chasis) parsed.chasis = fixB(parsed.chasis)
    if (parsed.cuadro) parsed.cuadro = fixB(parsed.cuadro)
    console.log('JSON parseado:', parsed)
  } else {
    console.error('No se encontró JSON en la respuesta.')
  }
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})

// Dispara la re-extracción de datos de cédula (OCR) para las 9 inspecciones
// puntuales que se identificaron con errores, usando el endpoint existente
// /api/corregir-inspeccion del propio servidor (así el server actualiza su
// SQLite de forma segura, sin tocarlo desde otra máquina/proceso).
//
// CORRER ESTE SCRIPT EN EL SERVIDOR (C:\BELT), DESPUÉS de:
//   1) Deployar la v1.6.2 (ver DEPLOY-1.6.2.md)
//   2) Reiniciar el servicio beltfotos.exe
//
// Uso:
//   node fix-9-inspecciones.mjs
//
// Variables opcionales:
//   DB_BASE   -> por defecto "D:\\Fotos - Asegurados"
//   BASE_URL  -> por defecto "http://localhost:3003"

import fs from 'fs'
import path from 'path'

const DB_BASE = process.env.DB_BASE || 'D:\\Fotos - Asegurados'
const BASE_URL = process.env.BASE_URL || 'http://localhost:3003'

// carpeta, dni, tipo, índice de la foto "cédula frente" (6 en autos, 8 en motos)
const INSPECCIONES = [
  { carpeta: '28029429-BELT-260723-9629', dni: '28029429', tipo: 'moto', fotoIndex: 8 },
  { carpeta: '25154543-BELT-260723-3193', dni: '25154543', tipo: 'moto', fotoIndex: 8 },
  { carpeta: '29801925-BELT-260722-1979', dni: '29801925', tipo: 'auto', fotoIndex: 6 },
  { carpeta: '22639003-BELT-260721-5831', dni: '22639003', tipo: 'moto', fotoIndex: 8 },
  { carpeta: '35274167-BELT-260721-8850', dni: '35274167', tipo: 'moto', fotoIndex: 8 },
  { carpeta: '22331225-BELT-260720-7944', dni: '22331225', tipo: 'moto', fotoIndex: 8 },
  { carpeta: '43628496-BELT-260717-8691', dni: '43628496', tipo: 'moto', fotoIndex: 8 },
  { carpeta: '38843858-BELT-260717-3353', dni: '38843858', tipo: 'moto', fotoIndex: 8 },
  { carpeta: '38843858-BELT-260717-2073', dni: '38843858', tipo: 'moto', fotoIndex: 8 },
]

async function corregir({ carpeta, dni, tipo, fotoIndex }) {
  const fotoPath = path.join(DB_BASE, carpeta, `${fotoIndex}.jpg`)
  if (!fs.existsSync(fotoPath)) {
    throw new Error(`No existe ${fotoPath}`)
  }
  const buf = fs.readFileSync(fotoPath)
  const form = new FormData()
  form.append('dni', dni)
  form.append('carpeta', carpeta)
  form.append('fotoIndex', String(fotoIndex))
  form.append('tipo', tipo)
  form.append('etiqueta', 'Cédula Frente')
  form.append('stepId', 'cedula-f')
  form.append('foto', new Blob([buf], { type: 'image/jpeg' }), `${fotoIndex}.jpg`)

  const res = await fetch(`${BASE_URL}/api/corregir-inspeccion`, { method: 'POST', body: form })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`)
  return json
}

async function main() {
  console.log(`DB_BASE=${DB_BASE}`)
  console.log(`BASE_URL=${BASE_URL}\n`)
  for (const insp of INSPECCIONES) {
    process.stdout.write(`→ ${insp.carpeta} ... `)
    try {
      const r = await corregir(insp)
      console.log('OK', JSON.stringify(r))
    } catch (err) {
      console.log('ERROR:', err.message)
    }
    // pequeña pausa para no saturar la API de Anthropic
    await new Promise(r => setTimeout(r, 1500))
  }
  console.log('\nListo. Revisá los datos.txt / SQLite y los mails de corrección enviados a emisión.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

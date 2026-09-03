#!/usr/bin/env node
/**
 * Script de migración: fotos del servidor viejo (Windows) → Railway Volume
 *
 * Compara las carpetas de inspección locales contra las que ya existen en
 * Railway (via /api/crm/inspecciones) y sube SOLO las que faltan, con todos
 * sus archivos (fotos .jpg, datos.txt, meta.json).
 *
 * USO:
 *   set RAILWAY_URL=https://tu-app.up.railway.app
 *   set ADMIN_KEY=el-admin-key-configurado-en-railway
 *   node migrar-fotos-recientes.mjs ["\\DESKTOP-K5IO86R\Fotos - Asegurados"]
 *
 *   La ruta local es opcional; por defecto usa la ruta de red del servidor
 *   del cliente.
 */
import fs from 'fs'
import path from 'path'

const LOCAL_BASE = process.argv[2] || '\\\\DESKTOP-K5IO86R\\Fotos - Asegurados'
const RAILWAY_URL = process.env.RAILWAY_URL
const ADMIN_KEY = process.env.ADMIN_KEY

if (!RAILWAY_URL || !ADMIN_KEY) {
  console.error('❌ Faltan variables de entorno: RAILWAY_URL y ADMIN_KEY')
  console.error('   Ejemplo:')
  console.error('   set RAILWAY_URL=https://tu-app.up.railway.app')
  console.error('   set ADMIN_KEY=xxxxx')
  process.exit(1)
}

console.log(`📂 Local: ${LOCAL_BASE}`)
console.log(`🚂 Railway: ${RAILWAY_URL}`)

if (!fs.existsSync(LOCAL_BASE)) {
  console.error(`❌ No se encuentra la ruta local: ${LOCAL_BASE}`)
  process.exit(1)
}

// 1) Traer la lista de carpetas que YA existen en Railway
console.log('\n🔍 Consultando inspecciones existentes en Railway...')
const res = await fetch(`${RAILWAY_URL}/api/crm/inspecciones`, {
  headers: { 'x-admin-key': ADMIN_KEY },
})
if (!res.ok) {
  console.error(`❌ Error consultando Railway (${res.status}): ${await res.text()}`)
  process.exit(1)
}
const { inspecciones: existentes } = await res.json()
const existentesSet = new Set(existentes.map(i => i.nombre))
console.log(`   ${existentesSet.size} carpetas ya en Railway.`)

// 2) Listar carpetas locales
const carpetasLocales = fs.readdirSync(LOCAL_BASE, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('.'))
  .map(d => d.name)
console.log(`   ${carpetasLocales.length} carpetas en el servidor local.`)

// 3) Determinar cuáles faltan
const faltantes = carpetasLocales.filter(c => !existentesSet.has(c))
console.log(`\n📦 ${faltantes.length} carpetas faltan en Railway. Subiendo...\n`)

if (faltantes.length === 0) {
  console.log('✅ Nada para migrar. Todo está sincronizado.')
  process.exit(0)
}

let ok = 0
let fail = 0

for (const carpeta of faltantes) {
  const dirPath = path.join(LOCAL_BASE, carpeta)
  let archivos
  try {
    archivos = fs.readdirSync(dirPath).filter(f => {
      const full = path.join(dirPath, f)
      return fs.statSync(full).isFile()
    })
  } catch (err) {
    console.error(`  ⚠️  ${carpeta}: no se pudo leer (${err.message})`)
    fail++
    continue
  }

  if (archivos.length === 0) {
    console.log(`  ⏭️  ${carpeta}: carpeta vacía, se omite.`)
    continue
  }

  const formData = new FormData()
  formData.append('carpeta', carpeta)
  for (const nombreArchivo of archivos) {
    const buffer = fs.readFileSync(path.join(dirPath, nombreArchivo))
    formData.append('archivos', new Blob([buffer]), nombreArchivo)
  }

  try {
    const up = await fetch(`${RAILWAY_URL}/api/admin/importar-carpeta`, {
      method: 'POST',
      headers: { 'x-admin-key': ADMIN_KEY },
      body: formData,
    })
    const data = await up.json()
    if (!up.ok) throw new Error(data.error || `HTTP ${up.status}`)
    console.log(`  ✅ ${carpeta} (${data.archivos.length} archivos)`)
    ok++
  } catch (err) {
    console.error(`  ❌ ${carpeta}: ${err.message}`)
    fail++
  }
}

console.log(`\n✅ Migración de fotos completada: ${ok} carpetas subidas, ${fail} con error.`)

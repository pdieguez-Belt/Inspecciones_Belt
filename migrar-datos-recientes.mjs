#!/usr/bin/env node
/**
 * Script de migración: tabla `vehiculos` (SQLite, servidor viejo) → Railway
 *
 * A diferencia de migrate-sqlite-to-postgres.mjs (que requiere conectarse
 * directo a PostgreSQL con el DATABASE_URL público), este script usa el
 * endpoint /api/admin/importar-vehiculos del propio servidor Node desplegado
 * en Railway, que ya tiene el pgPool interno configurado. Es idempotente
 * (ON CONFLICT DO UPDATE), así que se puede correr las veces que sea.
 *
 * USO:
 *   set RAILWAY_URL=https://tu-app.up.railway.app
 *   set ADMIN_KEY=el-admin-key-configurado-en-railway
 *   node migrar-datos-recientes.mjs ["\\DESKTOP-K5IO86R\Fotos - Asegurados\inspecciones.db"]
 */
import Database from 'better-sqlite3'
import path from 'path'

const SQLITE_PATH = process.argv[2] ||
  '\\\\DESKTOP-K5IO86R\\Fotos - Asegurados\\inspecciones.db'
const RAILWAY_URL = process.env.RAILWAY_URL
const ADMIN_KEY = process.env.ADMIN_KEY

if (!RAILWAY_URL || !ADMIN_KEY) {
  console.error('❌ Faltan variables de entorno: RAILWAY_URL y ADMIN_KEY')
  process.exit(1)
}

console.log(`📂 SQLite: ${SQLITE_PATH}`)
console.log(`🚂 Railway: ${RAILWAY_URL}`)

const sqlDb = new Database(SQLITE_PATH, { readonly: true })
const filas = sqlDb.prepare('SELECT * FROM vehiculos').all()
sqlDb.close()
console.log(`📊 Registros en SQLite: ${filas.length}`)

if (filas.length === 0) {
  console.log('⚠️  No hay datos para migrar.')
  process.exit(0)
}

const res = await fetch(`${RAILWAY_URL}/api/admin/importar-vehiculos`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
  body: JSON.stringify({ filas }),
})
const data = await res.json()
if (!res.ok) {
  console.error(`❌ Error (${res.status}):`, data.error || data)
  process.exit(1)
}
console.log(`✅ Migración completada: ${data.insertados}/${data.total} registros sincronizados en PostgreSQL.`)

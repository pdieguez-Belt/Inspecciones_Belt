#!/usr/bin/env node
/**
 * Script de migración: SQLite → PostgreSQL
 *
 * Exporta todos los registros de la tabla `vehiculos` desde inspecciones.db
 * (SQLite) y los importa en la base PostgreSQL de Railway.
 *
 * USO:
 *   1. Instalar dependencias:  npm install better-sqlite3 pg
 *   2. Exportar DATABASE_URL:  set DATABASE_URL=postgresql://...
 *   3. Ejecutar:               node migrate-sqlite-to-postgres.mjs [ruta_sqlite]
 *
 *   ruta_sqlite (opcional): ruta al archivo inspecciones.db
 *   Por defecto busca en ./database/imagenes/vehiculos_asegurados/inspecciones.db
 */
import Database from 'better-sqlite3'
import pg from 'pg'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SQLITE_PATH = process.argv[2] ||
  path.join(__dirname, 'database', 'imagenes', 'vehiculos_asegurados', 'inspecciones.db')

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ Falta la variable de entorno DATABASE_URL')
  console.error('   Ejemplo: set DATABASE_URL=postgresql://user:pass@host:5432/railway')
  process.exit(1)
}

console.log(`📂 SQLite: ${SQLITE_PATH}`)
console.log(`🐘 PostgreSQL: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`)

// Leer SQLite
const sqlDb = new Database(SQLITE_PATH, { readonly: true })
const rows = sqlDb.prepare('SELECT * FROM vehiculos').all()
console.log(`📊 Registros en SQLite: ${rows.length}`)

if (rows.length === 0) {
  console.log('⚠️  No hay datos para migrar.')
  process.exit(0)
}

// Conectar a PostgreSQL
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 })

try {
  // Crear tabla si no existe
  await pool.query(`
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
  console.log('✅ Tabla vehiculos creada/verificada en PostgreSQL')

  // Insertar registros
  let ok = 0
  let skip = 0
  for (const row of rows) {
    try {
      await pool.query(`
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
        row.dni, row.carpeta, row.tipo || '',
        row.dominio || '', row.marca || '', row.modelo || '',
        row.chasis || '', row.motor || '', row.cuadro || '',
        row.actualizado || new Date().toISOString(),
      ])
      ok++
    } catch (err) {
      console.error(`  ⚠️ Error en ${row.dni}/${row.carpeta}: ${err.message}`)
      skip++
    }
  }

  console.log(`\n✅ Migración completada: ${ok} insertados, ${skip} con error`)

  // Verificar
  const { rows: pgRows } = await pool.query('SELECT COUNT(*) as count FROM vehiculos')
  console.log(`🐘 Total registros en PostgreSQL: ${pgRows[0].count}`)
} finally {
  await pool.end()
  sqlDb.close()
}

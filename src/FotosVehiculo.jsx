import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, Camera, RotateCcw, CheckCircle, Download, X, Save, Upload, Image, Car, Bike, MessageCircle, Zap, ZapOff } from 'lucide-react'

const APP_VERSION = '1.3.6'

// Preload logo for watermark
const logoImg = new window.Image()
logoImg.src = `/logo-belt.png?v=${Date.now()}`

function generarNumeroGestion() {
  const now = new Date()
  const year = now.getFullYear().toString().slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const random = Math.floor(Math.random() * 9000 + 1000)
  return `BELT-${year}${month}${day}-${random}`
}

// ── AUTO: 9 fotos en 3 secciones ──
const STEPS_AUTO = [
  // Sección A – Fotos del Auto
  { id: 'frente',       fullLabel: 'Frente (Patente Visible)',  instruction: 'Patente legible. Faros en cuadro.',                section: 'A', sectionLabel: 'Fotos del Auto',        view: 'front' },
  { id: 'lateral-der',  fullLabel: 'Lateral Derecho',           instruction: 'Lateral completo visible. Puertas en cuadro.',     section: 'A', sectionLabel: 'Fotos del Auto',        view: 'side' },
  { id: 'lateral-izq',  fullLabel: 'Lateral Izquierdo',         instruction: 'Lateral completo visible. Puertas en cuadro.',     section: 'A', sectionLabel: 'Fotos del Auto',        view: 'side-flip' },
  { id: 'trasera',      fullLabel: 'Trasera (Patente Visible)',  instruction: 'Patente legible. Luces traseras en cuadro.',      section: 'A', sectionLabel: 'Fotos del Auto',        view: 'rear' },
  // Sección B – Identificación y Datos
  { id: 'tablero',      fullLabel: 'Tablero',                   instruction: 'Foto con el tablero encendido.',                   section: 'B', sectionLabel: 'Identificación y Datos', view: 'tablero' },
  { id: 'cedula-f',     fullLabel: 'Cédula Frente',             instruction: 'Frente de la cédula del titular.',                 section: 'B', sectionLabel: 'Identificación y Datos', view: 'cedula-frente' },
  { id: 'cedula-d',     fullLabel: 'Cédula Dorso',              instruction: 'Dorso de la cédula del titular.',                  section: 'B', sectionLabel: 'Identificación y Datos', view: 'cedula-dorso' },
  // Sección C – Estado Exterior
  { id: 'cristales',    fullLabel: 'Cristales y Parabrisas',    instruction: 'Registro de daños en cristales.',                  section: 'C', sectionLabel: 'Estado Exterior',       view: 'cristales' },
  { id: 'neumaticos',   fullLabel: 'Neumáticos (Desgaste)',     instruction: 'Detalle del estado y desgaste.',                   section: 'C', sectionLabel: 'Estado Exterior',       view: 'neumaticos' },
]

// ── MOTO: 9 fotos en 2 secciones ──
const STEPS_MOTO = [
  // Sección A – Fotos de la Moto
  { id: 'frente',       fullLabel: 'Frente',                    instruction: 'Patente delantera legible. Faro en cuadro.',        section: 'A', sectionLabel: 'Fotos de la Moto',      view: 'moto-front' },
  { id: 'perfil-der',   fullLabel: 'Perfil Derecho',            instruction: 'Lateral derecho completo. Ruedas en cuadro.',       section: 'A', sectionLabel: 'Fotos de la Moto',      view: 'moto-side' },
  { id: 'perfil-izq',   fullLabel: 'Perfil Izquierdo',          instruction: 'Lateral izquierdo completo. Ruedas en cuadro.',     section: 'A', sectionLabel: 'Fotos de la Moto',      view: 'moto-side-flip' },
  { id: 'trasera',      fullLabel: 'Trasera',                   instruction: 'Patente trasera legible. Luces de posición en cuadro.', section: 'A', sectionLabel: 'Fotos de la Moto',  view: 'moto-rear' },
  // Sección B – Identificación y Datos
  { id: 'chasis',       fullLabel: 'N° de Chasis / VIN',        instruction: 'Foto nítida del número de chasis.',                section: 'B', sectionLabel: 'Identificación y Datos', view: 'chasis' },
  { id: 'motor',        fullLabel: 'N° de Motor',               instruction: 'Foto nítida del número de motor.',                 section: 'B', sectionLabel: 'Identificación y Datos', view: 'motor' },
  { id: 'tablero',      fullLabel: 'Tablero',                   instruction: 'Foto con el tablero encendido.',                   section: 'B', sectionLabel: 'Identificación y Datos', view: 'tablero' },
  { id: 'cedula-f',     fullLabel: 'Cédula Frente',             instruction: 'Frente de la cédula del titular.',                 section: 'B', sectionLabel: 'Identificación y Datos', view: 'cedula-frente' },
  { id: 'cedula-d',     fullLabel: 'Cédula Dorso',              instruction: 'Dorso de la cédula del titular.',                  section: 'B', sectionLabel: 'Identificación y Datos', view: 'cedula-dorso' },
]

function fmtShort(d) {
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function fmtLong(d) {
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} ${d.getFullYear()}`
}

// ── Vehicle & document silhouettes (using custom PNG images) ──
const VIEW_TO_IMG = {
  'front':           '/img/frente.png',
  'side':            '/img/lateral.png',
  'side-flip':       '/img/lateral.png',
  'rear':            '/img/trasera.png',
  'tablero':         '/img/tablero.png',
  'cedula-frente':   '/img/dni-frente.png',
  'cedula-dorso':    '/img/dni-dorso.png',
  'dni-frente':      '/img/dni-frente.png',
  'dni-dorso':       '/img/dni-dorso.png',
  'cristales':       '/img/cristales.png',
  'neumaticos':      '/img/neumaticos.png',
  'moto-front':      '/img/moto-frente.png',
  'moto-side':       '/img/moto-lateral.png',
  'moto-side-flip':  '/img/moto-lateral.png',
  'moto-rear':       '/img/moto-trasera.png',
  'chasis':          '/img/chasis.png',
  'motor':           '/img/motor.png',
}

function VehicleSilhouette({ view }) {
  const flip = view === 'side-flip' || view === 'moto-side-flip'
  const src = VIEW_TO_IMG[view]
  if (!src) return null
  return (
    <img
      src={src}
      alt={view}
      className="w-full h-full object-contain"
      style={{
        opacity: 0.4,
        transform: flip ? 'scaleX(-1)' : undefined,
        filter: 'invert(1)',
      }}
      draggable={false}
    />
  )
}

// ── Watermark applied to canvas after capture ────────────────────
function applyWatermark(canvas, step, geoCoords, locality) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  const now = new Date()
  const timestamp = fmtShort(now)
  const geoStr = locality || (geoCoords ? `${geoCoords.lat.toFixed(4)}, ${geoCoords.lng.toFixed(4)}` : 'Sin ubicación')

  // ─── 1. MARCA DE AGUA: fecha/hora/localidad centrada en parte superior ───
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const wmFontSize = Math.max(28, Math.floor(W * 0.058))
  const centerX = W / 2
  const wmY = Math.floor(H * 0.13)
  // Sombra muy fuerte para legibilidad en fondos claros
  ctx.shadowColor = 'rgba(0,0,0,1)'
  ctx.shadowBlur = 16
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  // Fecha y hora (grande)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = `900 ${wmFontSize}px Arial`
  ctx.fillText(timestamp, centerX, wmY)
  ctx.fillText(timestamp, centerX, wmY)
  // Localidad - dividir en 2 líneas si no entra
  const geoFontSize = Math.floor(wmFontSize * 0.7)
  ctx.font = `900 ${geoFontSize}px Arial`
  ctx.fillStyle = 'rgba(255,255,255,0.40)'
  const maxW = W * 0.9
  if (ctx.measureText(geoStr).width <= maxW) {
    ctx.fillText(geoStr, centerX, wmY + wmFontSize * 1.5)
    ctx.fillText(geoStr, centerX, wmY + wmFontSize * 1.5)
  } else {
    // Dividir por la coma más cercana al medio
    const mid = Math.floor(geoStr.length / 2)
    let splitIdx = geoStr.lastIndexOf(',', mid)
    if (splitIdx < 3) splitIdx = geoStr.indexOf(',', mid)
    if (splitIdx < 0) splitIdx = mid
    const line1 = geoStr.slice(0, splitIdx + 1).trim()
    const line2 = geoStr.slice(splitIdx + 1).trim()
    const lineH = geoFontSize * 1.3
    ctx.fillText(line1, centerX, wmY + wmFontSize * 1.5)
    ctx.fillText(line1, centerX, wmY + wmFontSize * 1.5)
    ctx.fillText(line2, centerX, wmY + wmFontSize * 1.5 + lineH)
    ctx.fillText(line2, centerX, wmY + wmFontSize * 1.5 + lineH)
  }
  ctx.restore()

  // ─── 2. TOP BANNER ───
  const topH = Math.max(52, Math.floor(H * 0.07))
  const px = Math.floor(W * 0.02)
  ctx.fillStyle = 'rgba(0,0,0,0.88)'
  ctx.fillRect(0, 0, W, topH)
  ctx.fillStyle = '#c9e100'
  ctx.fillRect(0, 0, Math.max(5, Math.floor(W * 0.008)), topH)

  // Logo in top banner
  if (logoImg.complete && logoImg.naturalWidth > 0) {
    const logoH = Math.floor(topH * 0.7)
    const logoW = Math.floor(logoH * (logoImg.naturalWidth / logoImg.naturalHeight))
    ctx.drawImage(logoImg, px + Math.floor(W * 0.005), Math.floor((topH - logoH) / 2), logoW, logoH)
  }

  // Step label (right)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.floor(topH * 0.38)}px Arial`
  ctx.fillText(step.fullLabel.toUpperCase(), W - px, topH * 0.5)

  // ─── 3. BOTTOM BANNER ───
  const botH = Math.max(40, Math.floor(H * 0.045))
  ctx.fillStyle = 'rgba(0,0,0,0.88)'
  ctx.fillRect(0, H - botH, W, botH)
  ctx.fillStyle = '#c9e100'
  ctx.fillRect(0, H - botH, Math.max(5, Math.floor(W * 0.008)), botH)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#c9e100'
  ctx.font = `bold ${Math.floor(botH * 0.4)}px Arial`
  ctx.fillText('INSPECCIÓN VEHICULAR', px, H - botH + botH * 0.5)

  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `${Math.floor(botH * 0.3)}px Arial`
  ctx.fillText(`v${APP_VERSION}`, W - px, H - botH + botH * 0.5)
}

// ── Main component ───────────────────────────────────────────────
export default function FotosVehiculo() {
  const videoRef  = useRef(null)
  const streamRef = useRef(null)

  const [vehicleType, setVehicleType] = useState(null) // 'auto' | 'moto'
  const [stepIdx,   setStepIdx]   = useState(0)
  // Phases: select → camera → preview → form → saving → complete
  const [phase,     setPhase]     = useState('select')
  const [photos,    setPhotos]    = useState([])
  const [preview,   setPreview]   = useState(null)
  const [camReady,  setCamReady]  = useState(false)
  const [camError,  setCamError]  = useState(null)
  const [flashOn,   setFlashOn]   = useState(false)
  const [flashAvail, setFlashAvail] = useState(false)
  const [clock,     setClock]     = useState(new Date())

  // Form data
  const [dni,       setDni]       = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState(null)
  const [uploadErr, setUploadErr] = useState(null)
  const [saved,     setSaved]     = useState(false)
  const [numGestion, setNumGestion] = useState(null)
  const [geoCoords, setGeoCoords] = useState(null)
  const [geoLocality, setGeoLocality] = useState(null)

  const STEPS = vehicleType === 'moto' ? STEPS_MOTO : STEPS_AUTO
  const step = STEPS[stepIdx] || STEPS[0]
  const isSide = step.view === 'side' || step.view === 'side-flip' || step.view === 'moto-side' || step.view === 'moto-side-flip'
  const isDoc = ['tablero','cedula-frente','cedula-dorso','dni-frente','dni-dorso','cristales','neumaticos','chasis','motor'].includes(step.view)
  const sections = [...new Set(STEPS.map(s => s.section))]
  const currentSectionIdx = sections.indexOf(step.section)

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Geolocation: get position + reverse geocode for locality
  useEffect(() => {
    if (!vehicleType) return
    if (!navigator.geolocation) return
    let geocoded = false
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setGeoCoords(coords)
        if (!geocoded) {
          geocoded = true
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&zoom=14`)
            .then(r => r.json())
            .then(data => {
              const a = data.address || {}
              const suburb = a.suburb || a.neighbourhood || a.city_district || ''
              const city = a.city || a.town || a.municipality || ''
              const state = a.state || ''
              const country = a.country || ''
              const parts = [suburb, city, state, country].filter(Boolean)
              // Deduplicate (e.g. if city === state)
              const unique = [...new Set(parts)]
              setGeoLocality(unique.length > 0 ? unique.join(', ') : `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`)
            })
            .catch(() => setGeoLocality(`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`))
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [vehicleType])

  // Camera: start when vehicle type is selected (phase goes to camera)
  useEffect(() => {
    if (!vehicleType) return
    let active = true
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then(stream => {
      if (!active) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          setCamReady(true)
          const track = stream.getVideoTracks()[0]
          const caps = track.getCapabilities?.()
          if (caps?.torch) setFlashAvail(true)
        }
      }
    }).catch(() => {
      if (active) setCamError('No se pudo acceder a la cámara. Verificá los permisos del navegador.')
    })
    return () => {
      active = false
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [vehicleType])

  // Re-init camera whenever we enter camera phase and stream is dead
  useEffect(() => {
    if (phase !== 'camera') return
    // If stream still alive, just re-attach
    if (streamRef.current && streamRef.current.active) {
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current
        videoRef.current.play().catch(() => {})
        setCamReady(true)
      }
      return
    }
    // Stream was stopped – request a new one
    setCamReady(false)
    setCamError(null)
    let active = true
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then(stream => {
      if (!active) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          setCamReady(true)
          const track = stream.getVideoTracks()[0]
          const caps = track.getCapabilities?.()
          if (caps?.torch) setFlashAvail(true)
        }
      }
    }).catch(() => {
      if (active) setCamError('No se pudo acceder a la cámara. Verificá los permisos del navegador.')
    })
    return () => { active = false }
  }, [phase])

  // Stop camera when leaving to form/complete/select
  useEffect(() => {
    if (phase === 'form' || phase === 'complete' || phase === 'select') {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [phase])

  // Capture photo – NO auto-download, just store in memory
  const handleCapture = useCallback(() => {
    const video = videoRef.current
    if (!video || !camReady) return
    const currentStep = STEPS[stepIdx]
    const canvas = document.createElement('canvas')
    canvas.width  = video.videoWidth  || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d').drawImage(video, 0, 0)
    applyWatermark(canvas, currentStep, geoCoords, geoLocality)

    canvas.toBlob((blob) => {
      if (!blob) return
      const previewUrl = URL.createObjectURL(blob)
      setPhotos(prev => [...prev, { url: previewUrl, label: currentStep.fullLabel, blob }])
      setPreview(previewUrl)
      setPhase('preview')
    }, 'image/jpeg', 0.93)
  }, [camReady, stepIdx, geoCoords, geoLocality])

  const handleNext = () => {
    if (stepIdx < STEPS.length - 1) { setStepIdx(s => s + 1); setPhase('camera') }
    else setPhase('form')  // Go to DNI/Patente form
  }

  const handleRetake = () => {
    setPhotos(prev => prev.slice(0, -1))
    setPreview(null)
    setPhase('camera')
  }

  // Upload photos to server
  const handleUpload = async () => {
    if (!dni.trim()) return
    setUploading(true)
    setUploadErr(null)

    const dniClean = dni.trim().replace(/\./g, '').replace(/\s/g, '')
    const gestion = generarNumeroGestion()
    const formData = new FormData()
    formData.append('dni', dniClean)
    formData.append('patente', gestion)
    formData.append('tipo', vehicleType)
    formData.append('gestion', gestion)
    photos.forEach(p => formData.append('fotos', p.blob, `foto.jpg`))

    try {
      const res = await fetch('/api/guardar-inspeccion', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error del servidor')
      setUploadMsg(data.carpeta)
      setNumGestion(gestion)
      setSaved(true)
      setPhase('complete')
    } catch (err) {
      setUploadErr(err.message)
    } finally {
      setUploading(false)
    }
  }

  // Save all photos to device gallery
  const handleSaveToGallery = async () => {
    const files = photos.map((p, i) => {
      const filename = `BELT_${STEPS[i].id}_${dni.trim()}.jpg`
      return new File([p.blob], filename, { type: 'image/jpeg' })
    })

    // Try sharing all files at once
    if (navigator.share && navigator.canShare?.({ files })) {
      try { await navigator.share({ files, title: 'BELT – Inspección Vehicular' }) }
      catch { /* user cancelled */ }
    } else {
      // Fallback: download each file
      for (const file of files) {
        const url = URL.createObjectURL(file)
        Object.assign(document.createElement('a'), { href: url, download: file.name }).click()
        setTimeout(() => URL.revokeObjectURL(url), 500)
        await new Promise(r => setTimeout(r, 300))
      }
    }
  }

  const handleSelectVehicle = (type) => {
    setVehicleType(type)
    setPhase('camera')
  }

  // Send WhatsApp with gestion details (ping QR for tracking)
  const handleWhatsApp = () => {
    // Tracking ping al QR
    fetch('https://uqr.to/28imm', { mode: 'no-cors' }).catch(() => {})
    // Abrir WhatsApp con mensaje completo
    const msg = `*INSPECCIÓN REALIZADA*%0A%0A` +
      `*Mi número de inspección es el ${numGestion}*%0A%0A` +
      `DNI: *${dni.trim()}*%0A` +
      `Tipo: *${vehicleType === 'moto' ? 'Moto' : 'Auto'}*%0A` +
      `Fotos: ${photos.length}%0A` +
      `Fecha: ${new Date().toLocaleDateString('es-AR')}`
    window.open(`https://wa.me/5491125333156?text=${msg}`, '_blank')
  }

  const goBack = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setVehicleType(null); setPhase('select'); setStepIdx(0);
    setPhotos([]); setPreview(null); setDni('');
    setUploadMsg(null); setUploadErr(null); setSaved(false);
    setCamReady(false); setCamError(null); setNumGestion(null);
    setGeoCoords(null); setGeoLocality(null); setFlashOn(false); setFlashAvail(false);
  }

  // ── SELECT screen (Auto / Moto) ─────────────────────────────
  if (phase === 'select') return (
    <div className="min-h-screen bg-belt-dark flex flex-col safe-top safe-bottom">
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="mb-8 text-center">
          <img src={`/logo-belt.png?v=${APP_VERSION}`} alt="BELT Seguros" className="w-40 mx-auto mb-4"/>
          <h1 className="text-white font-black text-2xl mb-2">Inspección Vehicular</h1>
          <p className="text-gray-400 text-sm">Seleccioná el tipo de vehículo para comenzar</p>
        </div>
        <div className="w-full max-w-xs space-y-4">
          <button onClick={() => handleSelectVehicle('auto')}
            className="w-full bg-white/10 border border-white/20 hover:border-belt-yellow hover:bg-belt-yellow/10 rounded-2xl p-6 flex items-center gap-5 transition-all active:scale-95 group">
            <div className="w-16 h-16 bg-belt-yellow/15 group-hover:bg-belt-yellow/25 rounded-xl flex items-center justify-center transition-all">
              <Car size={32} className="text-belt-yellow"/>
            </div>
            <div className="text-left">
              <p className="text-white font-black text-lg">Auto</p>
              <p className="text-gray-400 text-xs">11 fotos: vehículo, documentos y estado</p>
            </div>
          </button>
          <button onClick={() => handleSelectVehicle('moto')}
            className="w-full bg-white/10 border border-white/20 hover:border-belt-yellow hover:bg-belt-yellow/10 rounded-2xl p-6 flex items-center gap-5 transition-all active:scale-95 group">
            <div className="w-16 h-16 bg-belt-yellow/15 group-hover:bg-belt-yellow/25 rounded-xl flex items-center justify-center transition-all">
              <Bike size={32} className="text-belt-yellow"/>
            </div>
            <div className="text-left">
              <p className="text-white font-black text-lg">Moto</p>
              <p className="text-gray-400 text-xs">11 fotos: moto, documentos e identificación</p>
            </div>
          </button>
        </div>
        <p className="text-gray-600 text-[10px] mt-8 text-center uppercase tracking-widest font-bold">BELT Seguros · Inspección Digital</p>
      </div>
      <p className="fixed bottom-3 right-3 text-gray-600 text-[10px] font-mono">v{APP_VERSION}</p>
    </div>
  )

  // ── COMPLETE screen ──────────────────────────────────────────
  if (phase === 'complete') return (
    <div className="min-h-screen bg-belt-dark flex flex-col safe-top safe-bottom">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
          <CheckCircle size={18} className="text-green-400"/>
        </div>
        <div>
          <p className="text-white font-black">¡Inspección completa!</p>
          <p className="text-gray-400 text-xs">{photos.length} fotos guardadas en el servidor</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {numGestion && (
          <div className="bg-belt-yellow/10 border border-belt-yellow/30 rounded-xl p-4 mb-5">
            <p className="text-belt-yellow text-xs font-bold uppercase tracking-wide mb-1">N° de Gestión</p>
            <p className="text-white font-black text-2xl font-mono">{numGestion}</p>
            <p className="text-gray-400 text-xs mt-1">DNI: <span className="text-white font-bold">{dni.trim()}</span></p>
          </div>
        )}

        {uploadMsg && (
          <div className="bg-green-900/30 border border-green-500/30 rounded-xl p-4 mb-5">
            <p className="text-green-400 text-sm font-bold flex items-center gap-2"><Save size={14}/> Guardado exitoso</p>
            <p className="text-gray-300 text-xs mt-1">Carpeta: <span className="text-white font-mono">{uploadMsg}</span></p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-6">
          {photos.map((p, i) => (
            <div key={i} className="relative rounded-xl overflow-hidden aspect-video bg-gray-800">
              <img src={p.url} alt={p.label} className="w-full h-full object-cover"/>
              <div className="absolute inset-x-0 bottom-0 bg-black/70 py-1.5 px-2">
                <p className="text-white text-[10px] font-bold truncate">{i + 1}. {p.label}</p>
              </div>
            </div>
          ))}
        </div>

        <button onClick={handleWhatsApp}
          className="w-full flex items-center justify-center gap-2 bg-green-600 active:bg-green-700 text-white font-bold py-4 rounded-xl transition-all mb-3">
          <MessageCircle size={18}/> Enviar datos por WhatsApp
        </button>

        <button onClick={handleSaveToGallery}
          className="w-full flex items-center justify-center gap-2 bg-white/10 active:bg-white/20 text-white font-bold py-4 rounded-xl transition-all mb-3">
          <Image size={16}/> Guardar en mi fototeca
        </button>

        <button onClick={goBack} className="w-full btn-primary flex items-center justify-center gap-2 py-4 text-base">
          <CheckCircle size={16}/> Finalizar
        </button>
      </div>
      <p className="fixed bottom-3 right-3 text-gray-600 text-[10px] font-mono">v{APP_VERSION}</p>
    </div>
  )

  // ── FORM screen (Patente) ──────────────────────────────────
  if (phase === 'form') return (
    <div className="min-h-screen bg-belt-dark flex flex-col safe-top safe-bottom">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <div className="w-8 h-8 bg-belt-yellow/20 rounded-full flex items-center justify-center flex-shrink-0">
          <Camera size={18} className="text-belt-yellow"/>
        </div>
        <div>
          <p className="text-white font-black">{photos.length} fotos tomadas</p>
          <p className="text-gray-400 text-xs">Completá los datos para guardar</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {/* Photo thumbnails */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {photos.map((p, i) => (
            <div key={i} className="relative rounded-lg overflow-hidden aspect-video bg-gray-800">
              <img src={p.url} alt={p.label} className="w-full h-full object-cover"/>
              <div className="absolute bottom-0 inset-x-0 bg-black/70 text-center">
                <p className="text-white text-[9px] font-bold py-0.5">{i + 1}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-1.5 block">DNI del titular</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ej: 35.123.456"
              value={dni}
              onChange={e => setDni(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3.5 text-white text-lg font-bold placeholder-gray-500 focus:outline-none focus:border-belt-yellow focus:ring-1 focus:ring-belt-yellow transition-all"
            />
          </div>
        </div>

        {uploadErr && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-3 mb-4">
            <p className="text-red-400 text-sm">{uploadErr}</p>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!dni.trim() || uploading}
          className="w-full btn-primary flex items-center justify-center gap-2 py-4 text-base disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <>
              <div className="w-5 h-5 border-2 border-belt-dark border-t-transparent rounded-full animate-spin"/>
              Guardando...
            </>
          ) : (
            <>
              <Upload size={18}/> Guardar inspección
            </>
          )}
        </button>

        <button onClick={() => { setPhase('camera'); setStepIdx(0); setPhotos([]) }}
          className="w-full flex items-center justify-center gap-2 text-gray-400 text-sm mt-4 py-2">
          <RotateCcw size={14}/> Volver a tomar fotos
        </button>
      </div>
    </div>
  )

  // ── PREVIEW screen ───────────────────────────────────────────
  if (phase === 'preview') return (
    <div className="fixed inset-0 bg-black flex flex-col" style={{ touchAction: 'none' }}>
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-belt-dark safe-top">
        <p className="text-white font-black text-sm">{step.fullLabel}</p>
        <span className="text-belt-yellow text-xs font-bold bg-white/10 px-2.5 py-1 rounded-full">{stepIdx + 1} / {STEPS.length}</span>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center bg-black overflow-hidden">
        {preview && <img src={preview} alt="preview" className="w-full h-full object-contain"/>}
      </div>
      <div className="flex-shrink-0 bg-belt-dark px-4 py-4 space-y-3 safe-bottom">
        {stepIdx < STEPS.length - 1 && (
          <p className="text-center text-xs text-gray-400">
            Siguiente: <span className="text-white font-semibold">{STEPS[stepIdx + 1].fullLabel}</span>
          </p>
        )}
        <div className="flex gap-3">
          <button onClick={handleRetake}
            className="flex-1 flex items-center justify-center gap-2 bg-white/10 active:bg-white/20 text-white font-bold py-4 rounded-xl transition-all">
            <RotateCcw size={16}/> Repetir
          </button>
          <button onClick={handleNext}
            className="flex-1 flex items-center justify-center gap-2 btn-primary py-4">
            {stepIdx < STEPS.length - 1 ? <><Camera size={16}/> Siguiente</> : <><Save size={16}/> Guardar</>}
          </button>
        </div>
      </div>
    </div>
  )

  // ── CAMERA screen ────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black flex flex-col" style={{ userSelect: 'none' }}>

      {/* Video */}
      <video ref={videoRef} autoPlay playsInline muted
        className="absolute inset-0 w-full h-full object-cover"/>

      {/* Top overlay */}
      <div className="absolute top-0 inset-x-0 z-20 safe-top"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)' }}>
        <div className="flex items-center justify-between px-4 pt-3 pb-6">
          <button onClick={goBack}
            className="w-9 h-9 bg-black/50 rounded-full flex items-center justify-center text-white backdrop-blur">
            <X size={18}/>
          </button>
          <div className="text-center">
            <p className="text-white font-black text-xl leading-none tabular-nums">
              {clock.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            <p className="text-gray-300 text-[11px] font-medium mt-0.5">{fmtLong(clock)}</p>
          </div>
          <div className="bg-belt-yellow text-belt-dark font-black text-xs px-3 py-1.5 rounded-full">
            {stepIdx + 1}/{STEPS.length}
          </div>
        </div>
      </div>

      {/* Guide overlay – maximized to fill screen */}
      <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
        style={{ top: '70px', bottom: '150px', left: '8px', right: '8px' }}>
        <VehicleSilhouette view={step.view}/>
      </div>

      {/* Loading / error */}
      {!camReady && !camError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <div className="w-12 h-12 border-2 border-belt-yellow border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
            <p className="text-white text-sm font-medium">Iniciando cámara...</p>
          </div>
        </div>
      )}
      {camError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/90 px-6">
          <div className="text-center">
            <p className="text-red-400 font-bold text-lg mb-2">Sin acceso a la cámara</p>
            <p className="text-gray-400 text-sm mb-5">{camError}</p>
            <button onClick={goBack} className="btn-primary">Volver</button>
          </div>
        </div>
      )}

      {/* Bottom overlay */}
      <div className="absolute bottom-0 inset-x-0 z-20 safe-bottom"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)' }}>
        <div className="px-6 pt-6 pb-5">
          {/* Progress bar */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 bg-white/10 rounded-full h-2.5">
              <div className="bg-belt-yellow h-2.5 rounded-full transition-all duration-500" style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }}/>
            </div>
            <span className="text-belt-yellow text-xs font-bold tabular-nums w-10 text-right">{Math.round(((stepIdx + 1) / STEPS.length) * 100)}%</span>
          </div>
          <p className="text-white text-center font-bold text-base mb-1">{step.fullLabel}</p>
          <p className="text-gray-300 text-center text-sm mb-4">{step.instruction}</p>

          {/* Shutter + Flash */}
          <div className="flex items-center justify-center gap-6">
            {/* Flash toggle */}
            <button
              onClick={() => {
                const track = streamRef.current?.getVideoTracks()[0]
                if (!track) return
                const newState = !flashOn
                track.applyConstraints({ advanced: [{ torch: newState }] })
                  .then(() => setFlashOn(newState))
                  .catch(() => {})
              }}
              disabled={!flashAvail}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${flashOn ? 'bg-belt-yellow text-belt-dark' : 'bg-white/15 text-white'} ${!flashAvail ? 'opacity-0 pointer-events-none' : ''}`}>
              {flashOn ? <Zap size={20}/> : <ZapOff size={20}/>}
            </button>
            {/* Shutter */}
            <button onClick={handleCapture} disabled={!camReady}
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-transform active:scale-90 disabled:opacity-40"
              style={{ WebkitTapHighlightColor: 'transparent' }}>
              <div className="w-14 h-14 bg-belt-yellow rounded-full flex items-center justify-center shadow-lg">
                <Camera size={28} className="text-belt-dark"/>
              </div>
            </button>
            {/* Spacer for centering */}
            <div className={`w-12 h-12 ${!flashAvail ? 'opacity-0' : 'opacity-0'}`}/>
          </div>
        </div>
      </div>
    </div>
  )
}

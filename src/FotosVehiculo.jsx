import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, Camera, RotateCcw, CheckCircle, Download, X, Save, Upload, Image, Car, Bike } from 'lucide-react'

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
  { id: 'dni-f',        fullLabel: 'DNI Frente',                instruction: 'Frente del DNI del titular.',                      section: 'B', sectionLabel: 'Identificación y Datos', view: 'dni-frente' },
  { id: 'dni-d',        fullLabel: 'DNI Dorso',                 instruction: 'Dorso del DNI del titular.',                       section: 'B', sectionLabel: 'Identificación y Datos', view: 'dni-dorso' },
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
  { id: 'dni-f',        fullLabel: 'DNI Frente',                instruction: 'Frente del DNI del titular.',                      section: 'B', sectionLabel: 'Identificación y Datos', view: 'dni-frente' },
  { id: 'dni-d',        fullLabel: 'DNI Dorso',                 instruction: 'Dorso del DNI del titular.',                       section: 'B', sectionLabel: 'Identificación y Datos', view: 'dni-dorso' },
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
function applyWatermark(canvas, step) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  const now = new Date()

  // Top bar – step label only (date/time already in bottom bar)
  const topH = Math.max(52, Math.floor(H * 0.08))
  ctx.fillStyle = 'rgba(0,0,0,0.82)'
  ctx.fillRect(0, 0, W, topH)
  // Yellow accent
  ctx.fillStyle = '#c9e100'
  ctx.fillRect(0, 0, Math.max(4, Math.floor(W * 0.006)), topH)
  const px = Math.floor(W * 0.028)
  const line1Y = Math.floor(topH * 0.38)
  const line2Y = Math.floor(topH * 0.78)
  ctx.fillStyle = '#c9e100'
  ctx.font = `bold ${Math.floor(topH * 0.36)}px Arial`
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillText(step.fullLabel.toUpperCase(), px, line1Y)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `${Math.floor(topH * 0.24)}px Arial`
  ctx.fillText('INSPECCIÓN VEHICULAR · BELT SEGUROS', px, line2Y)

  // Bottom bar
  const botH = Math.max(52, Math.floor(H * 0.09))
  ctx.fillStyle = 'rgba(10,10,10,0.9)'
  ctx.fillRect(0, H - botH, W, botH)
  ctx.fillStyle = '#c9e100'
  ctx.fillRect(0, H - botH, Math.max(4, Math.floor(W * 0.007)), botH)

  // Lightning bolt
  const bx = Math.floor(W * 0.025)
  const by = H - botH + Math.floor(botH * 0.1)
  const bh = Math.floor(botH * 0.8)
  const bw = Math.floor(bh * 0.55)
  ctx.fillStyle = '#c9e100'
  ctx.beginPath()
  ctx.moveTo(bx + bw * 0.55, by)
  ctx.lineTo(bx,              by + bh * 0.48)
  ctx.lineTo(bx + bw * 0.38, by + bh * 0.48)
  ctx.lineTo(bx + bw * 0.12, by + bh)
  ctx.lineTo(bx + bw,        by + bh * 0.52)
  ctx.lineTo(bx + bw * 0.62, by + bh * 0.52)
  ctx.closePath()
  ctx.fill()

  const tx = bx + bw + Math.floor(W * 0.012)
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.floor(botH * 0.3)}px Arial`
  ctx.textAlign = 'left'
  ctx.fillText('BELT Seguros', tx, H - botH + botH * 0.38)
  ctx.fillStyle = '#9aa0a6'
  ctx.font = `${Math.floor(botH * 0.22)}px Arial`
  ctx.fillText('Productores de Seguros', tx, H - botH + botH * 0.7)

  ctx.fillStyle = '#c9e100'
  ctx.font = `bold ${Math.floor(botH * 0.26)}px Arial`
  ctx.textAlign = 'right'
  ctx.fillText('INSPECCIÓN VEHICULAR', W - Math.floor(W * 0.025), H - botH + botH * 0.37)
  ctx.fillStyle = '#9aa0a6'
  ctx.font = `${Math.floor(botH * 0.2)}px Arial`
  ctx.fillText(fmtShort(now), W - Math.floor(W * 0.025), H - botH + botH * 0.68)
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
  const [clock,     setClock]     = useState(new Date())

  // Form data
  const [dni,       setDni]       = useState('')
  const [patente,   setPatente]   = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState(null)
  const [uploadErr, setUploadErr] = useState(null)
  const [saved,     setSaved]     = useState(false)

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
        videoRef.current.onloadedmetadata = () => setCamReady(true)
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
        videoRef.current.onloadedmetadata = () => setCamReady(true)
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
    applyWatermark(canvas, currentStep)

    canvas.toBlob((blob) => {
      if (!blob) return
      const previewUrl = URL.createObjectURL(blob)
      setPhotos(prev => [...prev, { url: previewUrl, label: currentStep.fullLabel, blob }])
      setPreview(previewUrl)
      setPhase('preview')
    }, 'image/jpeg', 0.93)
  }, [camReady, stepIdx])

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
    if (!dni.trim() || !patente.trim()) return
    setUploading(true)
    setUploadErr(null)

    const formData = new FormData()
    formData.append('dni', dni.trim())
    formData.append('patente', patente.trim().toUpperCase())
    formData.append('tipo', vehicleType)
    photos.forEach(p => formData.append('fotos', p.blob, `foto.jpg`))

    try {
      const res = await fetch('/api/guardar-inspeccion', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error del servidor')
      setUploadMsg(data.carpeta)
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
      const filename = `BELT_${STEPS[i].id}_${dni.trim()}_${patente.trim()}.jpg`
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

  const goBack = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setVehicleType(null); setPhase('select'); setStepIdx(0);
    setPhotos([]); setPreview(null); setDni(''); setPatente('');
    setUploadMsg(null); setUploadErr(null); setSaved(false);
    setCamReady(false); setCamError(null);
  }

  // ── SELECT screen (Auto / Moto) ─────────────────────────────
  if (phase === 'select') return (
    <div className="min-h-screen bg-belt-dark flex flex-col safe-top safe-bottom">
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="mb-8 text-center">
          <div className="w-16 h-16 bg-belt-yellow/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Camera size={32} className="text-belt-yellow"/>
          </div>
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

        <button onClick={handleSaveToGallery}
          className="w-full flex items-center justify-center gap-2 bg-white/10 active:bg-white/20 text-white font-bold py-4 rounded-xl transition-all mb-3">
          <Image size={16}/> Guardar en mi fototeca
        </button>

        <button onClick={() => {
          setVehicleType(null); setPhase('select'); setStepIdx(0);
          setPhotos([]); setPreview(null); setDni(''); setPatente('');
          setUploadMsg(null); setUploadErr(null); setSaved(false);
        }} className="w-full btn-primary flex items-center justify-center gap-2 py-4 text-base">
          <CheckCircle size={16}/> Finalizar
        </button>
      </div>
    </div>
  )

  // ── FORM screen (DNI + Patente) ──────────────────────────────
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
            <label className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-1.5 block">DNI del cliente</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ej: 35123456"
              value={dni}
              onChange={e => setDni(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3.5 text-white text-lg font-bold placeholder-gray-500 focus:outline-none focus:border-belt-yellow focus:ring-1 focus:ring-belt-yellow transition-all"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-1.5 block">Patente del vehículo</label>
            <input
              type="text"
              placeholder="Ej: ABC123 o AB123CD"
              value={patente}
              onChange={e => setPatente(e.target.value.toUpperCase())}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3.5 text-white text-lg font-bold placeholder-gray-500 focus:outline-none focus:border-belt-yellow focus:ring-1 focus:ring-belt-yellow transition-all uppercase"
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
          disabled={!dni.trim() || !patente.trim() || uploading}
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
          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 mb-3">
            {STEPS.map((s, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
                i < stepIdx ? 'w-4 bg-belt-yellow' :
                i === stepIdx ? 'w-8 bg-belt-yellow' : 'w-2 bg-white/25'}`}/>
            ))}
          </div>

          <p className="text-white text-center font-bold text-sm mb-1">{step.fullLabel}</p>
          <p className="text-gray-400 text-center text-xs mb-4">{step.instruction}</p>

          {/* Shutter button */}
          <div className="flex items-center justify-center">
            <button onClick={handleCapture} disabled={!camReady}
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-transform active:scale-90 disabled:opacity-40"
              style={{ WebkitTapHighlightColor: 'transparent' }}>
              <div className="w-14 h-14 bg-belt-yellow rounded-full flex items-center justify-center shadow-lg">
                <Camera size={28} className="text-belt-dark"/>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

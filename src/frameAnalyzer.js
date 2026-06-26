/**
 * frameAnalyzer.js — Hybrid vehicle detection for inspection app
 * 
 * Layer 1: COCO-SSD → detects vehicle TYPE (car/truck/bus/motorcycle)
 * Layer 2: Custom analysis → validates viewing ANGLE (front vs lateral vs rear)
 * 
 * Both must pass for the silhouette to turn green.
 */

// ── COCO-SSD model (loaded once) ──────────────────────────────
let _model = null
let _modelLoading = false

async function getModel() {
  if (_model) return _model
  if (_modelLoading) return null
  if (!window.cocoSsd) return null
  _modelLoading = true
  try {
    _model = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' })
    console.log('🤖 COCO-SSD cargado')
  } catch (e) {
    console.error('Error cargando COCO-SSD:', e)
  }
  _modelLoading = false
  return _model
}

// Vehicle classes per step type
const AUTO_CLASSES = ['car', 'truck', 'bus']
const MOTO_CLASSES = ['motorcycle']

// ── Off-screen canvas for angle analysis ──────────────────────
let _canvas = null
let _ctx = null
const ANALYSIS_W = 160
const ANALYSIS_H = 120

function getCanvas() {
  if (!_canvas) {
    _canvas = document.createElement('canvas')
    _canvas.width = ANALYSIS_W
    _canvas.height = ANALYSIS_H
    _ctx = _canvas.getContext('2d', { willReadFrequently: true })
  }
  return { canvas: _canvas, ctx: _ctx }
}

/**
 * Compute edge magnitude at each pixel using Sobel-like gradient
 * Returns a Float32Array of edge strengths (0-255 range)
 */
function computeEdges(imageData) {
  const { width, height, data } = imageData
  const edges = new Float32Array(width * height)

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4
      // Convert to grayscale using luminance
      const gray = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114

      // Horizontal gradient (Sobel-like)
      const leftIdx = (y * width + (x - 1)) * 4
      const rightIdx = (y * width + (x + 1)) * 4
      const grayLeft = data[leftIdx] * 0.299 + data[leftIdx + 1] * 0.587 + data[leftIdx + 2] * 0.114
      const grayRight = data[rightIdx] * 0.299 + data[rightIdx + 1] * 0.587 + data[rightIdx + 2] * 0.114
      const gx = grayRight - grayLeft

      // Vertical gradient
      const topIdx = ((y - 1) * width + x) * 4
      const botIdx = ((y + 1) * width + x) * 4
      const grayTop = data[topIdx] * 0.299 + data[topIdx + 1] * 0.587 + data[topIdx + 2] * 0.114
      const grayBot = data[botIdx] * 0.299 + data[botIdx + 1] * 0.587 + data[botIdx + 2] * 0.114
      const gy = grayBot - grayTop

      edges[y * width + x] = Math.sqrt(gx * gx + gy * gy)
    }
  }
  return edges
}

/**
 * Analyze edge distribution in different zones of the frame
 * Returns zone scores (0-1) for center, top, bottom, left, right
 */
function analyzeZones(edges, width, height) {
  // Define zones as percentages of the frame
  const zones = {
    center: { x1: 0.2, y1: 0.15, x2: 0.8, y2: 0.75 },
    top:    { x1: 0.2, y1: 0.0,  x2: 0.8, y2: 0.15 },
    bottom: { x1: 0.2, y1: 0.75, x2: 0.8, y2: 1.0 },
    left:   { x1: 0.0, y1: 0.15, x2: 0.2, y2: 0.75 },
    right:  { x1: 0.8, y1: 0.15, x2: 1.0, y2: 0.75 },
  }

  const results = {}
  const edgeThreshold = 25 // minimum edge strength to count

  for (const [name, zone] of Object.entries(zones)) {
    const x1 = Math.floor(zone.x1 * width)
    const y1 = Math.floor(zone.y1 * height)
    const x2 = Math.floor(zone.x2 * width)
    const y2 = Math.floor(zone.y2 * height)

    let sum = 0
    let count = 0
    let strongEdges = 0

    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        const val = edges[y * width + x]
        sum += val
        count++
        if (val > edgeThreshold) strongEdges++
      }
    }

    results[name] = {
      avgEdge: count > 0 ? sum / count : 0,
      edgeDensity: count > 0 ? strongEdges / count : 0,
    }
  }

  return results
}

/**
 * Analyze horizontal vs vertical edge dominance in center zone
 * Useful for distinguishing front/rear (more vertical edges) from lateral (more horizontal)
 */
function analyzeEdgeOrientation(imageData) {
  const { width, height, data } = imageData
  let horizontalSum = 0
  let verticalSum = 0
  let count = 0

  // Only analyze center 60% of the frame
  const x1 = Math.floor(width * 0.2)
  const x2 = Math.floor(width * 0.8)
  const y1 = Math.floor(height * 0.15)
  const y2 = Math.floor(height * 0.75)

  for (let y = y1 + 1; y < y2 - 1; y++) {
    for (let x = x1 + 1; x < x2 - 1; x++) {
      const idx = (y * width + x) * 4
      const gray = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114

      // Horizontal gradient → detects vertical edges (pillars, door edges)
      const leftIdx = (y * width + (x - 1)) * 4
      const rightIdx = (y * width + (x + 1)) * 4
      const gx = Math.abs(
        (data[rightIdx] * 0.299 + data[rightIdx + 1] * 0.587 + data[rightIdx + 2] * 0.114) -
        (data[leftIdx] * 0.299 + data[leftIdx + 1] * 0.587 + data[leftIdx + 2] * 0.114)
      )

      // Vertical gradient → detects horizontal edges (roof line, wheel arches)
      const topIdx = ((y - 1) * width + x) * 4
      const botIdx = ((y + 1) * width + x) * 4
      const gy = Math.abs(
        (data[botIdx] * 0.299 + data[botIdx + 1] * 0.587 + data[botIdx + 2] * 0.114) -
        (data[topIdx] * 0.299 + data[topIdx + 1] * 0.587 + data[topIdx + 2] * 0.114)
      )

      horizontalSum += gy // horizontal edges
      verticalSum += gx   // vertical edges
      count++
    }
  }

  const total = horizontalSum + verticalSum
  return {
    horizontalRatio: total > 0 ? horizontalSum / total : 0.5,
    verticalRatio: total > 0 ? verticalSum / total : 0.5,
  }
}

/**
 * Check overall sharpness of the center area
 * Returns a score 0-1 (higher = sharper)
 */
function checkSharpness(edges, width, height) {
  const x1 = Math.floor(width * 0.2)
  const x2 = Math.floor(width * 0.8)
  const y1 = Math.floor(height * 0.15)
  const y2 = Math.floor(height * 0.75)

  let sum = 0
  let count = 0

  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      sum += edges[y * width + x]
      count++
    }
  }

  const avg = count > 0 ? sum / count : 0
  // Normalize: ~15+ average edge = sharp enough
  return Math.min(avg / 15, 1)
}

/**
 * Check color variance in center — a uniform background has low variance,
 * an object (car) has higher variance
 */
function checkColorVariance(imageData) {
  const { width, height, data } = imageData
  const x1 = Math.floor(width * 0.15)
  const x2 = Math.floor(width * 0.85)
  const y1 = Math.floor(height * 0.1)
  const y2 = Math.floor(height * 0.8)

  let sumR = 0, sumG = 0, sumB = 0
  let count = 0

  for (let y = y1; y < y2; y += 2) {  // Skip every other pixel for speed
    for (let x = x1; x < x2; x += 2) {
      const idx = (y * width + x) * 4
      sumR += data[idx]
      sumG += data[idx + 1]
      sumB += data[idx + 2]
      count++
    }
  }

  const avgR = sumR / count, avgG = sumG / count, avgB = sumB / count
  let variance = 0

  for (let y = y1; y < y2; y += 2) {
    for (let x = x1; x < x2; x += 2) {
      const idx = (y * width + x) * 4
      const dr = data[idx] - avgR
      const dg = data[idx + 1] - avgG
      const db = data[idx + 2] - avgB
      variance += dr * dr + dg * dg + db * db
    }
  }

  variance /= count
  // Normalize: variance > 2000 means good color diversity (object present)
  return Math.min(variance / 3000, 1)
}

/**
 * Main analysis function — called on each video frame (async)
 * 
 * Layer 1: COCO-SSD detects vehicle type + bounding box
 * Layer 2: Bbox aspect ratio validates viewing angle
 * 
 * @param {HTMLVideoElement} video
 * @param {string} stepId
 * @returns {Promise<{ match: boolean, confidence: number, reason: string }>}
 */
export async function analyzeFrame(video, stepId) {
  if (!video || !video.videoWidth) return { match: false, confidence: 0, reason: 'no-video' }

  // ── Layer 1: COCO-SSD object detection ────────────────────
  const model = await getModel()
  if (!model) return { match: false, confidence: 0, reason: 'cargando-modelo' }

  const predictions = await model.detect(video)

  // Which vehicle types are we looking for?
  const isMoto = stepId === 'perfil-der' || stepId === 'perfil-izq'
  const targetClasses = isMoto ? MOTO_CLASSES : AUTO_CLASSES

  // Find the best matching vehicle prediction
  const vehicles = predictions
    .filter(p => targetClasses.includes(p.class) && p.score > 0.3)
    .sort((a, b) => b.score - a.score)

  if (vehicles.length === 0) {
    const wrongType = predictions.find(p =>
      [...AUTO_CLASSES, ...MOTO_CLASSES].includes(p.class) && p.score > 0.3
    )
    if (wrongType) {
      return { match: false, confidence: wrongType.score, reason: isMoto ? 'no-es-moto' : 'no-es-auto' }
    }
    return { match: false, confidence: 0, reason: 'sin-vehiculo' }
  }

  const best = vehicles[0]
  const [bx, by, bw, bh] = best.bbox
  const vw = video.videoWidth
  const vh = video.videoHeight

  // Check vehicle is large enough in frame (at least 30% of frame width)
  const sizeRatio = bw / vw
  if (sizeRatio < 0.30) {
    return { match: false, confidence: sizeRatio, reason: 'muy-lejos' }
  }

  // Check vehicle is roughly centered
  const cx = bx + bw / 2
  const cy = by + bh / 2
  const offX = Math.abs(cx - vw / 2) / vw
  const offY = Math.abs(cy - vh / 2) / vh
  if (offX > 0.25 || offY > 0.25) {
    return { match: false, confidence: 1 - Math.max(offX, offY), reason: 'no-centrado' }
  }

  // ── Layer 2: Angle validation via bbox aspect ratio ───────
  const aspectRatio = bw / bh  // wide = lateral, square/tall = front/rear

  const isLateral = stepId === 'lateral-der' || stepId === 'lateral-izq' ||
                    stepId === 'perfil-der' || stepId === 'perfil-izq'
  const isFrontRear = stepId === 'frente' || stepId === 'trasera'

  if (isLateral && aspectRatio < 1.3) {
    // Lateral view should produce a wide bbox
    return { match: false, confidence: aspectRatio / 1.3, reason: `no-es-lateral(${aspectRatio.toFixed(1)})` }
  }

  if (isFrontRear && aspectRatio > 1.6) {
    // Front/rear view should produce a squarish bbox
    return { match: false, confidence: 1.6 / aspectRatio, reason: `no-es-frente(${aspectRatio.toFixed(1)})` }
  }

  // ── COCO-SSD passed → return preliminary match ─────────────
  const confidence = best.score * Math.min(sizeRatio * 2, 1)
  return {
    match: true,
    confidence,
    reason: `detectado(${best.class} ${(best.score*100).toFixed(0)}% ar:${aspectRatio.toFixed(1)})`,
    cocoOk: true,
    bbox: best.bbox
  }
}

// ── Gemini frame validation (Layer 2) ───────────────────────
let _geminiCanvas = null
let _geminiCtx = null
let _lastGeminiCall = 0
let _lastGeminiResult = null
let _geminiPending = false
const GEMINI_INTERVAL = 3000  // Call Gemini at most every 3 seconds

/**
 * Sends a low-res frame to Gemini for angle/side validation.
 * Returns cached result if called too frequently.
 */
async function validateWithGemini(video, stepId) {
  const now = Date.now()

  // Return cached result if too soon
  if (now - _lastGeminiCall < GEMINI_INTERVAL) return _lastGeminiResult
  if (_geminiPending) return _lastGeminiResult

  _geminiPending = true
  _lastGeminiCall = now

  try {
    // Capture low-res frame as JPEG blob
    if (!_geminiCanvas) {
      _geminiCanvas = document.createElement('canvas')
      _geminiCanvas.width = 320
      _geminiCanvas.height = 240
      _geminiCtx = _geminiCanvas.getContext('2d')
    }
    _geminiCtx.drawImage(video, 0, 0, 320, 240)

    const blob = await new Promise(resolve =>
      _geminiCanvas.toBlob(resolve, 'image/jpeg', 0.6)
    )

    const fd = new FormData()
    fd.append('frame', blob, 'frame.jpg')
    fd.append('stepId', stepId)

    const resp = await fetch('/api/validar-frame', { method: 'POST', body: fd })
    const data = await resp.json()

    _lastGeminiResult = data.skip ? null : data.ok
    return _lastGeminiResult
  } catch (e) {
    _lastGeminiResult = null  // null = skip/unknown
    return null
  } finally {
    _geminiPending = false
  }
}

/**
 * Full analysis: COCO-SSD + Gemini combined
 */
export async function analyzeFrameFull(video, stepId) {
  // Layer 1: COCO-SSD
  const cocoResult = await analyzeFrame(video, stepId)

  // If COCO-SSD didn't detect a vehicle, no need to call Gemini
  if (!cocoResult.cocoOk) {
    resetGeminiCache()
    return cocoResult
  }

  // Layer 2: Gemini angle validation (only for steps that need it)
  const needsGemini = ['frente', 'lateral-der', 'lateral-izq', 'trasera',
                       'perfil-der', 'perfil-izq'].includes(stepId)

  if (!needsGemini) return cocoResult

  const geminiOk = await validateWithGemini(video, stepId)

  // geminiOk = null → skip (API error, still loading)
  // geminiOk = true → confirmed correct angle
  // geminiOk = false → wrong angle
  if (geminiOk === null) {
    // Gemini hasn't responded yet, show COCO result but as "checking"
    return { ...cocoResult, reason: `verificando...` }
  }

  if (geminiOk === false) {
    return { match: false, confidence: cocoResult.confidence, reason: 'angulo-incorrecto' }
  }

  return { ...cocoResult, reason: `ok(${cocoResult.reason.replace('detectado', '✓')})` }
}

export function resetGeminiCache() {
  _lastGeminiResult = null
  _lastGeminiCall = 0
}

// Steps that support real-time detection
export const DETECTABLE_STEPS = [
  'frente', 'lateral-der', 'lateral-izq', 'trasera',
  'perfil-der', 'perfil-izq'
]

import express from 'express'
import cors from 'cors'
import { z } from 'zod'

const app = express()
app.use(cors())
app.use(express.json({ limit: '256kb' }))

const PORT = Number(process.env.PORT || 3000)

// Kora RPC (private) base URL, e.g. http://kora-rpc:8080
const KORA_RPC_URL = (process.env.KORA_RPC_URL || '').trim()

// API key if your Kora RPC is protected
const KORA_API_KEY = (process.env.KORA_API_KEY || '').trim()

// x402 metadata (advertised)
const X402_NETWORK = (process.env.X402_NETWORK || 'solana-devnet').trim() // v1 name (matches Solana guide)
const X402_SCHEME = (process.env.X402_SCHEME || 'exact').trim()
const FACILITATOR_VERSION = (process.env.FACILITATOR_VERSION || '0.1.0').trim()

function mustEnv(name, value) {
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

async function koraRpc(method, params = {}) {
  const url = mustEnv('KORA_RPC_URL', KORA_RPC_URL).replace(/\/$/, '')
  const headers = { 'content-type': 'application/json' }
  if (KORA_API_KEY) headers['authorization'] = `Bearer ${KORA_API_KEY}`

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  })

  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  if (!res.ok) {
    const msg = json?.error?.message || json?.message || text || `${res.status}`
    const err = new Error(`Kora RPC ${method} failed: ${res.status} ${msg}`)
    err.status = res.status
    err.body = json || text
    throw err
  }

  if (!json || json.jsonrpc != '2.0') {
    throw new Error(`Kora RPC ${method} returned non-JSON-RPC response: ${text}`)
  }
  if (json.error) {
    throw new Error(`Kora RPC ${method} error: ${json.error.message || JSON.stringify(json.error)}`)
  }
  return json.result
}

// --- auth (optional) ---
// If FACILITATOR_TOKEN is set, callers must send header: x-facilitator-token: <token>
const FACILITATOR_TOKEN = (process.env.FACILITATOR_TOKEN || '').trim()
function requireToken(req, res, next) {
  if (!FACILITATOR_TOKEN) return next()
  const got = String(req.headers['x-facilitator-token'] || '')
  if (got && got === FACILITATOR_TOKEN) return next()
  return res.status(403).json({ ok: false, error: 'forbidden' })
}

// --- x402 facilitator endpoints ---

app.get('/health', (_req, res) => res.json({ ok: true }))

// x402 core calls GET /supported on startup to learn what the facilitator can do.
app.get('/supported', requireToken, async (_req, res) => {
  // We don’t strictly need Kora for this response, but we optionally include a fee payer address if Kora exposes it.
  let feePayer = null
  try {
    // Kora guide mentions a "getPayerSigner" method. Implemented by some deployments.
    const out = await koraRpc('getPayerSigner', {})
    feePayer = out?.address || out?.payer || null
  } catch {
    // ignore
  }

  res.json({
    ok: true,
    version: FACILITATOR_VERSION,
    supported: [
      {
        scheme: X402_SCHEME,
        network: X402_NETWORK,
        feePayer,
      },
    ],
  })
})

// Verify: check that the payment payload is valid without broadcasting
const VerifySchema = z.object({
  x402Version: z.string().optional(),
  paymentPayload: z.any(),
  paymentRequirements: z.any().optional(),
})

app.post('/verify', requireToken, async (req, res) => {
  const parsed = VerifySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'invalid body' })

  try {
    // Kora expects { transaction } (typically base64) via JSON-RPC.
    const tx = parsed.data.paymentPayload?.transaction || parsed.data.paymentPayload
    const out = await koraRpc('signTransaction', { transaction: tx })
    return res.json({ isValid: true, result: out })
  } catch (e) {
    return res.status(400).json({ isValid: false, error: e?.message || 'verify failed' })
  }
})

// Settle: broadcast the transaction (Kora signs as fee payer and sends)
const SettleSchema = z.object({
  x402Version: z.string().optional(),
  paymentPayload: z.any(),
  paymentRequirements: z.any().optional(),
})

app.post('/settle', requireToken, async (req, res) => {
  const parsed = SettleSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'invalid body' })

  try {
    const tx = parsed.data.paymentPayload?.transaction || parsed.data.paymentPayload
    const out = await koraRpc('signAndSendTransaction', { transaction: tx })
    return res.json({ success: true, result: out })
  } catch (e) {
    return res.status(400).json({ success: false, error: e?.message || 'settle failed' })
  }
})

// Optional helper: some clients might call /requirements (faremeter-style). We return 405 to be explicit.
app.all('/requirements', (_req, res) => res.status(405).json({ ok: false, error: 'not supported' }))

app.listen(PORT, '0.0.0.0', () => {
  console.log(`x402-kora-facilitator listening on :${PORT}`)
})

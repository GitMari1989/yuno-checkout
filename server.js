const express = require('express')
const path = require('path')
const fetch = require('node-fetch')
const v4 = require('uuid').v4
const { getCountryData } = require('./utils')

require('dotenv').config()

// Ask for these keys to sales department
const ACCOUNT_CODE = process.env.ACCOUNT_CODE
const PUBLIC_API_KEY = process.env.PUBLIC_API_KEY
const PRIVATE_SECRET_KEY = process.env.PRIVATE_SECRET_KEY

const SERVER_PORT = process.env.PORT || 8080

let API_URL = null
let CUSTOMER_ID = null
let INIT_PROMISE = null

const staticDirectory = path.join(__dirname, 'vanilla/static')

const indexPage = path.join(__dirname, 'vanilla/pages/index.html')
const checkoutPage = path.join(__dirname, 'vanilla/pages/checkout.html')
const checkoutLitePage = path.join(__dirname, 'vanilla/pages/checkout-lite.html')
const seamlessCheckoutPage = path.join(__dirname, 'vanilla/pages/checkout-seamless.html')
const seamlessCheckoutLitePage = path.join(__dirname, 'vanilla/pages/checkout-seamless-lite.html')
const seamlessExternalButtonsPage = path.join(__dirname, 'vanilla/pages/checkout-seamless-external-buttons.html')
const statusPage = path.join(__dirname, 'vanilla/pages/status.html')
const statusLitePage = path.join(__dirname, 'vanilla/pages/status-lite.html')
const enrollmentLitePage = path.join(__dirname, 'vanilla/pages/enrollment-lite.html')
const checkoutSecureFieldsPage = path.join(__dirname, 'vanilla/pages/checkout-secure-fields.html')
const fullFeatures = path.join(__dirname, 'vanilla/pages/full-features.html')
const paymentMethodsUnfolded = path.join(__dirname, 'vanilla/pages/payment-methods-unfolded.html')

const app = express()

app.use(express.json())

// Log simples para você ver no Render
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`)
  next()
})

app.use('/static', express.static(staticDirectory))

/**
 * Fetch helper: retorna status + json e loga erros
 */
async function fetchJson(url, options) {
  const resp = await fetch(url, options)
  const text = await resp.text()

  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch (_) {
    json = { raw: text }
  }

  if (!resp.ok) {
    const err = new Error(`HTTP ${resp.status} ${resp.statusText} -> ${url}`)
    err.status = resp.status
    err.data = json
    throw err
  }

  return json
}

/**
 * Garante init (API_URL e CUSTOMER_ID) — importante para cold start do Render
 */
async function ensureInit() {
  if (!INIT_PROMISE) {
    INIT_PROMISE = (async () => {
      if (!PUBLIC_API_KEY) throw new Error('Missing PUBLIC_API_KEY env var')
      if (!PRIVATE_SECRET_KEY) throw new Error('Missing PRIVATE_SECRET_KEY env var')
      if (!ACCOUNT_CODE) throw new Error('Missing ACCOUNT_CODE env var')

      API_URL = generateBaseUrlApi()
      console.log('[INIT] API_URL:', API_URL)

      const created = await createCustomer()
      CUSTOMER_ID = created?.id || null
      console.log('[INIT] CUSTOMER_ID:', CUSTOMER_ID)

      return true
    })().catch((err) => {
      INIT_PROMISE = null
      throw err
    })
  }

  return INIT_PROMISE
}

/**
 * Debug endpoints (pra garantir que o Render está rodando esse arquivo)
 */
app.get('/__whoami', (req, res) => {
  res.json({
    file: 'server.js',
    hasPaymentMethodsRoute: true,
    hasRoutesEndpoint: true,
  })
})

app.get('/routes', (req, res) => {
  const routes = []
  app._router.stack.forEach((m) => {
    if (m.route && m.route.path) {
      const methods = Object.keys(m.route.methods || {}).join(',').toUpperCase()
      routes.push({ methods, path: m.route.path })
    }
  })
  res.json({ routes })
})

app.get('/sdk-web/healthy', (req, res) => {
  res.sendStatus(200)
})

app.get('/', (req, res) => {
  res.sendFile(indexPage)
})

app.get('/checkout', (req, res) => {
  res.sendFile(checkoutPage)
})

app.get('/checkout/lite', (req, res) => {
  res.sendFile(checkoutLitePage)
})

app.get('/checkout/seamless', (req, res) => {
  res.sendFile(seamlessCheckoutPage)
})

app.get('/checkout/seamless/lite', (req, res) => {
  res.sendFile(seamlessCheckoutLitePage)
})

app.get('/checkout/seamless/external-buttons', (req, res) => {
  res.sendFile(seamlessExternalButtonsPage)
})

app.get('/checkout/secure-fields', (req, res) => {
  res.sendFile(checkoutSecureFieldsPage)
})

app.get('/status', (req, res) => {
  res.sendFile(statusPage)
})

app.get('/status-lite', (req, res) => {
  res.sendFile(statusLitePage)
})

app.get('/enrollment-lite', (req, res) => {
  res.sendFile(enrollmentLitePage)
})

app.get('/full-features', (req, res) => {
  res.sendFile(fullFeatures)
})

app.get('/checkout/payment-methods-unfolded', async (req, res) => {
  res.sendFile(paymentMethodsUnfolded)
})

app.get('/public-api-key', (req, res) => {
  res.json({ publicApiKey: PUBLIC_API_KEY })
})

/**
 * ✅ CRÍTICO: rota que estava faltando
 * O Full Checkout precisa conseguir buscar os métodos da session
 */
app.get('/payment-methods/:checkoutSession', async (req, res) => {
  try {
    await ensureInit()

    const checkoutSession = req.params.checkoutSession
    const url = `${API_URL}/v1/checkout/sessions/${checkoutSession}/payment-methods`

    const data = await fetchJson(url, {
      method: 'GET',
      headers: {
        'public-api-key': PUBLIC_API_KEY,
        'private-secret-key': PRIVATE_SECRET_KEY,
        'Content-Type': 'application/json',
      },
    })

    return res.json(data)
  } catch (err) {
    console.log('[ERR] /payment-methods:', err?.message, err?.data || '')
    return res.status(err?.status || 500).json({
      error: String(err?.message || err),
      data: err?.data || null,
    })
  }
})

app.post('/checkout/sessions', async (req, res) => {
  try {
    await ensureInit()

    const country = req.query.country || 'CO'
    const { currency } = getCountryData(country)

    const payload = {
      account_id: ACCOUNT_CODE,
      merchant_order_id: '1655401222',
      payment_description: 'Test MP 1654536326',
      country,
      ...(CUSTOMER_ID ? { customer_id: CUSTOMER_ID } : {}),
      amount: { currency, value: 2000 },
    }

    const response = await fetchJson(`${API_URL}/v1/checkout/sessions`, {
      method: 'POST',
      headers: {
        'public-api-key': PUBLIC_API_KEY,
        'private-secret-key': PRIVATE_SECRET_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    return res.json(response)
  } catch (err) {
    console.log('[ERR] /checkout/sessions:', err?.message, err?.data || '')
    return res.status(err?.status || 500).json({
      error: String(err?.message || err),
      data: err?.data || null,
    })
  }
})

app.post('/payments', async (req, res) => {
  try {
    await ensureInit()

    const checkoutSession = req.body.checkoutSession
    const oneTimeToken = req.body.oneTimeToken
    const country = req.query.country || 'CO'
    const { currency, documentNumber, documentType, amount } = getCountryData(country)

    const response = await fetchJson(`${API_URL}/v1/payments`, {
      method: 'POST',
      headers: {
        'public-api-key': PUBLIC_API_KEY,
        'private-secret-key': PRIVATE_SECRET_KEY,
        'X-idempotency-key': v4(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: 'Test Addi',
        account_id: ACCOUNT_CODE,
        merchant_order_id: '0000022',
        country,
        amount: { currency, value: amount },
        checkout: { session: checkoutSession },
        customer_payer: {
          billing_address: {
            address_line_1: 'Calle 34 # 56 - 78',
            address_line_2: 'Apartamento 502, Torre I',
            city: 'Bogota',
            country,
            state: 'Cundinamarca',
            zip_code: '111111',
          },
          date_of_birth: '1990-02-28',
          device_fingerprint: 'hi88287gbd8d7d782ge....',
          document: { document_type: documentType, document_number: documentNumber },
          email: 'pepitoperez@y.uno',
          first_name: 'Pepito',
          gender: 'MALE',
          id: CUSTOMER_ID,
          ip_address: '192.168.123.167',
          last_name: 'Perez',
          merchant_customer_id: 'example00234',
          nationality: country,
          phone: { country_code: '57', number: '3132450765' },
          shipping_address: {
            address_line_1: 'Calle 34 # 56 - 78',
            address_line_2: 'Apartamento 502, Torre I',
            city: 'Bogota',
            country,
            state: 'Cundinamarca',
            zip_code: '111111',
          },
        },
        payment_method: { token: oneTimeToken, vaulted_token: null },
      }),
    })

    return res.json(response)
  } catch (err) {
    console.log('[ERR] /payments:', err?.message, err?.data || '')
    return res.status(err?.status || 500).json({
      error: String(err?.message || err),
      data: err?.data || null,
    })
  }
})

app.listen(SERVER_PORT, () => {
  console.log(`server started at port: ${SERVER_PORT}`)
})

const ApiKeyPrefixToEnvironmentSuffix = {
  dev: '-dev',
  staging: '-staging',
  sandbox: '-sandbox',
  prod: '',
}

const baseAPIurl = 'https://api_ENVIRONMENT_.y.uno'

function generateBaseUrlApi() {
  const [apiKeyPrefix] = PUBLIC_API_KEY.split('_')
  const environmentSuffix = ApiKeyPrefixToEnvironmentSuffix[apiKeyPrefix]
  return baseAPIurl.replace('_ENVIRONMENT_', environmentSuffix)
}

function createCustomer() {
  return fetchJson(`${API_URL}/v1/customers`, {
    method: 'POST',
    headers: {
      'public-api-key': PUBLIC_API_KEY,
      'private-secret-key': PRIVATE_SECRET_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      country: 'CO',
      merchant_customer_id: Math.floor(Math.random() * 1000000).toString(),
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@y.uno',
    }),
  })
}

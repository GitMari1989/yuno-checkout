// vanilla/static/api.js

function withCountryParam(path) {
  // Always ensure we send country=CO if user didn't provide any querystring
  const qs = new URLSearchParams(window.location.search || "")
  if (!qs.has("country")) qs.set("country", "CO")

  const query = qs.toString()
  return query ? `${path}?${query}` : path
}

async function fetchJson(url, options) {
  const resp = await fetch(url, options)

  // Read text first so we can debug non-JSON errors too
  const text = await resp.text()
  let data = null

  try {
    data = text ? JSON.parse(text) : null
  } catch (_) {
    data = { raw: text }
  }

  if (!resp.ok) {
    const err = new Error(`HTTP ${resp.status} ${resp.statusText} -> ${url}`)
    err.status = resp.status
    err.data = data
    throw err
  }

  return data
}

// Ask for this key to sales department: PUBLIC_API_KEY
export async function getPublicApiKey() {
  const url = withCountryParam("/public-api-key")
  const resp = await fetchJson(url, { method: "GET" })
  return resp.publicApiKey
}

export async function getCheckoutSession() {
  const url = withCountryParam("/checkout/sessions")
  return fetchJson(url, { method: "POST" })
}

export async function getSeamlessCheckoutSession() {
  const url = withCountryParam("/checkout/seamless/sessions")
  return fetchJson(url, { method: "POST" })
}

export async function createPayment(data) {
  const url = withCountryParam("/payments")
  return fetchJson(url, {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  })
}

export async function getCustomerSession() {
  const url = withCountryParam("/customers/sessions")
  return fetchJson(url, { method: "POST" })
}

export async function createEnrollment(customerSession) {
  const url = withCountryParam(`/customers/sessions/${customerSession}/payment-methods`)
  return fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
}

export async function getPaymentMethods(checkoutSession) {
  const url = withCountryParam(`/payment-methods/${checkoutSession}`)
  return fetchJson(url, { method: "GET" })
}

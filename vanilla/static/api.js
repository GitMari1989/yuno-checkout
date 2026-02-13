// vanilla/static/api.js

export async function getPublicApiKey() {
  return fetch(`/public-api-key${window.location.search}`, { method: "GET" })
    .then((resp) => resp.json())
    .then((resp) => resp.publicApiKey)
}

export async function getCheckoutSession() {
  return fetch(`/checkout/sessions${window.location.search}`, { method: "POST" }).then((resp) =>
    resp.json()
  )
}

export async function createPayment(data) {
  return fetch(`/payments${window.location.search}`, {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  }).then((resp) => resp.json())
}

/**
 * ✅ NEW: fetch payment status from our backend (proxy to Yuno)
 */
export async function getPaymentById(paymentId) {
  return fetch(`/payments/${paymentId}${window.location.search}`, {
    method: "GET",
  }).then((resp) => resp.json())
}

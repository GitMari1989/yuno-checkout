import { getCheckoutSession, createPayment, getPublicApiKey } from "./api.js"

let started = false

async function initCheckout() {

  if (started) return
  started = true

  const debug = document.getElementById("debug")
  const payButton = document.getElementById("button-pay")

  const log = (msg) => {
    const text = typeof msg === "string" ? msg : JSON.stringify(msg, null, 2)
    console.log(text)
    if (debug) debug.textContent += "\n" + text
  }

  try {

    log("INIT")

    // session
    const session = await getCheckoutSession()
    const checkoutSession = session.checkout_session
    const countryCode = session.country

    log(session)

    // public key
    const publicKey = await getPublicApiKey()

    const yuno = await window.Yuno.initialize(publicKey)

    log("SDK READY")

    // ⭐ FULL CHECKOUT PURO
    await yuno.startCheckout({
      checkoutSession,
      countryCode,
      language: "es",

      // ❗ REMOVA renderMode
      // ❗ REMOVA elementSelector
      // ❗ REMOVA containers

      async yunoCreatePayment(oneTimeToken) {

        log("TOKEN CREATED")

        const resp = await createPayment({
          oneTimeToken,
          checkoutSession,
        })

        log(resp)

        if (resp?.sdk_action_required) {
          yuno.continuePayment()
        }
      },

      yunoError: (err) => {
        log({ yunoError: err })
      },

      yunoPaymentResult: (res) => {
        log({ result: res })
      }
    })

    log("CHECKOUT READY")

    payButton.disabled = false

    payButton.onclick = () => {
      log("START PAYMENT")
      yuno.startPayment()
    }

  } catch (err) {

    log({ fatal: err.message })
    started = false
  }
}

window.addEventListener("yuno-sdk-ready", initCheckout)

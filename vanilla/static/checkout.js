// vanilla/static/checkout.js
import { getCheckoutSession, createPayment, getPublicApiKey } from "./api.js"

let __started = false

async function initCheckout() {
  if (__started) return
  __started = true

  const debugEl = document.getElementById("debug")
  const log = (x) => {
    const msg = typeof x === "string" ? x : JSON.stringify(x, null, 2)
    console.log(msg)
    if (debugEl) debugEl.textContent += "\n" + msg
    window.__last_debug = msg
  }

  // ✅ GATE: só permite pagar depois do clique
  let allowPayment = false
  let isPaying = false

  try {
    log("INIT CHECKOUT START")

    // 1) Create checkout session (backend)
    const { checkout_session: checkoutSession, country: countryCode } =
      await getCheckoutSession()
    log({ checkoutSession, countryCode })

    // 2) Get public key (backend)
    const publicApiKey = await getPublicApiKey()
    log("PUBLIC KEY OK")

    // 3) Init SDK
    const yuno = await window.Yuno.initialize(publicApiKey)
    log("YUNO INITIALIZED")

    // 4) Start checkout (keep default render behavior)
    await yuno.startCheckout({
      checkoutSession,
      elementSelector: "#root",
      countryCode,
      language: "es",

      showLoading: true,
      keepLoader: false,

      async yunoCreatePayment(oneTimeToken) {
        try {
          // ✅ CRÍTICO: se o usuário não clicou, NÃO cria pagamento
          if (!allowPayment) {
            log("yunoCreatePayment called BEFORE click -> ignoring token")
            return
          }

          if (isPaying) return
          isPaying = true

          log("TOKEN RECEIVED (after click)")

          const paymentResp = await createPayment({
            oneTimeToken,
            checkoutSession,
          })

          log({ createPaymentResponse: paymentResp })

          // Only continue if backend says so
          if (paymentResp?.sdk_action_required === true) {
            log("SDK action required -> continuePayment()")
            yuno.continuePayment()
          } else {
            log("No SDK action required (skip continuePayment)")
          }
        } catch (err) {
          isPaying = false
          log({ createPaymentError: String(err), stack: err?.stack })
          try { yuno.hideLoader() } catch (_) {}
        }
      },

      yunoPaymentMethodSelected(data) {
        log({ yunoPaymentMethodSelected: data })
      },

      yunoPaymentResult(data) {
        log({ yunoPaymentResult: data })
        isPaying = false
        allowPayment = false
        try { yuno.hideLoader() } catch (_) {}
      },

      yunoError(error) {
        log({ yunoError: error })
        isPaying = false
        allowPayment = false
        try { yuno.hideLoader() } catch (_) {}
      },
    })

    // Mount checkout list
    if (typeof yuno.mountCheckout === "function") {
      yuno.mountCheckout()
      log("CHECKOUT READY (mounted)")
    } else {
      log("WARNING: yuno.mountCheckout() not available")
    }

    // ✅ Only start payment on click
    const payButton = document.querySelector("#button-pay")
    if (payButton) {
      payButton.addEventListener("click", () => {
        if (isPaying) return
        allowPayment = true
        log("PAY BUTTON CLICK -> startPayment()")
        yuno.startPayment()
      })
    } else {
      log("WARNING: #button-pay not found")
    }
  } catch (err) {
    __started = false
    const msg = { initError: String(err), stack: err?.stack }
    console.log(msg)
    if (debugEl) debugEl.textContent += "\n" + JSON.stringify(msg, null, 2)
  }
}

function boot() {
  const start = () => initCheckout()

  if (window.Yuno?.initialize) {
    start()
    return
  }

  window.addEventListener("yuno-sdk-ready", start, { once: true })

  // fallback
  setTimeout(() => {
    if (window.Yuno?.initialize) start()
  }, 1500)
}

boot()

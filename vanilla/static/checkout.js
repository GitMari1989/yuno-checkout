// vanilla/static/checkout.js
import { getCheckoutSession, createPayment, getPublicApiKey } from "./api.js"

let __started = false

async function initCheckout() {
  // ✅ evita inicializar duas vezes (muito comum no Render + reload)
  if (__started) return
  __started = true

  const debugEl = document.getElementById("debug")

  const log = (x) => {
    const msg = typeof x === "string" ? x : JSON.stringify(x, null, 2)
    console.log(msg)
    if (debugEl) debugEl.textContent += "\n" + msg
    window.__last_debug = msg
  }

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

    let isPaying = false

    // 4) Start checkout (SEM renderMode element, porque seu HTML não tem #form-element / #action-form-element)
    await yuno.startCheckout({
      checkoutSession,
      elementSelector: "#root",
      countryCode,
      language: "es",

      // estável para demo
      showLoading: true,
      keepLoader: false,

      async yunoCreatePayment(oneTimeToken) {
        try {
          if (isPaying) return
          isPaying = true

          log("TOKEN RECEIVED")

          const paymentResp = await createPayment({
            oneTimeToken,
            checkoutSession,
          })

          log({ createPaymentResponse: paymentResp })

          // ✅ só chama continuePayment se o backend disser explicitamente
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
        try { yuno.hideLoader() } catch (_) {}
      },

      yunoError(error) {
        log({ yunoError: error })
        isPaying = false
        try { yuno.hideLoader() } catch (_) {}
      },
    })

    // ✅ para Full Checkout, normalmente precisa do mountCheckout
    if (typeof yuno.mountCheckout === "function") {
      yuno.mountCheckout()
      log("CHECKOUT READY (mounted)")
    } else {
      log("WARNING: yuno.mountCheckout() not available in this SDK version")
    }

    // Start payment only when user clicks
    const payButton = document.querySelector("#button-pay")
    if (payButton) {
      payButton.addEventListener("click", () => {
        if (isPaying) return
        log("PAY BUTTON CLICK -> startPayment()")
        yuno.startPayment()
      })
    } else {
      log("WARNING: #button-pay not found")
    }
  } catch (err) {
    __started = false // permite tentar de novo se falhar
    const msg = { initError: String(err), stack: err?.stack }
    console.log(msg)
    if (debugEl) debugEl.textContent += "\n" + JSON.stringify(msg, null, 2)
  }
}

// Boot seguro: chama uma vez só, quando o SDK estiver disponível
function boot() {
  const startOnce = () => initCheckout()

  if (window.Yuno?.initialize) {
    startOnce()
    return
  }

  window.addEventListener("yuno-sdk-ready", startOnce, { once: true })

  // fallback: aguarda o SDK aparecer, sem duplicar init (por causa do __started)
  const t0 = Date.now()
  const timer = setInterval(() => {
    if (window.Yuno?.initialize) {
      clearInterval(timer)
      startOnce()
      return
    }
    if (Date.now() - t0 > 8000) {
      clearInterval(timer)
      __started = false
      console.log("SDK not available after 8s")
    }
  }, 250)
}

boot()

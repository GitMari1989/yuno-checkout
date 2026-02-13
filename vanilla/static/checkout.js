// vanilla/static/checkout.js
import { getCheckoutSession, createPayment, getPublicApiKey } from "./api.js"

async function initCheckout() {
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

    // 4) Start checkout in ELEMENT mode (avoid modal blockers)
    await yuno.startCheckout({
      checkoutSession,
      elementSelector: "#root",
      countryCode,
      language: "es",

      // keep it stable for demo
      showLoading: true,
      keepLoader: false,

      // ✅ IMPORTANT: render inside the page, not a modal
      renderMode: {
        type: "element",
        elementSelector: {
          apmForm: "#form-element",
          actionForm: "#action-form-element",
        },
      },

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

          // Only continue if SDK explicitly requires it
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

    // ✅ In this flow, mountCheckout IS needed to render the payment methods list
    yuno.mountCheckout()
    log("CHECKOUT READY (mounted)")

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
    const msg = { initError: String(err), stack: err?.stack }
    console.log(msg)
    if (debugEl) debugEl.textContent += "\n" + JSON.stringify(msg, null, 2)
  }
}

// Boot (some environments don't fire yuno-sdk-ready reliably)
function boot() {
  const start = () => initCheckout()
  if (window.Yuno?.initialize) start()
  else {
    window.addEventListener("yuno-sdk-ready", start, { once: true })
    setTimeout(() => {
      if (window.Yuno?.initialize) start()
    }, 1500)
  }
}

boot()

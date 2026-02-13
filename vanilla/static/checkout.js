// vanilla/static/checkout.js
import { getCheckoutSession, createPayment, getPublicApiKey } from "./api.js"

async function initCheckout() {
  const debugEl = document.getElementById("debug")
  const log = (x) => {
    if (!debugEl) return
    debugEl.textContent += `\n${typeof x === "string" ? x : JSON.stringify(x, null, 2)}`
  }

  try {
    log("initCheckout() start")

    // 1) Get checkout session from merchant backend
    const { checkout_session: checkoutSession, country: countryCode } = await getCheckoutSession()
    log({ checkoutSession, countryCode })

    // 2) Get public key from backend
    const publicApiKey = await getPublicApiKey()
    log({ publicApiKeyPrefix: String(publicApiKey || "").split("_")[0] })

    // 3) Init SDK
    const yuno = await window.Yuno.initialize(publicApiKey)
    log("Yuno.initialize OK")

    let isPaying = false

    await yuno.startCheckout({
      checkoutSession,
      elementSelector: "#root",
      countryCode,
      language: "es",

      // Keep it simple + stable for demo
      showLoading: true,
      keepLoader: false,

      // Called when SDK created the one-time token
      async yunoCreatePayment(oneTimeToken) {
        try {
          isPaying = true
          log({ oneTimeTokenReceived: true })

          const paymentResp = await createPayment({ oneTimeToken, checkoutSession })
          log({ createPaymentResponse: paymentResp })

          // Only continue if SDK explicitly requires it
          if (paymentResp?.sdk_action_required === true) {
            log("SDK action required -> continuePayment()")
            yuno.continuePayment()
          } else {
            log("No SDK action required (skip continuePayment)")
          }
        } catch (e) {
          log({ yunoCreatePaymentError: String(e), stack: e?.stack })
          try { yuno.hideLoader() } catch (_) {}
        }
      },

      yunoPaymentMethodSelected(data) {
        log({ yunoPaymentMethodSelected: data })
      },

      yunoPaymentResult(data) {
        log({ yunoPaymentResult: data })
        try { yuno.hideLoader() } catch (_) {}
      },

      yunoError(error) {
        log({ yunoError: error })
        try { yuno.hideLoader() } catch (_) {}
      },
    })

    yuno.mountCheckout()
    log("mountCheckout() OK")

    // Start payment only when user clicks
    const payButton = document.querySelector("#button-pay")
    if (payButton) {
      payButton.addEventListener("click", () => {
        if (isPaying) return
        log("Pay button clicked -> startPayment()")
        yuno.startPayment()
      })
    } else {
      log("WARNING: #button-pay not found in HTML")
    }
  } catch (e) {
    const debugEl = document.getElementById("debug")
    if (debugEl) debugEl.textContent += `\n${String(e)}\n${e?.stack || ""}`
  }
}

// Boot with fallback (some environments don't fire yuno-sdk-ready reliably)
function boot() {
  if (window.Yuno?.initialize) {
    initCheckout()
  } else {
    window.addEventListener("yuno-sdk-ready", initCheckout, { once: true })
    setTimeout(() => {
      if (window.Yuno?.initialize) initCheckout()
    }, 1500)
  }
}

boot()

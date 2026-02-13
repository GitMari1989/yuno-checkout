// vanilla/static/checkout.js
import { getCheckoutSession, createPayment, getPublicApiKey, getPaymentMethods } from "./api.js"

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

  let isPaying = false
  let allowPayment = false
  let yuno = null

  try {
    log("INIT CHECKOUT START")

    // 1) Create checkout session (backend)
    const sessionResp = await getCheckoutSession()
    const checkoutSession = sessionResp?.checkout_session
    const countryCode = sessionResp?.country || "CO"

    log({ checkoutSession, countryCode, sessionResp })

    if (!checkoutSession) {
      log({ ERROR: "Missing checkout_session in /checkout/sessions response", sessionResp })
      __started = false
      return
    }

    // 2) Pre-check payment methods (if empty/blocked, SDK often shows error overlay)
    try {
      const pm = await getPaymentMethods(checkoutSession)
      const count = Array.isArray(pm) ? pm.length : null
      log({ paymentMethodsCount: count, paymentMethods: pm })

      if (count === 0) {
        log("STOP: checkout session has 0 payment methods (check dashboard rules: currency/country).")
        __started = false
        return
      }
    } catch (e) {
      log({ paymentMethodsError: String(e), stack: e?.stack })
      log("STOP: /payment-methods failed, not calling SDK.")
      __started = false
      return
    }

    // 3) Get public key (backend)
    const publicApiKey = await getPublicApiKey()
    log({ publicApiKeyPrefix: String(publicApiKey || "").split("_")[0] })

    if (!publicApiKey) {
      log("ERROR: Missing publicApiKey from /public-api-key")
      __started = false
      return
    }

    // 4) Ensure SDK loaded
    if (!window.Yuno?.initialize) {
      log("ERROR: window.Yuno.initialize not available (SDK not loaded yet)")
      __started = false
      return
    }

    // 5) Init SDK
    yuno = await window.Yuno.initialize(publicApiKey)
    log("YUNO INITIALIZED")

    // 6) Start Checkout
    log("Calling yuno.startCheckout(...)")

    await yuno.startCheckout({
      checkoutSession,
      elementSelector: "#root",
      countryCode,
      language: "es",

      showLoading: true,
      keepLoader: false,

      // Modal costuma ser mais estável
      renderMode: { type: "modal" },

      async yunoCreatePayment(oneTimeToken) {
        try {
          // ✅ Nunca paga sem clique
          if (!allowPayment) {
            log("yunoCreatePayment called BEFORE click -> ignoring token")
            return
          }

          if (isPaying) return
          isPaying = true

          log("yunoCreatePayment CALLED (token received)")
          log({ oneTimeTokenPreview: String(oneTimeToken || "").slice(0, 10) + "..." })

          const paymentResp = await createPayment({ oneTimeToken, checkoutSession })
          log({ createPaymentResponse: paymentResp })

          // Só continua se o back disser que o SDK precisa
          if (paymentResp?.sdk_action_required === true) {
            log("SDK action required -> continuePayment()")
            yuno.continuePayment()
          } else {
            log("No SDK action required (skip continuePayment)")
          }
        } catch (err) {
          log({ createPaymentError: String(err), stack: err?.stack })
          try { yuno.hideLoader() } catch (_) {}
        } finally {
          // libera para tentar de novo se quiser
          isPaying = false
          allowPayment = false
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

    log("startCheckout resolved")

    // ✅ ESSENCIAL no seu caso: monta a lista no #root
    if (typeof yuno.mountCheckout === "function") {
      yuno.mountCheckout()
      log("CHECKOUT MOUNTED (methods should render)")
    } else {
      log("WARNING: mountCheckout not available in this SDK version")
    }

    // 7) Pay button
    const payButton = document.querySelector("#button-pay")
    if (payButton) {
      payButton.addEventListener("click", () => {
        if (isPaying) return
        allowPayment = true
        log("PAY BUTTON CLICK -> yuno.startPayment()")
        yuno.startPayment()
      })
      log("Pay button listener attached")
    } else {
      log("WARNING: #button-pay not found")
    }
  } catch (err) {
    __started = false
    log({ initError: String(err), stack: err?.stack })
  }
}

// Boot seguro (evita init duplicado)
function boot() {
  const start = () => initCheckout()

  if (window.Yuno?.initialize) {
    start()
  } else {
    window.addEventListener("yuno-sdk-ready", start, { once: true })
    setTimeout(() => {
      if (window.Yuno?.initialize) start()
    }, 2000)
  }
}

boot()

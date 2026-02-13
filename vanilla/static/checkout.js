// vanilla/static/checkout.js
import { getCheckoutSession, getPaymentMethods, createPayment, getPublicApiKey } from "./api.js"

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

  try {
    log("INIT CHECKOUT START")

    // 1) Create checkout session
    const sessionResp = await getCheckoutSession()
    const checkoutSession = sessionResp?.checkout_session
    const countryCode = sessionResp?.country

    log({ checkoutSession, countryCode, sessionResp })

    if (!checkoutSession || !countryCode) {
      log("ERROR: Missing checkout_session or country in /checkout/sessions response")
      __started = false
      return
    }

    // 2) Validate payment methods exist for this checkout session BEFORE calling the SDK
    //    If this is empty/invalid, the SDK will often show "Transacción fallida" overlay.
    let pmResp = null
    try {
      pmResp = await getPaymentMethods(checkoutSession)
      log({ paymentMethodsResponse: pmResp })
    } catch (e) {
      log({ paymentMethodsFetchError: String(e), data: e?.data })
      log("STOPPING BEFORE SDK (payment methods endpoint failed).")
      __started = false
      return
    }

    // Heuristic: if API returns empty list/array or no obvious methods, stop and show debug
    const methods =
      pmResp?.payment_methods ||
      pmResp?.paymentMethods ||
      pmResp?.data ||
      (Array.isArray(pmResp) ? pmResp : null)

    const methodsCount = Array.isArray(methods) ? methods.length : null
    log({ methodsCount })

    if (methodsCount === 0) {
      log("STOPPING BEFORE SDK: Checkout session has ZERO payment methods. Enable at least Card in Yuno dashboard for this country.")
      __started = false
      return
    }

    // 3) Get public key
    const publicApiKey = await getPublicApiKey()
    log({ publicApiKeyPrefix: String(publicApiKey || "").split("_")[0] })

    // 4) Init SDK
    const yuno = await window.Yuno.initialize(publicApiKey)
    log("YUNO INITIALIZED")

    // 5) Start checkout (default render mode)
    await yuno.startCheckout({
      checkoutSession,
      elementSelector: "#root",
      countryCode,
      language: "es",
      showLoading: true,
      keepLoader: false,

      async yunoCreatePayment(oneTimeToken) {
        try {
          // ✅ only pay after click
          if (!allowPayment) {
            log("yunoCreatePayment called BEFORE click -> ignoring token")
            return
          }

          if (isPaying) return
          isPaying = true

          log({ oneTimeTokenReceived: true })

          const paymentResp = await createPayment({ oneTimeToken, checkoutSession })
          log({ createPaymentResponse: paymentResp })

          if (paymentResp?.sdk_action_required === true) {
            log("SDK action required -> continuePayment()")
            yuno.continuePayment()
          } else {
            log("No SDK action required (skip continuePayment)")
          }
        } catch (err) {
          isPaying = false
          allowPayment = false
          log({ createPaymentError: String(err), stack: err?.stack, data: err?.data })
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

    if (typeof yuno.mountCheckout === "function") {
      yuno.mountCheckout()
      log("CHECKOUT READY (mounted)")
    } else {
      log("WARNING: mountCheckout not available")
    }

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
    log({ initError: String(err), stack: err?.stack, data: err?.data })
  }
}

function boot() {
  const start = () => initCheckout()

  if (window.Yuno?.initialize) {
    start()
  } else {
    window.addEventListener("yuno-sdk-ready", start, { once: true })
    setTimeout(() => {
      if (window.Yuno?.initialize) start()
    }, 1500)
  }
}

boot()

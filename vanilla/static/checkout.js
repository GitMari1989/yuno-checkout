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

  let isPaying = false

  try {
    log("INIT CHECKOUT START")

    // 1) Create checkout session (backend)
    const sessionResp = await getCheckoutSession()
    const checkoutSession = sessionResp?.checkout_session
    const countryCode = sessionResp?.country || "CO"

    log({ checkoutSession, countryCode, sessionResp })

    if (!checkoutSession) {
      log("ERROR: Missing checkout_session in /checkout/sessions response")
      __started = false
      return
    }

    // 2) Get public key (backend)
    const publicApiKey = await getPublicApiKey()
    log({ publicApiKeyPrefix: String(publicApiKey || "").split("_")[0] })

    if (!publicApiKey) {
      log("ERROR: Missing publicApiKey from /public-api-key")
      __started = false
      return
    }

    // 3) Init SDK
    if (!window.Yuno?.initialize) {
      log("ERROR: window.Yuno.initialize not available (SDK not loaded)")
      __started = false
      return
    }

    const yuno = await window.Yuno.initialize(publicApiKey)
    log("YUNO INITIALIZED")

    // 4) Start checkout (MODAL mode = mais estável)
    //    Obs: NÃO chama startPayment em nenhum momento.
    log("Calling yuno.startCheckout(...)")

    await yuno.startCheckout({
      checkoutSession,
      elementSelector: "#root",
      countryCode,
      language: "es",

      showLoading: true,
      keepLoader: false,

      // Força modal (evita problemas de container/element mode)
      renderMode: {
        type: "modal",
      },

      // Só é chamado quando o SDK realmente gerar token (depois do fluxo)
      async yunoCreatePayment(oneTimeToken) {
        try {
          if (isPaying) return
          isPaying = true

          log("yunoCreatePayment CALLED (token received)")
          log({ oneTimeTokenPreview: String(oneTimeToken || "").slice(0, 10) + "..." })

          const paymentResp = await createPayment({ oneTimeToken, checkoutSession })
          log({ createPaymentResponse: paymentResp })

          // Importante: só chamar continuePayment se o SDK pedir isso explicitamente
          if (paymentResp?.sdk_action_required === true) {
            log("SDK action required -> continuePayment()")
            yuno.continuePayment()
          } else {
            log("No SDK action required (skip continuePayment)")
          }
        } catch (err) {
          log({ createPaymentError: String(err), stack: err?.stack })
          try { yuno.hideLoader() } catch (_) {}
          isPaying = false
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

    // 5) Render list of methods (se o SDK exigir)
    if (typeof yuno.mountCheckout === "function") {
      yuno.mountCheckout()
      log("CHECKOUT READY (mounted)")
    } else {
      log("WARNING: mountCheckout not available in this SDK version")
    }

    // 6) Pay button
    const payButton = document.querySelector("#button-pay")
    if (payButton) {
      payButton.addEventListener("click", () => {
        if (isPaying) return
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

// vanilla/static/checkout.js
import { getCheckoutSession, createPayment, getPublicApiKey } from "./api.js"

let __started = false

async function initCheckout() {
  if (__started) return
  __started = true

  const debugEl = document.getElementById("debug")
  const payButton = document.getElementById("button-pay")

  const log = (x) => {
    const msg = typeof x === "string" ? x : JSON.stringify(x, null, 2)
    console.log(msg)
    if (debugEl) debugEl.textContent += "\n" + msg
  }

  let isPaying = false
  let allowPayment = false
  let yuno = null

  try {
    log("INIT CHECKOUT START")

    // 1) Session
    const sessionResp = await getCheckoutSession()
    const checkoutSession = sessionResp?.checkout_session
    const countryCode = sessionResp?.country || "CO"
    log({ checkoutSession, countryCode })

    if (!checkoutSession) {
      log({ ERROR: "Missing checkout_session", sessionResp })
      __started = false
      return
    }

    // 2) Public key
    const publicApiKey = await getPublicApiKey()
    log({ publicApiKeyPrefix: String(publicApiKey || "").split("_")[0] })

    if (!publicApiKey) {
      log("ERROR: Missing publicApiKey from /public-api-key")
      __started = false
      return
    }

    // 3) SDK loaded?
    if (!window.Yuno?.initialize) {
      log("ERROR: window.Yuno.initialize not available (SDK not loaded)")
      __started = false
      return
    }

    // 4) Init
    yuno = await window.Yuno.initialize(publicApiKey)
    log("YUNO INITIALIZED")

    // 5) Start checkout in ELEMENT mode (mais estável)
    await yuno.startCheckout({
      checkoutSession,
      elementSelector: "#root",
      countryCode,
      language: "es",

      // Evita overlay/loader travando clique
      showLoading: false,
      keepLoader: false,

      renderMode: {
        type: "element",
        elementSelector: {
          apmForm: "#form-element",
          actionForm: "#action-form-element",
        },
      },

      onLoading: (args) => {
        // apenas log (não cria overlay)
        log({ onLoading: args })
      },

      async yunoCreatePayment(oneTimeToken) {
        try {
          // GARANTE que não cria payment sozinho
          if (!allowPayment) {
            log("yunoCreatePayment called BEFORE click -> ignoring token")
            return
          }

          if (isPaying) return
          isPaying = true

          log("TOKEN RECEIVED")
          log({ oneTimeTokenPreview: String(oneTimeToken || "").slice(0, 10) + "..." })

          const paymentResp = await createPayment({ oneTimeToken, checkoutSession })
          log({ createPaymentResponse: paymentResp })

          // continuePayment só se o seu backend disser que precisa
          if (paymentResp?.sdk_action_required === true) {
            log("SDK action required -> continuePayment()")
            yuno.continuePayment()
          } else {
            log("No SDK action required (skip continuePayment)")
          }
        } catch (err) {
          log({ createPaymentError: String(err), stack: err?.stack })
          isPaying = false
          allowPayment = false
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

    // Em element mode, normalmente precisa montar a lista
    if (typeof yuno.mountCheckout === "function") {
      yuno.mountCheckout()
      log("CHECKOUT READY (mounted)")
    } else {
      log("WARNING: mountCheckout not available")
    }

    // 6) Botão pagar (sempre clicável — debug não bloqueia)
    if (payButton) {
      payButton.addEventListener("click", () => {
        if (!yuno) return
        if (isPaying) return

        allowPayment = true
        log("PAY BUTTON CLICK -> startPayment()")
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

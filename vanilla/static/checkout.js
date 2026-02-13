// vanilla/static/checkout.js
import { getCheckoutSession, createPayment, getPublicApiKey } from "./api.js"

let __started = false

async function initCheckout() {
  if (__started) return
  __started = true

  const debugEl = document.getElementById("debug")
  const payButton = document.querySelector("#button-pay")

  const log = (x) => {
    const msg = typeof x === "string" ? x : JSON.stringify(x, null, 2)
    console.log(msg)
    if (debugEl) debugEl.textContent += "\n" + msg
    window.__last_debug = msg
  }

  const setPayEnabled = (enabled, label) => {
    if (!payButton) return
    payButton.disabled = !enabled
    if (label) payButton.textContent = label
    payButton.style.opacity = enabled ? "1" : "0.6"
    payButton.style.cursor = enabled ? "pointer" : "not-allowed"
  }

  // Espera um elemento existir no DOM (ex: [id^="cvv-"])
  const waitForElement = async (selector, { timeoutMs = 4000, intervalMs = 100 } = {}) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const el = document.querySelector(selector)
      if (el) return el
      await new Promise((r) => setTimeout(r, intervalMs))
    }
    return null
  }

  let isPaying = false
  let methodSelected = false
  let yuno = null

  try {
    setPayEnabled(false, "Seleccione Tarjeta")

    log("INIT CHECKOUT START")

    // 1) Create checkout session (backend)
    const sessionResp = await getCheckoutSession()
    const checkoutSession = sessionResp?.checkout_session
    const countryCode = sessionResp?.country || "CO"

    log({ checkoutSession, countryCode })

    if (!checkoutSession) {
      log({ ERROR: "Missing checkout_session in /checkout/sessions response", sessionResp })
      __started = false
      setPayEnabled(false, "Error en sesión")
      return
    }

    // 2) Get public key (backend)
    const publicApiKey = await getPublicApiKey()
    log({ publicApiKeyPrefix: String(publicApiKey || "").split("_")[0] })

    if (!publicApiKey) {
      log("ERROR: Missing publicApiKey from /public-api-key")
      __started = false
      setPayEnabled(false, "Error en key")
      return
    }

    // 3) Ensure SDK loaded
    if (!window.Yuno?.initialize) {
      log("ERROR: window.Yuno.initialize not available (SDK not loaded yet)")
      __started = false
      setPayEnabled(false, "SDK no cargó")
      return
    }

    // 4) Init SDK
    yuno = await window.Yuno.initialize(publicApiKey)
    log("YUNO INITIALIZED")

    const safeRemount = () => {
      try {
        if (typeof yuno?.mountCheckout === "function") {
          yuno.mountCheckout()
          log("Remounted checkout UI")
        }
      } catch (e) {
        log({ remountError: String(e) })
      }
    }

    // 5) Start checkout (ELEMENT mode)
    await yuno.startCheckout({
      checkoutSession,
      elementSelector: "#root",
      countryCode,
      language: "es",

      showLoading: true,
      keepLoader: false,

      renderMode: { type: "element" },

      async yunoCreatePayment(oneTimeToken) {
        try {
          if (!methodSelected) {
            log("yunoCreatePayment called but no method selected -> ignoring")
            return
          }

          if (isPaying) return
          isPaying = true
          setPayEnabled(false, "Procesando...")

          log("yunoCreatePayment CALLED (token received)")
          log({ oneTimeTokenPreview: String(oneTimeToken || "").slice(0, 10) + "..." })

          const paymentResp = await createPayment({ oneTimeToken, checkoutSession })
          log({ createPaymentResponse: paymentResp })

          if (paymentResp?.sdk_action_required === true) {
            log("SDK action required -> continuePayment()")
            yuno.continuePayment()
          } else {
            log("No SDK action required (skip continuePayment)")
          }
        } catch (err) {
          log({ createPaymentError: String(err), stack: err?.stack })
          isPaying = false
          setPayEnabled(true, "Pagar Ahora")
          try { yuno.hideLoader() } catch (_) {}
          safeRemount()
        }
      },

      async yunoPaymentMethodSelected(data) {
        methodSelected = true
        log({ yunoPaymentMethodSelected: data })

        // 🔥 CRÍTICO: esperar o CVV aparecer no DOM ANTES de habilitar o botão
        setPayEnabled(false, "Cargando formulario...")

        // Remonta para garantir que o form foi renderizado
        safeRemount()

        // Espera qualquer elemento cujo id começa com "cvv-"
        const cvvEl = await waitForElement('[id^="cvv-"]', { timeoutMs: 5000, intervalMs: 100 })

        if (!cvvEl) {
          log("WARNING: CVV element not found after selection (still waiting).")
          setPayEnabled(false, "Formulario no listo")
          return
        }

        log({ cvvElementFound: cvvEl.id })
        setPayEnabled(true, "Pagar Ahora")
      },

      yunoPaymentResult(data) {
        log({ yunoPaymentResult: data })
        isPaying = false
        setPayEnabled(true, "Pagar Ahora")
        try { yuno.hideLoader() } catch (_) {}
        safeRemount()
      },

      yunoError(error) {
        log({ yunoError: error })
        isPaying = false
        setPayEnabled(true, "Pagar Ahora")
        try { yuno.hideLoader() } catch (_) {}
        safeRemount()
      },
    })

    // mount to render the method list
    if (typeof yuno.mountCheckout === "function") {
      yuno.mountCheckout()
      log("CHECKOUT READY (mounted)")
    } else {
      log("WARNING: mountCheckout not available in this SDK version")
    }

    // 6) Pay button
    if (payButton) {
      payButton.addEventListener("click", async () => {
        log("PAY BUTTON CLICK -> startPayment()")

        if (!methodSelected) {
          log("Blocked: no payment method selected yet")
          return
        }
        if (isPaying) {
          log("Blocked: already paying")
          return
        }

        // 🔥 Guard extra: se CVV não existe, remonta e espera
        const cvvNow = document.querySelector('[id^="cvv-"]')
        if (!cvvNow) {
          log("CVV not in DOM at click time -> remount + wait")
          safeRemount()
          const cvvEl = await waitForElement('[id^="cvv-"]', { timeoutMs: 5000, intervalMs: 100 })
          if (!cvvEl) {
            log("ERROR: CVV still missing -> abort startPayment")
            return
          }
          log({ cvvElementFoundAtClick: cvvEl.id })
        }

        try {
          isPaying = true
          setPayEnabled(false, "Procesando...")
          await yuno.startPayment()
          log("yuno.startPayment() called")
        } catch (e) {
          log({ startPaymentError: String(e) })
          isPaying = false
          setPayEnabled(true, "Pagar Ahora")
          try { yuno.hideLoader() } catch (_) {}
          safeRemount()
        }
      })

      log("Pay button listener attached")
    } else {
      log("WARNING: #button-pay not found")
    }
  } catch (err) {
    __started = false
    log({ initError: String(err), stack: err?.stack })
    setPayEnabled(false, "Error")
  }
}

// Boot seguro
function boot() {
  const start = () => initCheckout()
  if (window.Yuno?.initialize) start()
  else {
    window.addEventListener("yuno-sdk-ready", start, { once: true })
    setTimeout(() => {
      if (window.Yuno?.initialize) start()
    }, 2000)
  }
}

boot()

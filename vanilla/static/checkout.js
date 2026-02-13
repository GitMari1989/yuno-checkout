// vanilla/static/checkout.js
import { getCheckoutSession, createPayment, getPublicApiKey } from "./api.js"

console.log("CHECKOUT.JS LOADED ✅")

let __started = false

async function initCheckout() {
  if (__started) return
  __started = true

  const debugEl = document.getElementById("debug")
  const payButton = document.getElementById("button-pay")
  const rootEl = document.getElementById("root")

  const log = (x) => {
    const msg = typeof x === "string" ? x : JSON.stringify(x, null, 2)
    console.log(msg)
    if (debugEl) debugEl.textContent += (debugEl.textContent ? "\n" : "") + msg
    window.__last_debug = msg
  }

  const setPayEnabled = (enabled, label) => {
    if (!payButton) return
    payButton.disabled = !enabled
    payButton.textContent = label || (enabled ? "Pagar Ahora" : "Formulario no listo")
  }

  setPayEnabled(false, "Formulario no listo")

  let isPaying = false
  let yuno = null
  let checkoutSession = null
  let countryCode = "CO"

  /**
   * ✅ Detecção mais robusta: considera que o SDK pode renderizar
   * inputs e/ou iframes dentro do #root (muito comum).
   */
  const formLooksReady = () => {
    if (!rootEl) return false

    // 1) iframes (secure fields geralmente são iframes)
    const iframes = rootEl.querySelectorAll("iframe")
    if (iframes && iframes.length > 0) return true

    // 2) inputs (alguns SDKs usam inputs normais)
    const inputs = rootEl.querySelectorAll("input, select, textarea")
    if (inputs && inputs.length > 0) return true

    // 3) fallback: algum elemento com "card"/"cvv"/"security" no id/class
    const hints = rootEl.querySelectorAll('[id*="cvv"],[id*="card"],[class*="cvv"],[class*="card"],[class*="security"]')
    if (hints && hints.length > 0) return true

    return false
  }

  function waitForFormReady({ timeoutMs = 12000 } = {}) {
    return new Promise((resolve) => {
      if (!rootEl) return resolve(false)
      if (formLooksReady()) return resolve(true)

      const startedAt = Date.now()
      const obs = new MutationObserver(() => {
        if (formLooksReady()) {
          obs.disconnect()
          resolve(true)
        } else if (Date.now() - startedAt > timeoutMs) {
          obs.disconnect()
          resolve(false)
        }
      })

      obs.observe(rootEl, { childList: true, subtree: true })

      setTimeout(() => {
        try { obs.disconnect() } catch (_) {}
        resolve(formLooksReady())
      }, timeoutMs + 50)
    })
  }

  let warnedOnce = false

  try {
    log("INIT CHECKOUT START")

    // 1) Create checkout session (backend)
    const sessionResp = await getCheckoutSession()
    checkoutSession = sessionResp?.checkout_session
    countryCode = sessionResp?.country || "CO"

    log({ checkoutSession, countryCode })

    if (!checkoutSession) {
      log({ ERROR: "Missing checkout_session in /checkout/sessions response", sessionResp })
      __started = false
      return
    }

    // 2) Get public key
    const publicApiKey = await getPublicApiKey()
    log({ publicApiKeyPrefix: String(publicApiKey || "").split("_")[0] })

    if (!publicApiKey) {
      log("ERROR: Missing publicApiKey from /public-api-key")
      __started = false
      return
    }

    // 3) Ensure SDK loaded
    if (!window.Yuno?.initialize) {
      log("ERROR: window.Yuno.initialize not available (SDK not loaded yet)")
      __started = false
      return
    }

    // 4) Init SDK
    yuno = await window.Yuno.initialize(publicApiKey)
    log("YUNO INITIALIZED")

    // 5) Start checkout
    await yuno.startCheckout({
      checkoutSession,
      elementSelector: "#root",
      countryCode,
      language: "es",
      showLoading: true,
      keepLoader: false,

      async yunoCreatePayment(oneTimeToken) {
        try {
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
          log({ createPaymentError: String(err), stack: err?.stack, data: err?.data })
          try { yuno.hideLoader() } catch (_) {}
          isPaying = false
          setPayEnabled(true, "Pagar Ahora")
        }
      },

      yunoPaymentMethodSelected(data) {
        log({ yunoPaymentMethodSelected: data })

        // Quando seleciona método, espera o form renderizar e então habilita
        ;(async () => {
          warnedOnce = false
          setPayEnabled(false, "Cargando formulario...")

          const ok = await waitForFormReady({ timeoutMs: 15000 })
          if (!ok) {
            if (!warnedOnce) {
              warnedOnce = true
              log("WARNING: Form fields not found after selection (still waiting).")
            }
            // mantém disabled, mas deixa o texto claro
            setPayEnabled(false, "Formulario no listo")
            return
          }

          setPayEnabled(true, "Pagar Ahora")
        })()
      },

      yunoPaymentResult(data) {
        log({ yunoPaymentResult: data })
        isPaying = false
        try { yuno.hideLoader() } catch (_) {}
        setPayEnabled(true, "Pagar Ahora")
      },

      yunoError(error) {
        log({ yunoError: error })
        isPaying = false
        try { yuno.hideLoader() } catch (_) {}
        // deixa tentar de novo
        setPayEnabled(true, "Pagar Ahora")
      },
    })

    // 6) Mount (no seu caso é necessário pra aparecer Tarjeta)
    if (typeof yuno.mountCheckout === "function") {
      yuno.mountCheckout()
      log("CHECKOUT READY (mounted)")
    } else {
      log("WARNING: mountCheckout not available")
    }

    // 7) Pay button
    if (payButton) {
      payButton.addEventListener("click", async () => {
        if (isPaying) return

        // Proteção: garante que o form existe antes de startPayment
        if (!formLooksReady()) {
          setPayEnabled(false, "Cargando formulario...")
          const ok = await waitForFormReady({ timeoutMs: 8000 })
          if (!ok) {
            log("BLOCKED: Form still not ready in DOM. Not calling startPayment().")
            setPayEnabled(false, "Formulario no listo")
            return
          }
          setPayEnabled(true, "Pagar Ahora")
        }

        log("PAY BUTTON CLICK -> yuno.startPayment()")
        setPayEnabled(false, "Procesando...")
        yuno.startPayment()
      })

      log("Pay button listener attached")
    } else {
      log("WARNING: #button-pay not found")
    }
  } catch (err) {
    __started = false
    log({ initError: String(err), stack: err?.stack, data: err?.data })
    setPayEnabled(false, "Formulario no listo")
  }
}

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

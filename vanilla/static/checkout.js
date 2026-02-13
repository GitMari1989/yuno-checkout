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
    payButton.textContent = label || (enabled ? "Pagar Ahora" : "Procesando...")
  }

  const finishUi = (label = "Pagar Ahora") => {
    try {
      // se o SDK estiver com loader aberto por algum motivo
      if (yuno?.hideLoader) yuno.hideLoader()
    } catch (_) {}
    isPaying = false
    setPayEnabled(true, label)
  }

  setPayEnabled(false, "Cargando...")

  let isPaying = false
  let yuno = null
  let checkoutSession = null
  let countryCode = "CO"

  const formLooksReady = () => {
    if (!rootEl) return false
    const iframes = rootEl.querySelectorAll("iframe")
    if (iframes?.length) return true
    const inputs = rootEl.querySelectorAll("input, select, textarea")
    if (inputs?.length) return true
    const hints = rootEl.querySelectorAll(
      '[id*="cvv"],[id*="card"],[class*="cvv"],[class*="card"],[class*="security"]'
    )
    return !!hints?.length
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

  try {
    log("INIT CHECKOUT START")

    // 1) Create checkout session
    const sessionResp = await getCheckoutSession()
    checkoutSession = sessionResp?.checkout_session
    countryCode = sessionResp?.country || "CO"

    log({ checkoutSession, countryCode })

    if (!checkoutSession) {
      log({ ERROR: "Missing checkout_session in /checkout/sessions response", sessionResp })
      __started = false
      setPayEnabled(false, "Error")
      return
    }

    // 2) Get public key
    const publicApiKey = await getPublicApiKey()
    log({ publicApiKeyPrefix: String(publicApiKey || "").split("_")[0] })

    if (!publicApiKey) {
      log("ERROR: Missing publicApiKey from /public-api-key")
      __started = false
      setPayEnabled(false, "Error")
      return
    }

    // 3) Ensure SDK loaded
    if (!window.Yuno?.initialize) {
      log("ERROR: window.Yuno.initialize not available (SDK not loaded yet)")
      __started = false
      setPayEnabled(false, "Error")
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

          const needsSdkAction = paymentResp?.checkout?.sdk_action_required === true
            || paymentResp?.sdk_action_required === true

          if (needsSdkAction) {
            log("SDK action required -> continuePayment()")
            yuno.continuePayment()
            // UI vai finalizar em yunoPaymentResult
            return
          }

          // ✅ CASO NORMAL (como o seu): pagamento SUCCEEDED e não precisa continuePayment
          log("No SDK action required (skip continuePayment)")

          // Finaliza UI agora (senão fica preso em 'Procesando...')
          finishUi("Pago ✅")

          // opcional: depois de 1.5s volta o botão ao normal
          setTimeout(() => finishUi("Pagar Ahora"), 1500)

        } catch (err) {
          log({ createPaymentError: String(err), stack: err?.stack, data: err?.data })
          finishUi("Pagar Ahora")
        }
      },

      yunoPaymentMethodSelected(data) {
        log({ yunoPaymentMethodSelected: data })

        ;(async () => {
          setPayEnabled(false, "Cargando formulario...")
          const ok = await waitForFormReady({ timeoutMs: 15000 })
          if (!ok) {
            log("WARNING: Form not ready in DOM (still).")
            setPayEnabled(false, "Formulario no listo")
            return
          }
          setPayEnabled(true, "Pagar Ahora")
        })()
      },

      yunoPaymentResult(data) {
        log({ yunoPaymentResult: data })
        // Se o fluxo passou pelo continuePayment, finaliza aqui
        finishUi("Pago ✅")
        setTimeout(() => finishUi("Pagar Ahora"), 1500)
      },

      yunoError(error) {
        log({ yunoError: error })
        finishUi("Pagar Ahora")
      },
    })

    // 6) Mount
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

        // garante que o form está no DOM antes do startPayment
        if (!formLooksReady()) {
          setPayEnabled(false, "Cargando formulario...")
          const ok = await waitForFormReady({ timeoutMs: 8000 })
          if (!ok) {
            log("BLOCKED: Form still not ready. Not calling startPayment().")
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
      // já deixa clicável assim que a lista estiver pronta (o Selected habilita de vez)
      setPayEnabled(true, "Pagar Ahora")
    } else {
      log("WARNING: #button-pay not found")
    }
  } catch (err) {
    __started = false
    log({ initError: String(err), stack: err?.stack, data: err?.data })
    setPayEnabled(false, "Error")
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

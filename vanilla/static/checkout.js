// vanilla/static/checkout.js
import { getCheckoutSession, createPayment, getPublicApiKey } from "./api.js"

console.log("CHECKOUT.JS LOADED ✅")

let __started = false

async function initCheckout() {
  if (__started) return
  __started = true

  const debugEl = document.getElementById("debug")
  const payButton = document.getElementById("button-pay")

  const log = (x) => {
    const msg = typeof x === "string" ? x : JSON.stringify(x, null, 2)
    console.log(msg)
    if (debugEl) debugEl.textContent += (debugEl.textContent ? "\n" : "") + msg
    window.__last_debug = msg
  }

  const setPayEnabled = (enabled) => {
    if (!payButton) return
    payButton.disabled = !enabled
    payButton.textContent = enabled ? "Pagar Ahora" : "Formulario no listo"
  }

  // começa travado
  setPayEnabled(false)

  let isPaying = false
  let yuno = null
  let checkoutSession = null
  let countryCode = "CO"

  // espera CVV aparecer no DOM (o id é dinâmico: cvv-<uuid>)
  function waitForCvvElement({ timeoutMs = 12000 } = {}) {
    return new Promise((resolve) => {
      const root = document.getElementById("root")
      if (!root) return resolve(false)

      const hasCvv = () => !!root.querySelector('[id^="cvv-"]')

      if (hasCvv()) return resolve(true)

      const startedAt = Date.now()
      const obs = new MutationObserver(() => {
        if (hasCvv()) {
          obs.disconnect()
          resolve(true)
        } else if (Date.now() - startedAt > timeoutMs) {
          obs.disconnect()
          resolve(false)
        }
      })

      obs.observe(root, { childList: true, subtree: true })

      // fallback timeout
      setTimeout(() => {
        try { obs.disconnect() } catch (_) {}
        resolve(hasCvv())
      }, timeoutMs + 50)
    })
  }

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

    // 2) Get public key (backend)
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

    // 5) Start checkout in ELEMENT mode (render dentro do #root)
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
          setPayEnabled(false)

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
          setPayEnabled(true)
        }
      },

      yunoPaymentMethodSelected(data) {
        log({ yunoPaymentMethodSelected: data })
        // quando selecionar método, aguarda o CVV/form existir para liberar o botão
        ;(async () => {
          const ok = await waitForCvvElement({ timeoutMs: 12000 })
          if (!ok) log("WARNING: CVV element not found after selection (still waiting).")
          setPayEnabled(ok)
        })()
      },

      yunoPaymentResult(data) {
        log({ yunoPaymentResult: data })
        isPaying = false
        try { yuno.hideLoader() } catch (_) {}
        // pode liberar novamente se quiser tentar de novo
        setPayEnabled(true)
      },

      yunoError(error) {
        log({ yunoError: error })
        isPaying = false
        try { yuno.hideLoader() } catch (_) {}
        // reabilita para nova tentativa
        setPayEnabled(true)
      },
    })

    // 6) Mount list/forms (necessário no seu caso para aparecer "Tarjeta")
    if (typeof yuno.mountCheckout === "function") {
      yuno.mountCheckout()
      log("CHECKOUT READY (mounted)")
    } else {
      log("WARNING: mountCheckout not available in this SDK version")
    }

    // 7) Pay button
    if (payButton) {
      payButton.addEventListener("click", async () => {
        if (isPaying) return

        // ✅ proteção extra: só deixa pagar se o CVV existir
        const root = document.getElementById("root")
        const hasCvv = !!root?.querySelector('[id^="cvv-"]')
        if (!hasCvv) {
          log("BLOCKED: CVV element still not in DOM. Wait form to render.")
          setPayEnabled(false)
          const ok = await waitForCvvElement({ timeoutMs: 8000 })
          setPayEnabled(ok)
          return
        }

        log("PAY BUTTON CLICK -> yuno.startPayment()")
        setPayEnabled(false)
        yuno.startPayment()
      })
      log("Pay button listener attached")
    }
  } catch (err) {
    __started = false
    log({ initError: String(err), stack: err?.stack, data: err?.data })
    setPayEnabled(false)
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

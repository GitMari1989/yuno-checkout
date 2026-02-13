// vanilla/static/checkout.js
import { getCheckoutSession, createPayment, getPublicApiKey, getPaymentById } from "./api.js"

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

  const setButton = (enabled, text) => {
    if (!payButton) return
    payButton.disabled = !enabled
    if (text) payButton.textContent = text
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  async function pollPayment(paymentId, timeoutMs = 30000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const p = await getPaymentById(paymentId)
        log({ pollPayment: { id: paymentId, status: p?.status, sub_status: p?.sub_status } })

        if (p?.status && ["SUCCEEDED", "REJECTED", "DECLINED", "CANCELLED", "ERROR", "EXPIRED"].includes(p.status)) {
          return p
        }
      } catch (e) {
        log({ pollPaymentError: String(e) })
      }
      await sleep(1500)
    }
    return { status: "TIMEOUT" }
  }

  try {
    log("CHECKOUT.JS LOADED ✅")
    log("INIT CHECKOUT START")

    // 1) session
    const sessionResp = await getCheckoutSession()
    const checkoutSession = sessionResp?.checkout_session
    const countryCode = sessionResp?.country || "CO"

    log({ checkoutSession, countryCode })

    if (!checkoutSession) {
      log({ ERROR: "Missing checkout_session", sessionResp })
      __started = false
      return
    }

    // 2) key
    const publicApiKey = await getPublicApiKey()
    log({ publicApiKeyPrefix: String(publicApiKey || "").split("_")[0] })

    if (!publicApiKey) {
      log("ERROR: Missing publicApiKey")
      __started = false
      return
    }

    // 3) sdk
    if (!window.Yuno?.initialize) {
      log("ERROR: SDK not loaded (window.Yuno.initialize missing)")
      __started = false
      return
    }

    const yuno = await window.Yuno.initialize(publicApiKey)
    log("YUNO INITIALIZED")

    let isPaying = false
    let selectedMethod = null

    setButton(false, "Seleccione un método…")

    await yuno.startCheckout({
      checkoutSession,
      elementSelector: "#root",
      countryCode,
      language: "es",
      showLoading: true,
      keepLoader: false,

      yunoPaymentMethodSelected(data) {
        selectedMethod = data
        log({ yunoPaymentMethodSelected: data })

        // habilita pagar assim que escolher Tarjeta (ou outro método)
        setButton(true, "Pagar Ahora")
      },

      async yunoCreatePayment(oneTimeToken) {
        try {
          if (isPaying) return
          isPaying = true
          setButton(false, "Procesando…")

          log("yunoCreatePayment CALLED (token received)")
          log({ oneTimeTokenPreview: String(oneTimeToken || "").slice(0, 10) + "..." })

          const paymentResp = await createPayment({ oneTimeToken, checkoutSession })
          log({ createPaymentResponse: paymentResp })

          // ✅ 1) tenta finalizar o fluxo do SDK SEM depender do flag
          try {
            if (typeof yuno.continuePayment === "function") {
              log("Trying yuno.continuePayment() (safe)")
              yuno.continuePayment()
            }
          } catch (e) {
            log({ continuePaymentError: String(e) })
          }

          // ✅ 2) polling do payment (fecha UI mesmo se o SDK não chamar yunoPaymentResult)
          const paymentId = paymentResp?.id
          if (paymentId) {
            const finalStatus = await pollPayment(paymentId, 30000)

            if (finalStatus?.status === "SUCCEEDED") {
              setButton(true, "Pago ✅ (nuevo pago)")
              try { yuno.hideLoader() } catch (_) {}
              await sleep(1500)
              setButton(true, "Pagar Ahora")
              isPaying = false
              return
            }

            if (finalStatus?.status === "TIMEOUT") {
              log("Payment status TIMEOUT (still processing on backend?)")
              setButton(true, "Reintentar")
              try { yuno.hideLoader() } catch (_) {}
              isPaying = false
              return
            }

            // erro final
            log({ paymentFinalNotSucceeded: finalStatus })
            setButton(true, "Reintentar")
            try { yuno.hideLoader() } catch (_) {}
            isPaying = false
            return
          }

          // se não veio id, só libera UI
          setButton(true, "Pagar Ahora")
          try { yuno.hideLoader() } catch (_) {}
          isPaying = false
        } catch (err) {
          log({ createPaymentError: String(err), stack: err?.stack })
          setButton(true, "Reintentar")
          try { yuno.hideLoader() } catch (_) {}
          isPaying = false
        }
      },

      yunoPaymentResult(data) {
        // se o SDK chamar, ótimo — só loga e libera botão
        log({ yunoPaymentResult: data })
        setButton(true, "Pagar Ahora")
        try { yuno.hideLoader() } catch (_) {}
      },

      yunoError(error) {
        log({ yunoError: error })
        setButton(true, "Reintentar")
        try { yuno.hideLoader() } catch (_) {}
      },
    })

    if (typeof yuno.mountCheckout === "function") {
      yuno.mountCheckout()
      log("CHECKOUT READY (mounted)")
    }

    if (payButton) {
      payButton.addEventListener("click", () => {
        if (payButton.disabled) return
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

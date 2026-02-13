import { getCheckoutSession, createPayment, getPublicApiKey } from "./api.js"

async function initCheckout() {

  const debugEl = document.getElementById("debug")

  const log = (x) => {
    const msg = typeof x === "string" ? x : JSON.stringify(x, null, 2)

    console.log(msg)

    if (debugEl) {
      debugEl.textContent += "\n" + msg
    }

    window.__last_debug = msg
  }

  try {

    log("INIT CHECKOUT START")

    // ✅ create checkout session
    const { checkout_session: checkoutSession, country: countryCode } = await getCheckoutSession()

    log({ checkoutSession, countryCode })

    // ✅ get api key
    const publicApiKey = await getPublicApiKey()

    log("PUBLIC KEY OK")

    // ✅ init SDK
    const yuno = await window.Yuno.initialize(publicApiKey)

    log("YUNO INITIALIZED")

    let isPaying = false

    await yuno.startCheckout({

      checkoutSession,
      elementSelector: "#root",
      countryCode,
      language: "es",

      // 🔥 MUITO importante
      showLoading: true,
      keepLoader: false,

      async yunoCreatePayment(oneTimeToken) {

        try {

          if (isPaying) return
          isPaying = true

          log("TOKEN RECEIVED")

          const paymentResp = await createPayment({
            oneTimeToken,
            checkoutSession
          })

          log(paymentResp)

          /**
           * 🔴 CRÍTICO:
           * Só chamar continuePayment se o SDK pedir.
           * Caso contrário → erro automático.
           */

          if (paymentResp?.sdk_action_required === true) {

            log("CONTINUE PAYMENT")

            yuno.continuePayment()

          } else {

            log("NO CONTINUE PAYMENT NEEDED")

          }

        } catch (err) {

          log({
            createPaymentError: String(err),
            stack: err?.stack
          })

        }
      },

      yunoPaymentResult(data) {

        log({
          PAYMENT_RESULT: data
        })

      },

      yunoError(error) {

        log({
          YUNO_ERROR: error
        })

        alert("YUNO ERROR — veja debug")

      }

    })

    /**
     * ❌ NÃO usar mountCheckout no Full SDK
     */
    // yuno.mountCheckout()

    log("CHECKOUT READY")

    const payButton = document.querySelector("#button-pay")

    if (payButton) {

      payButton.addEventListener("click", () => {

        if (isPaying) return

        log("START PAYMENT CLICK")

        yuno.startPayment()

      })

    }

  } catch (err) {

    log({
      INIT_ERROR: String(err),
      stack: err?.stack
    })

  }
}


/**
 * Boot ultra seguro
 * (resolve MUITOS problemas de SDK)
 */
function boot() {

  if (window.Yuno?.initialize) {

    initCheckout()

  } else {

    window.addEventListener(
      "yuno-sdk-ready",
      initCheckout,
      { once: true }
    )

    setTimeout(() => {

      if (window.Yuno?.initialize) {
        initCheckout()
      }

    }, 2000)

  }
}

boot()

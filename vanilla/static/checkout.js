// vanilla/static/checkout.js
// Versão sem "import" para evitar falhas de módulo e garantir debug SEMPRE.

(function () {
  const debugEl = document.getElementById("debug");
  const payButton = document.getElementById("button-pay");

  const log = (x) => {
    try {
      const msg = typeof x === "string" ? x : JSON.stringify(x, null, 2);
      console.log(msg);
      if (debugEl) debugEl.textContent += (debugEl.textContent ? "\n" : "") + msg;
      window.__last_debug = msg;
    } catch (e) {
      console.log("LOG_ERROR", e);
    }
  };

  // Captura erros JS que poderiam impedir qualquer log
  window.addEventListener("error", (e) => {
    log({ windowError: String(e?.message || e), source: e?.filename, line: e?.lineno, col: e?.colno });
  });

  window.addEventListener("unhandledrejection", (e) => {
    log({ unhandledRejection: String(e?.reason || e) });
  });

  // Estado
  let __started = false;
  let isPaying = false;
  let yuno = null;
  let checkoutSession = null;
  let countryCode = "CO";

  // Helpers de API (mesma lógica do seu api.js, mas inline)
  async function getPublicApiKey() {
    const resp = await fetch(`/public-api-key${window.location.search}`, { method: "GET" });
    const data = await resp.json();
    return data?.publicApiKey;
  }

  async function getCheckoutSession() {
    const resp = await fetch(`/checkout/sessions${window.location.search}`, { method: "POST" });
    // se backend cair, isso já aparece no debug
    return resp.json();
  }

  async function createPayment(payload) {
    const resp = await fetch(`/payments${window.location.search}`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
    return resp.json();
  }

  function setPayEnabled(enabled) {
    if (!payButton) return;
    payButton.disabled = !enabled;
  }

  async function initCheckout() {
    if (__started) return;
    __started = true;

    log("CHECKOUT.JS LOADED ✅");
    setPayEnabled(false);

    try {
      // 1) cria session
      log("INIT CHECKOUT START");
      const sessionResp = await getCheckoutSession();

      checkoutSession = sessionResp?.checkout_session;
      countryCode = sessionResp?.country || "CO";

      log({ checkoutSession, countryCode });

      if (!checkoutSession) {
        log({ ERROR: "Missing checkout_session from /checkout/sessions", sessionResp });
        __started = false;
        return;
      }

      // 2) pega public key
      const publicApiKey = await getPublicApiKey();
      log({ publicApiKeyPrefix: String(publicApiKey || "").split("_")[0] });

      if (!publicApiKey) {
        log("ERROR: Missing publicApiKey from /public-api-key");
        __started = false;
        return;
      }

      // 3) valida SDK
      if (!window.Yuno || typeof window.Yuno.initialize !== "function") {
        log("ERROR: Yuno SDK not loaded. window.Yuno.initialize not found");
        __started = false;
        return;
      }

      // 4) init SDK
      yuno = await window.Yuno.initialize(publicApiKey);
      log("YUNO INITIALIZED");

      // 5) start checkout (flow que já funcionou contigo: mounted list)
      await yuno.startCheckout({
        checkoutSession,
        elementSelector: "#root",
        countryCode,
        language: "es",
        showLoading: true,
        keepLoader: false,

        // Importante: manter padrão (sem inventar element placeholders)
        // Modal costuma ser estável, mas vamos manter o checkout montado na página.
        renderMode: { type: "element" },

        async yunoCreatePayment(oneTimeToken) {
          try {
            if (isPaying) return;
            isPaying = true;

            log("yunoCreatePayment CALLED (token received)");
            log({ oneTimeTokenPreview: String(oneTimeToken || "").slice(0, 10) + "..." });

            const paymentResp = await createPayment({ oneTimeToken, checkoutSession });
            log({ createPaymentResponse: paymentResp });

            if (paymentResp?.sdk_action_required === true) {
              log("SDK action required -> continuePayment()");
              yuno.continuePayment();
            } else {
              log("No SDK action required (skip continuePayment)");
            }
          } catch (err) {
            log({ createPaymentError: String(err), stack: err?.stack });
          } finally {
            isPaying = false;
            try { yuno.hideLoader(); } catch (_) {}
          }
        },

        yunoPaymentMethodSelected(data) {
          log({ yunoPaymentMethodSelected: data });

          // Habilita o botão somente quando o método selecionado permitir formulário
          // (evita clique cedo demais -> erro de DOM / CVV)
          const ok = !!data?.form_enable;
          setPayEnabled(ok);
          if (!ok) log("Payment method selected but form_enable=false -> keeping Pay disabled");
        },

        yunoPaymentResult(data) {
          log({ yunoPaymentResult: data });
          isPaying = false;
          setPayEnabled(true);
          try { yuno.hideLoader(); } catch (_) {}
        },

        yunoError(error) {
          log({ yunoError: error });
          isPaying = false;

          // Se o erro for o clássico do CVV element, normalmente é clique cedo demais
          // Então: desabilita o botão e pede nova seleção do método
          const errMsg = String(error || "");
          if (errMsg.includes("cvv") && errMsg.includes("doesn't exist")) {
            setPayEnabled(false);
            log("ERROR CVV DOM: clique ocorreu antes do formulário renderizar. Selecione 'Tarjeta' novamente e aguarde 1s antes de clicar.");
          } else {
            setPayEnabled(true);
          }

          try { yuno.hideLoader(); } catch (_) {}
        },
      });

      // 6) Mount (isso foi o que te trouxe "Tarjeta")
      if (typeof yuno.mountCheckout === "function") {
        yuno.mountCheckout();
        log("CHECKOUT READY (mounted)");
      } else {
        log("WARNING: mountCheckout not available");
      }

      // 7) botão pagar
      if (payButton) {
        payButton.addEventListener("click", () => {
          try {
            if (isPaying) return;

            // guarda extra: não deixa clicar se desabilitado
            if (payButton.disabled) {
              log("Pay click ignored: button disabled (form not ready yet).");
              return;
            }

            log("PAY BUTTON CLICK -> yuno.startPayment()");
            yuno.startPayment();
          } catch (e) {
            log({ startPaymentError: String(e) });
          }
        });
        log("Pay button listener attached");
      } else {
        log("WARNING: #button-pay not found");
      }
    } catch (err) {
      __started = false;
      log({ initError: String(err), stack: err?.stack });
    }
  }

  // Boot: tenta iniciar assim que o DOM existir + fallback
  function boot() {
    try {
      initCheckout();
    } catch (e) {
      log({ bootError: String(e) });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  // fallback extra caso o Render/SDK atrase
  setTimeout(() => {
    if (!__started) boot();
  }, 1500);
})();

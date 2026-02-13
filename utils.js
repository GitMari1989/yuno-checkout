exports.getCountryData = function getCountryData(country) {
  let countryData;

  if (country == "CO") {
    // 🔥 CORREÇÃO CRÍTICA:
    // Seu dashboard só tem CARD habilitado para USD.
    // Se usar COP → SDK quebra com "Transacción fallida".
    countryData = {
      documentType: "CC",
      documentNumber: "1032765432",
      currency: "USD",   // ✅ ALTERADO (ANTES ERA COP)
      amount: 50,        // ✅ valor baixo para sandbox (evita antifraude)
    };

  } else if (country == "BR") {
    countryData = {
      documentType: "CPF",
      documentNumber: "35104075397", // melhor sem pontuação
      currency: "BRL",
      amount: 50,
    };

  } else if (country == "AR") {
    countryData = {
      documentType: "PASS",
      documentNumber: "123554332",
      currency: "ARS",
      amount: 50,
    };

  } else if (country == "CL") {
    countryData = {
      documentType: "CI",
      documentNumber: "80209924",
      currency: "CLP",
      amount: 50,
    };

  } else {
    // fallback universal
    countryData = {
      documentType: "PASS",
      documentNumber: "T12345",
      currency: "USD",
      amount: 50,
    };
  }

  return countryData;
};

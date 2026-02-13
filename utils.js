// utils.js
exports.getCountryData = function getCountryData(country) {
  let countryData

  if (country === "CO") {
    // ✅ IMPORTANT: your Yuno account seems to have CARD enabled with Currency = USD
    // so we align the demo session/payment to USD to make "Tarjeta" appear.
    countryData = {
      documentType: "CC",
      documentNumber: "1032765432",
      currency: "USD",
      amount: 2000, // keep same numeric value; adjust if your environment expects other minor units
    }
  } else if (country === "BR") {
    countryData = {
      documentType: "CPF",
      documentNumber: "351.040.753-97",
      currency: "BRL",
      amount: Math.floor(Math.random() * (1000 + 1) + 10),
    }
  } else if (country === "AR") {
    countryData = {
      documentType: "PASS",
      documentNumber: "123554332",
      currency: "ARS",
      amount: Math.floor(Math.random() * (1000 + 1) + 10),
    }
  } else if (country === "CL") {
    countryData = {
      documentType: "CI",
      documentNumber: "80209924",
      currency: "CLP",
      amount: Math.floor(Math.random() * (1000 + 1) + 10),
    }
  } else {
    countryData = {
      documentType: "PASS",
      documentNumber: "T12345",
      currency: "USD",
      amount: Math.floor(Math.random() * (1000 + 1) + 10),
    }
  }

  return countryData
}

/**
 * DigiCert catalogue and list prices.
 * "annual" values are DigiCert's own 12-month subscription prices in USD (OV/EV = one standard domain,
 * WILDCARD_OV = one wildcard domain). The page shows them in BDT as: annual x (1 + markup) x USD/BDT rate.
 * Refreshed daily by scripts/update-digicert-prices.mjs (see .github/workflows/update-digicert-prices.yml).
 */
window.DIGICERT_PRICES = {
  "updated": "2026-10-16",
  "source": "https://www.digicert.com/tls-ssl/tls-ssl-certificates",
  "markup": 0.3,
  "fallbackRate": 123,
  "plans": [
    {
      "id": "basic",
      "name": "Basic",
      "recommended": false,
      "url": "https://www.digicert.com/tls-ssl/basic-tls-ssl-certificates",
      "description": "Complete business-level validation, reinforcing customer confidence in online presence while securing customer data",
      "includes": [
        "Unlimited certificate issuance/replacement",
        "Free ACME automation",
        "24x5 standard support",
        "DigiCert CertCentral management portal"
      ],
      "annual": {
        "OV": 372,
        "EV": 540,
        "WILDCARD_OV": 1164
      }
    },
    {
      "id": "secure-site",
      "name": "Secure Site",
      "recommended": false,
      "url": "https://www.digicert.com/tls-ssl/secure-site-ssl-certificates",
      "description": "Business-level validation with priority validation, management tools and faster issuance",
      "includes": [
        "Basic - {V} benefits, plus",
        "Free ACME automation included",
        "Priority order processing",
        "DigiCert Smart Seal",
        "Domain reputation monitoring",
        "Vulnerability assessment scans"
      ],
      "annual": {
        "OV": 624,
        "EV": 1380,
        "WILDCARD_OV": 2964
      }
    },
    {
      "id": "secure-site-pro",
      "name": "Secure Site Pro",
      "recommended": true,
      "url": "https://www.digicert.com/tls-ssl/secure-site-pro-ssl",
      "description": "Business-level validation, priority validation, and enhanced security for domain and brand protection",
      "includes": [
        "Secure Site - {V} benefits, plus",
        "Free ACME automation",
        "Priority order processing",
        "DigiCert Smart Seal",
        "Domain reputation monitoring",
        "Vulnerability assessment scans",
        "Brand protection (CT log monitoring)"
      ],
      "annual": {
        "OV": 1548,
        "EV": 2244,
        "WILDCARD_OV": 5880
      }
    }
  ]
};

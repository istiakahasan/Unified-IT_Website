/**
 * Comodo / Sectigo SSL certificate catalogue and base prices from Namecheap.
 * Source: https://www.namecheap.com/security/ssl-certificates/
 *
 * Prices in "prices" represent Namecheap retail USD rates per year for 1, 2, 3, 4, and 5-year terms.
 * Display price formula: basePrice * (1 + markup) * exchangeRate (markup is +30%, or 0.30).
 * Refreshed automatically by scripts/update-comodo-prices.mjs.
 */
window.COMODO_PRICES = {
  "updated": "2026-10-17",
  "source": "https://www.namecheap.com/security/ssl-certificates/",
  "markup": 0.3,
  "fallbackRate": 123,
  "plans": [
    {
      "id": "positivessl",
      "name": "PositiveSSL",
      "brand": "Sectigo / Comodo",
      "validation": "DV",
      "validationName": "Domain Validation",
      "type": "single",
      "typeName": "Single Domain",
      "recommended": true,
      "badge": "Most Popular",
      "url": "https://www.namecheap.com/security/ssl-certificates/",
      "description": "Fast and budget-friendly SSL certificate for blogs, portfolios, personal sites, and small businesses.",
      "warranty": 10000,
      "issuanceTime": "15 minutes",
      "domains": "1 Domain (non-www & www)",
      "reissues": "Unlimited free reissues",
      "serverLicenses": "Unlimited",
      "seal": "Static Site Seal",
      "includes": [
        "Domain Validation (DV) issued in 15 minutes",
        "Secures both domain.com and www.domain.com",
        "$10,000 warranty protection",
        "Strong 256-bit encryption / 2048-bit signature",
        "99.9% desktop and mobile browser compatibility",
        "Unlimited free reissues & server licenses"
      ],
      "prices": {
        "1": 11,
        "2": 9.99,
        "3": 9.99,
        "4": 9.99,
        "5": 5.99
      }
    },
    {
      "id": "essentialssl",
      "name": "EssentialSSL",
      "brand": "Sectigo / Comodo",
      "validation": "DV",
      "validationName": "Domain Validation",
      "type": "single",
      "typeName": "Single Domain",
      "recommended": false,
      "badge": "",
      "url": "https://www.namecheap.com/security/ssl-certificates/",
      "description": "Automated domain validation with higher warranty protection for growing websites and active startups.",
      "warranty": 50000,
      "issuanceTime": "15 minutes",
      "domains": "1 Domain (non-www & www)",
      "reissues": "Unlimited free reissues",
      "serverLicenses": "Unlimited",
      "seal": "Static Site Seal",
      "includes": [
        "Rapid automated Domain Validation",
        "Secures domain.com and www.domain.com",
        "$50,000 warranty protection",
        "Up to 256-bit encryption strength",
        "Includes TrustLogo site seal",
        "Unlimited free reissues"
      ],
      "prices": {
        "1": 19.99,
        "2": 18.49,
        "3": 18.49,
        "4": 18.49,
        "5": 15.99
      }
    },
    {
      "id": "positivessl-wildcard",
      "name": "PositiveSSL Wildcard",
      "brand": "Sectigo / Comodo",
      "validation": "DV",
      "validationName": "Domain Validation",
      "type": "wildcard",
      "typeName": "Wildcard",
      "recommended": true,
      "badge": "Best Wildcard Value",
      "url": "https://www.namecheap.com/security/ssl-certificates/",
      "description": "Secure your primary domain and unlimited subdomains (*.yourdomain.com) with a single certificate.",
      "warranty": 10000,
      "issuanceTime": "15 minutes",
      "domains": "Unlimited subdomains (*.domain.com)",
      "reissues": "Unlimited free reissues",
      "serverLicenses": "Unlimited",
      "seal": "Static Site Seal",
      "includes": [
        "Protects unlimited first-level subdomains (*.domain.com)",
        "One certificate for mail, api, shop, and portal",
        "Instant automated domain validation",
        "$10,000 warranty protection",
        "Modern 256-bit encryption",
        "Simplifies administration and renewals"
      ],
      "prices": {
        "1": 89.99,
        "2": 79.99,
        "3": 79.99,
        "4": 79.99,
        "5": 49.99
      }
    },
    {
      "id": "essentialssl-wildcard",
      "name": "EssentialSSL Wildcard",
      "brand": "Sectigo / Comodo",
      "validation": "DV",
      "validationName": "Domain Validation",
      "type": "wildcard",
      "typeName": "Wildcard",
      "recommended": false,
      "badge": "",
      "url": "https://www.namecheap.com/security/ssl-certificates/",
      "description": "Wildcard certificate covering all first-level subdomains with enhanced warranty protection.",
      "warranty": 50000,
      "issuanceTime": "15 minutes",
      "domains": "Unlimited subdomains (*.domain.com)",
      "reissues": "Unlimited free reissues",
      "serverLicenses": "Unlimited",
      "seal": "Static Site Seal",
      "includes": [
        "Unlimited subdomains under your primary domain",
        "$50,000 warranty protection",
        "Automated validation issued in 15 minutes",
        "256-bit encryption & 2048-bit signature key",
        "Unlimited server licensing",
        "Unlimited free reissues"
      ],
      "prices": {
        "1": 109.99,
        "2": 99.99,
        "3": 99.99,
        "4": 99.99,
        "5": 69.99
      }
    },
    {
      "id": "positivessl-multidomain",
      "name": "PositiveSSL Multi-Domain (SAN)",
      "brand": "Sectigo / Comodo",
      "validation": "DV",
      "validationName": "Domain Validation",
      "type": "multidomain",
      "typeName": "Multi-Domain",
      "recommended": true,
      "badge": "Flexible SAN",
      "url": "https://www.namecheap.com/security/ssl-certificates/",
      "description": "Protect multiple distinct domains and hostnames on a single certificate (includes 3 domains, up to 100).",
      "warranty": 10000,
      "issuanceTime": "15 minutes",
      "domains": "3 Domains included (expandable up to 100)",
      "reissues": "Unlimited free reissues",
      "serverLicenses": "Unlimited",
      "seal": "Static Site Seal",
      "includes": [
        "Includes 3 domains / hostnames standard",
        "Expandable up to 100 different domains",
        "Fast Domain Validation for all SANs",
        "$10,000 warranty protection",
        "Centralized multi-domain SSL management",
        "Free reissues and domain updates"
      ],
      "prices": {
        "1": 35.99,
        "2": 32.99,
        "3": 32.99,
        "4": 32.99,
        "5": 19.5
      }
    },
    {
      "id": "instantssl",
      "name": "InstantSSL",
      "brand": "Sectigo / Comodo",
      "validation": "OV",
      "validationName": "Organization Validation",
      "type": "single",
      "typeName": "Single Domain",
      "recommended": false,
      "badge": "Business Verified",
      "url": "https://www.namecheap.com/security/ssl-certificates/",
      "description": "Organization-validated certificate verifying your registered business identity to site visitors.",
      "warranty": 50000,
      "issuanceTime": "1-2 business days",
      "domains": "1 Domain (non-www & www)",
      "reissues": "Unlimited free reissues",
      "serverLicenses": "Unlimited",
      "seal": "Dynamic TrustLogo Seal",
      "includes": [
        "Full business organization verification",
        "Company name visible in certificate details",
        "Dynamic Point-to-Verify TrustLogo seal",
        "$50,000 warranty protection",
        "Ideal for corporate sites and client portals",
        "Enterprise-level encryption assurance"
      ],
      "prices": {
        "1": 39.99,
        "2": 35.99,
        "3": 35.99,
        "4": 35.99,
        "5": 29.99
      }
    },
    {
      "id": "instantssl-pro",
      "name": "InstantSSL Pro",
      "brand": "Sectigo / Comodo",
      "validation": "OV",
      "validationName": "Organization Validation",
      "type": "single",
      "typeName": "Single Domain",
      "recommended": false,
      "badge": "",
      "url": "https://www.namecheap.com/security/ssl-certificates/",
      "description": "Premium organization validation with a substantial $100,000 warranty for commercial websites.",
      "warranty": 100000,
      "issuanceTime": "1-2 business days",
      "domains": "1 Domain (non-www & www)",
      "reissues": "Unlimited free reissues",
      "serverLicenses": "Unlimited",
      "seal": "Dynamic TrustLogo Seal",
      "includes": [
        "Thorough business identity verification",
        "$100,000 warranty protection",
        "Interactive point-to-verify TrustLogo seal",
        "Strong 256-bit AES encryption",
        "Verified organization details in TLS handshake",
        "Priority support and validation"
      ],
      "prices": {
        "1": 59.99,
        "2": 53.99,
        "3": 53.99,
        "4": 53.99,
        "5": 44.99
      }
    },
    {
      "id": "ev-ssl",
      "name": "EV SSL",
      "brand": "Sectigo / Comodo",
      "validation": "EV",
      "validationName": "Extended Validation",
      "type": "single",
      "typeName": "Single Domain",
      "recommended": true,
      "badge": "Maximum Trust",
      "url": "https://www.namecheap.com/security/ssl-certificates/",
      "description": "Extended Validation providing maximum business trust and a $1,000,000 warranty for finance and e-commerce.",
      "warranty": 1000000,
      "issuanceTime": "1-3 business days",
      "domains": "1 Domain (non-www & www)",
      "reissues": "Unlimited free reissues",
      "serverLicenses": "Unlimited",
      "seal": "Dynamic EV TrustLogo Seal",
      "includes": [
        "Strictest Extended Validation vetting standard",
        "Highest level of customer confidence & trust",
        "$1,000,000 warranty protection",
        "Dynamic clickable EV TrustLogo seal",
        "Protects against phishing and impersonation",
        "Designed for banks, fintech, and payment portals"
      ],
      "prices": {
        "1": 76.99,
        "2": 69.99,
        "3": 69.99,
        "4": 69.99,
        "5": 45.99
      }
    },
    {
      "id": "ev-multidomain",
      "name": "EV Multi-Domain SSL",
      "brand": "Sectigo / Comodo",
      "validation": "EV",
      "validationName": "Extended Validation",
      "type": "multidomain",
      "typeName": "Multi-Domain",
      "recommended": false,
      "badge": "Enterprise SAN",
      "url": "https://www.namecheap.com/security/ssl-certificates/",
      "description": "Extended Validation across multiple distinct domains with an enterprise-grade $1,000,000 warranty.",
      "warranty": 1000000,
      "issuanceTime": "1-3 business days",
      "domains": "3 Domains included (expandable up to 250)",
      "reissues": "Unlimited free reissues",
      "serverLicenses": "Unlimited",
      "seal": "Dynamic EV TrustLogo Seal",
      "includes": [
        "EV validation on multiple distinct web properties",
        "3 FQDN domains included standard",
        "$1,000,000 warranty protection",
        "Highest visual verification standards",
        "Streamlines enterprise TLS administration",
        "256-bit encryption across all SAN domains"
      ],
      "prices": {
        "1": 163.99,
        "2": 142.99,
        "3": 142.99,
        "4": 142.99,
        "5": 92.99
      }
    }
  ]
};

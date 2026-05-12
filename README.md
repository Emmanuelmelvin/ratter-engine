# Ratter

> Build locally with production-level simplicity.

Ratter is a local development infrastructure tool that automates HTTPS, DNS resolution, and reverse proxy management for developers. It allows you to run multiple local applications using clean custom domains like:

```txt
app.local
api.local
dashboard.test
admin.dev
```

without manually configuring certificates, editing hosts files repeatedly, or managing complicated proxy setups.

Ratter combines the power of Caddy and Technitium DNS Server into a simplified developer experience.

---

# Features

- Automatic HTTPS for local domains
- Local DNS resolution
- Dynamic reverse proxy routing
- Automatic certificate generation
- Local trusted certificate authority support
- Multi-service support
- Fast startup workflow
- Simple configuration
- Local production-like environments
- Programmatic domain management

---

# Why Ratter?

Traditional local development usually involves:

- Using `localhost:3000`, `localhost:5173`, etc.
- Port conflicts
- Editing the hosts file manually
- Browser HTTPS warnings
- Managing self-signed certificates manually
- Complex reverse proxy configuration

Ratter solves these problems by creating a local networking layer that behaves similarly to real production infrastructure.

---

# How Ratter Works

Ratter works by combining several components together:

```txt
Browser
   ↓
Local DNS Resolution (Technitium)
   ↓
Custom Domain → Local IP
   ↓
Caddy Reverse Proxy
   ↓
Local Application
```

Example:

```txt
https://api.local
        ↓
Resolved by Technitium DNS
        ↓
127.0.0.1
        ↓
Caddy receives request
        ↓
Caddy forwards to localhost:3000
```

---

# Core Dependencies

## 1. Caddy

Ratter uses Caddy as its reverse proxy and HTTPS engine.

Caddy handles:

- HTTPS certificate generation
- TLS management
- Reverse proxying
- HTTP → HTTPS redirects
- Automatic certificate serving

Website:
https://caddyserver.com

---

## 2. Technitium DNS Server

Technitium provides local DNS resolution.

It allows custom local domains like:

```txt
app.local
api.local
test.dev
```

to resolve to your local machine automatically.

Website:
https://technitium.com/dns/

---

## 3. mkcert (Optional)

Used for generating locally trusted development certificates.

Website:
https://github.com/FiloSottile/mkcert

---

# Installation

## Requirements

- Windows / Linux / macOS
- Node.js 18+
- Administrator privileges
- Caddy installed
- Technitium DNS Server installed

---

# Quick Start

## 1. Clone the repository

```bash
git clone https://github.com/yourusername/ratter.git
cd ratter
```

---

## 2. Install dependencies

```bash
npm install
```

---

## 3. Start Technitium DNS

Ensure Technitium DNS Server is running.

Set your system DNS to:

```txt
127.0.0.1
```

---

## 4. Trust Caddy certificates

Run:

```bash
caddy trust
```

This installs Caddy’s local Certificate Authority into your system trust store.

---

## 5. Start Ratter

```bash
npm run dev
```

or

```bash
node server.js
```

---

# Example Configuration

Example routing setup:

```json
{
  "domains": [
    {
      "domain": "api.local",
      "target": "localhost:3000"
    },
    {
      "domain": "dashboard.local",
      "target": "localhost:5173"
    }
  ]
}
```

---

# Example Caddyfile

```caddy
api.local {
    reverse_proxy localhost:3000
}

dashboard.local {
    reverse_proxy localhost:5173
}
```

---

# HTTPS Workflow

When a domain is added:

1. Ratter updates DNS records
2. Technitium resolves the domain locally
3. Caddy generates a local certificate
4. Browser trusts the certificate
5. HTTPS works automatically

Result:

```txt
https://api.local
```

with a valid secure lock icon.

---

# DNS Resolution Flow

```txt
api.local
    ↓
Technitium DNS
    ↓
127.0.0.1
    ↓
Caddy
    ↓
localhost:3000
```

---

# Project Structure

```txt
ratter/
│
├── server/
├── dns/
├── proxy/
├── configs/
├── scripts/
├── public/
├── package.json
└── README.md
```

---

# Planned Features

- GUI dashboard
- One-click setup installer
- Automatic service discovery
- Docker integration
- Network isolation environments
- Team configuration sharing
- Dynamic route management API
- Cross-device local networking
- CLI tools
- Auto-start background services

---

# Use Cases

## Full Stack Development

```txt
frontend.local
api.local
auth.local
```

---

## Microservices

Route multiple services through clean domains.

---

## HTTPS API Testing

Test cookies, OAuth, and secure APIs locally.

---

## Team Environments

Share standardized local setups.

---

# Goals

Ratter aims to:

- Remove local networking complexity
- Make HTTPS effortless
- Create production-like local environments
- Improve developer onboarding
- Reduce local setup time

---

# Security Notes

Ratter is intended for local development environments only.

Do NOT expose local certificates or DNS configurations publicly.

---

# Contributing

Pull requests, issues, and ideas are welcome.

---

# License

MIT License

---

# Inspiration

Ratter is inspired by modern developer tooling that prioritizes simplicity, automation, and production-like local workflows.

---

# Author

Built for developers who want local infrastructure without the headache.
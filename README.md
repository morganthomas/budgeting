# Budget App

A self-hosted personal budgeting application with support for multiple accounts, currencies with exchange rates, budget categories, monthly reports, and JSON export/import.

**Stack:** Node.js + Express + TypeScript (backend), React + Tailwind CSS (frontend), PostgreSQL (database), Caddy (production reverse proxy / SSL).

---

## Table of Contents

1. [Local Development with Docker](#1-local-development-with-docker)
2. [Local Development without Docker](#2-local-development-without-docker)
3. [Production Deployment on DigitalOcean](#3-production-deployment-on-digitalocean)
4. [Updating a Running Deployment](#4-updating-a-running-deployment)
5. [Backup and Restore](#5-backup-and-restore)
6. [Environment Variable Reference](#6-environment-variable-reference)

---

## 1. Local Development with Docker

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)

### Steps

```bash
# Clone the repository
git clone <repo-url>
cd budget

# Build and start all services
docker compose up --build

# The app is now available at:
#   http://localhost:5173   (frontend)
#   http://localhost:3001   (backend API)
```

To stop:

```bash
docker compose down
```

To wipe the database and start fresh:

```bash
docker compose down -v
```

---

## 2. Local Development without Docker

### Prerequisites

- Node.js 20+
- PostgreSQL 16+

### Steps

**Database**

Create a database and user in PostgreSQL:

```sql
CREATE USER budget WITH PASSWORD 'budget_pass';
CREATE DATABASE budget OWNER budget;
```

**Backend**

```bash
cd backend
npm install

# Create a .env file
echo 'DATABASE_URL=postgres://budget:budget_pass@localhost:5432/budget
SESSION_SECRET=dev_secret
PORT=3001
FRONTEND_URL=http://localhost:5173' > .env

npm run dev
```

**Frontend** (in a separate terminal)

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`. The Vite dev server proxies all `/api/*` requests to the backend at `http://localhost:3001`.

---

## 3. Production Deployment on DigitalOcean

### Architecture

```
Internet
    │  HTTPS (443)
    ▼
 Caddy                 ← automatic Let's Encrypt SSL, reverse proxy
    │
    ├── /api/*  ──────► backend (Express, port 3001, internal)
    │
    └── /*  ──────────► frontend (nginx, port 80, internal)
                              │
                         PostgreSQL (port 5432, internal only)
```

Caddy handles SSL certificate issuance and renewal automatically using Let's Encrypt. No manual certificate management is required.

---

### Step 1: Create a Droplet

1. Log in to [DigitalOcean](https://cloud.digitalocean.com) and click **Create → Droplets**.
2. Choose **Ubuntu 24.04 LTS**.
3. Select a plan — **1 GB RAM / 1 vCPU** is sufficient for a personal instance; **2 GB** is recommended for comfort.
4. Add your SSH key under **Authentication**.
5. Click **Create Droplet** and note the public IP address.

---

### Step 2: Point Your Domain to the Droplet

In your domain registrar or DigitalOcean DNS panel, add an **A record**:

| Type | Name | Value |
|------|------|-------|
| A | `budget` (or `@` for root) | `<droplet IP>` |

DNS propagation typically takes a few minutes. Caddy will not be able to obtain an SSL certificate until the DNS record is live and resolving to your server, so confirm this before running the app:

```bash
dig +short budget.example.com
# should return your droplet IP
```

---

### Step 3: Configure the Server

SSH into your Droplet:

```bash
ssh root@<droplet-ip>
```

Install Docker:

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
    https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

Open the firewall:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp   # HTTP/3 (QUIC)
ufw --force enable
```

---

### Step 4: Deploy the Application

Clone the repository onto the server:

```bash
git clone <repo-url> /opt/budget
cd /opt/budget
```

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` and fill in real values:

```bash
nano .env
```

```
DOMAIN=budget.example.com
DB_PASSWORD=<strong random password>
SESSION_SECRET=<strong random secret, 32+ characters>
```

> **Tip:** Generate secrets with `openssl rand -hex 32`.

Build and start the production stack:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy will automatically obtain a Let's Encrypt certificate for your domain on first startup. This usually takes under 30 seconds.

Verify everything is running:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs caddy
```

The app is now available at `https://budget.example.com`.

---

### Step 5: Configure a DigitalOcean Firewall (Optional but Recommended)

For defense in depth, configure a cloud-level firewall in the DigitalOcean control panel:

1. Go to **Networking → Firewalls → Create Firewall**.
2. Add **inbound** rules:
   - SSH (TCP 22) — restricted to your IP if possible
   - HTTP (TCP 80)
   - HTTPS (TCP 443)
   - HTTPS/UDP (UDP 443)
3. Assign the firewall to your Droplet.

---

## 4. Updating a Running Deployment

```bash
cd /opt/budget
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Docker Compose will rebuild only changed images and restart only affected containers. The database volume is preserved.

---

## 5. Backup and Restore

### Application-level (JSON)

Use the built-in **Data** page (`/data`) to export all your data as a JSON file and re-import it on any instance. This is the simplest method for personal use.

### Database-level (pg_dump)

For a full database backup:

```bash
# Backup
docker compose -f docker-compose.prod.yml exec db \
    pg_dump -U budget budget > backup-$(date +%F).sql

# Restore (stops all traffic temporarily)
docker compose -f docker-compose.prod.yml exec -T db \
    psql -U budget budget < backup-2026-06-09.sql
```

To automate daily backups with cron:

```bash
crontab -e
```

Add:

```
0 3 * * * cd /opt/budget && docker compose -f docker-compose.prod.yml exec -T db pg_dump -U budget budget > /opt/budget/backups/backup-$(date +\%F).sql 2>/dev/null
```

---

## 6. Environment Variable Reference

| Variable | Required in prod | Description |
|---|---|---|
| `DOMAIN` | Yes | Fully-qualified domain name, e.g. `budget.example.com`. Used by Caddy for SSL and by the backend for CORS. |
| `DB_PASSWORD` | Yes | Password for the PostgreSQL `budget` user. |
| `SESSION_SECRET` | Yes | Secret used to sign session tokens. Rotate this to invalidate all active sessions. |
| `NODE_ENV` | Set automatically | Set to `production` by `docker-compose.prod.yml`. Enables secure cookies. |
| `PORT` | No | Backend port inside the container. Defaults to `3001`. |
| `FRONTEND_URL` | No | CORS origin. Defaults to `http://localhost:5173`; overridden to `https://$DOMAIN` in production. |

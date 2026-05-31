# 👑 The Sovereign Empire: Zero-to-Launch Guide
### Setup Blueprint for Netcup RS 1000 G12 (AMD EPYC)

This guide takes you from a raw Netcup server to a high-scale, multi-tenant AI engine.

---

## Phase 1: Provisioning the Iron
1. **Login:** Access your [Netcup CCP](https://www.customer-control-panel.de/).
2. **OS Install:** Navigate to **Media** -> **Images** and select **Ubuntu 24.04 LTS (x64)**.
3. **Partitioning:** Use the "Standard" layout (Netcup handles the Hardware RAID).
4. **SSH Keys:** Add your SSH Public Key (from Termux or your laptop) during install to avoid password-based logins.

---

## Phase 2: The "Iron Shield" Hardening
Connect via Termux: `ssh root@your_netcup_ip`

### 1. Basic System Update
```bash
apt update && apt upgrade -y
```

### 2. Configure the Firewall (UFW)
```bash
# Allow only essential traffic
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (for Coolify/SSL)
ufw allow 443/tcp   # HTTPS (for API/WhatsApp)
ufw allow 8000/tcp  # Coolify Dashboard

# Enable
ufw enable
```

### 3. Add Emergency RAM (Swap File)
AMD EPYC is fast, but 8GB RAM can fill up with 100k users. We add 4GB of NVMe-backed swap.
```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab
```

---

## Phase 3: The Command Center (Coolify)
We use **Coolify** to manage our Docker containers, SSL, and GitHub CI/CD.

### 1. Install Coolify (One-Liner)
```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

### 2. Access the Dashboard
Navigate to `http://your_netcup_ip:8000`. Create your admin account immediately.

---

## Phase 4: Deploying the AI Empire
Inside the Coolify Dashboard:

1. **Connect GitHub:** Link your `naija-agent-core` repository.
2. **Create a "Service":** Select "Docker Compose."
3. **Configuration:** 
   * Use our consolidated `docker-compose.yml`.
   * Set the **Build Pack** to "Docker."
   * Add your Environment Variables (GEMINI_API_KEY, WHATSAPP_API_TOKEN, etc.).
4. **Deploy:** Click "Deploy." Coolify will build the **Unified Empire Bundle** and launch the Go Sidecar + API + Workers.

---

## Phase 5: Red Team Security (Crucial)
1. **The Docker Proxy:** Inside Coolify, ensure you are using a Docker Proxy for your workers to protect the `/var/run/docker.sock`.
2. **SSL:** Point your domain (e.g., `api.yourempire.com`) to the server IP. Coolify will automatically provision a **Let's Encrypt** SSL certificate.

---

## Phase 6: Post-Launch Maintenance
*   **Snapshots:** Every week, take a "Snapshot" in the Netcup CCP.
*   **Updates:** Coolify updates itself automatically.
*   **Backups:** Enable Coolify's automated PostgreSQL backup to **Cloudflare R2** (Zero-cost egress).

---
**⚓ "Oga, your Empire is now live on the best iron in Europe."**

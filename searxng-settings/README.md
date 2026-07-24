# Naija Agent Core - SearXNG Configuration (`searxng-settings/`)

Welcome to the configuration directory for **SearXNG**, the privacy-respecting metasearch engine utilized by the Naija Agent ecosystem.

## 🎯 Purpose
Aelixxr and Zynux both rely heavily on real-time web search (e.g., checking JAMB updates, verifying real-time food prices, or confirming merchant policies). Instead of relying directly on the Google Custom Search API (which has strict rate limits, privacy concerns, and costs), the Sovereign Empire deploys its own self-hosted instance of **SearXNG**.

This directory contains the `settings.yml` required to configure the SearXNG Docker container.

## ⚙️ Configuration Details (`settings.yml`)
The `settings.yml` file explicitly defines:
1. **Search Engines:** The specific engines enabled for the agents (e.g., Google, Bing, DuckDuckGo, Wikipedia).
2. **Rate Limiting & Access:** Limits set to prevent abuse while ensuring the local `worker-life`, `worker`, and `hermes-agent` containers have unrestricted internal API access.
3. **Format Output:** Configured to natively return pure JSON format (`&format=json`), which is easily parsed by the LLM tool schemas (like `web_search`) without requiring fragile HTML scraping.

## 🚀 Deployment
SearXNG is deployed alongside the main infrastructure stack via `docker-compose.searxng.yml` or the main compose file. The `searxng-settings/` directory is mapped as a volume directly into the SearXNG container to strictly enforce these settings on boot.

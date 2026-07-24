# @naija-agent/storage

## 1. Overview and Purpose
The `@naija-agent/storage` package provides a unified, multi-cloud storage abstraction and the Aelixxr Sovereign Vault system for the Naija Agent ecosystem. It is designed to handle robust media and document uploads with a high-availability fallback strategy, prioritizing sovereign or low-egress providers. Additionally, it features an intelligent Vault that ingests documents and media, performs forensic multi-modal analysis using AI (Gemini), generates semantic embeddings, and securely stores metadata in PostgreSQL.

## 2. Key Dependencies
- **Cloud Providers & SDKs:**
  - `@aws-sdk/client-s3` & `@aws-sdk/s3-request-presigner` (Used for S3-compatible providers like Cloudflare R2)
  - `@google-cloud/storage` & `firebase-admin` (Firebase infrastructure fallback)
  - `ali-oss` (Alibaba OSS support)
  - `cos-nodejs-sdk-v5` (Tencent COS support)
  - `cloudinary` (High-volume fallback)
- **AI & Data Extraction:**
  - `@google/genai` (For multimodal forensic metadata extraction and semantic embeddings)
- **Database & Persistence:**
  - `@naija-agent/database` & `drizzle-orm` (For managing Vault document records in PostgreSQL)
- **Utilities:**
  - `crypto`, `zod`, `pino` (Logging)

## 3. Core Integrations (Sovereign Vault)
The package implements a resilient "Strategy Selector" pattern for uploads and a deeply integrated intelligent Vault.

### Multi-Cloud Strategy (`upload.ts`)
The system routes file uploads based on an environment-configured priority:
1. **Cloudflare R2** (Zero-egress / High efficiency)
2. **Tencent COS** (Sovereign pivot)
3. **Alibaba OSS**
4. **Cloudinary** (High-volume media fallback)
5. **Firebase Storage** (Ultimate infrastructure fallback)

### Aelixxr Sovereign Vault (`vault/index.ts`)
The Vault is not just a storage system; it acts as a forensic analyst and semantic engine:
- **`ingestDocument`**: Uploads files to the cloud bridge, uses Google Gemini to perform strict forensic examination (e.g., detecting Photoshop artifacts on financial receipts), extracts structured metadata (amounts, dates, references), generates semantic embeddings for the content, and persists this structured data to PostgreSQL via Drizzle ORM.
- **`ingestNote`**: Simplifies textual note ingestion with automated categorization and tagging.
- **Search Capabilities**: Provides direct UUID lookups and full-text tokenized searches across Vault documents.

## 4. Key Modules & Directory Structure
```
packages/storage/
├── package.json
├── src/
│   ├── index.ts               # Package entrypoint exporting vault and upload utilities.
│   ├── interfaces.ts          # Defines the unified `StorageProvider` interface.
│   ├── upload.ts              # The Multi-Cloud strategy selector and fallback logic.
│   ├── providers/             # Concrete StorageProvider implementations.
│   │   ├── alibaba.ts         # Alibaba OSS integration.
│   │   ├── cloudflare.ts      # Cloudflare R2 (S3-compatible) integration.
│   │   └── tencent.ts         # Tencent COS integration.
│   ├── vault/
│   │   └── index.ts           # Core Sovereign Vault logic (Forensic analysis, Gemini embeddings, PostgreSQL persistence).
│   └── utils/                 # General internal utilities (e.g., JSON parsers).
```

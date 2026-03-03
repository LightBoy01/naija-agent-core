# Setup Guide & Resources

## 1. External Accounts Required

### A. Meta for Developers (WhatsApp API)
1.  **Sign Up:** [developers.facebook.com](https://developers.facebook.com/)
2.  **Create App:** Type "Business" -> "Other".
3.  **Add Product:** Select "WhatsApp".
4.  **Get Credentials:**
    *   `Phone Number ID`
    *   `WhatsApp Business Account ID`
    *   `System User Access Token` (Permanent token).
5.  **Configure Webhook:** You will need a public URL (`ngrok`) to verify the webhook.

### B. Google AI Studio (The Brain)
1.  **Sign Up:** [aistudio.google.com](https://aistudio.google.com/)
2.  **Get API Key:** Create a new API key.
3.  **Model:** Ensure you have access to `gemini-1.5-flash`.

### C. Firebase (The Database)
1.  **Console:** [console.firebase.google.com](https://console.firebase.google.com/)
2.  **Project:** Create "NaijaAgent Core".
3.  **Firestore:** Enable Firestore in `europe-west1` (Test Mode).
4.  **Key:** Generate a new Service Account JSON key from Project Settings.

### D. Redis (Queue)
1.  **Local:** Install via `pkg install redis`.
2.  **Production:** Use Upstash or Railway Redis.

## 2. Local Environment Setup

### Environment Variables (.env)
Create a `.env` file in the root:

```ini
# App
PORT=3000
NODE_ENV=development

# Meta / WhatsApp
WHATSAPP_API_TOKEN=your_token
WHATSAPP_PHONE_ID=your_id
WHATSAPP_VERIFY_TOKEN=your_random_string
WHATSAPP_APP_SECRET=your_secret

# Google Gemini
GEMINI_API_KEY=your_key

# Firebase (Client)
FIREBASE_PROJECT_ID=naija-agent-core
NEXT_PUBLIC_FIREBASE_API_KEY=...
# (Add other client vars from the dashboard if needed)
```

### Initializing the Project
1.  **Install:** `npm install`
2.  **Key Setup:** Place your service account key in `packages/firebase/serviceAccountKey.json`.
3.  **Seed:** `cd packages/firebase && npm run seed`
4.  **Build:** `npm run build`
5.  **Dev:** `npm run dev`

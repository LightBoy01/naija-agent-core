# Native Android SMS Bridge (Naija Agent)

## Strategic Objective
Replace the Termux-based Python SMS relay with a native Android application (.apk) to improve reliability, simplify merchant onboarding, and provide a professional background service for bank alert matching.

## Core Features
1. **SMS Listener:** High-priority background service to capture incoming bank alerts.
2. **Alert Matching Engine:** Logic to identify transaction keywords (Amt, Credit, Ref).
3. **API Forwarder:** Securely POSTs filtered alerts to the Sovereign API.
4. **Heartbeat Service:** Informs the Sovereign every 5 minutes that the bridge is alive.
5. **UI Dashboard:** 
   - Connectivity Status (Green/Red).
   - Recent Alerts Log.
   - Setup Wizard (API URL, Bridge Secret).
6. **Battery Optimization:** Requesting whitelisting to prevent Android from killing the relay.

## Tech Stack
- **Language:** Kotlin (Recommended) or Java.
- **Framework:** Native Android (Jetpack Compose for UI).
- **Networking:** Retrofit or OkHttp.
- **Persistence:** Room (for local idempotency and log).

## Implementation Phases

### Phase 1: Foundation (Current)
- [ ] Scaffolding project structure.
- [ ] Defining AndroidManifest permissions (RECEIVE_SMS, READ_SMS, INTERNET).
- [ ] Creating the `SmsReceiver` class.

### Phase 2: Core Logic
- [ ] Implement Regex-based bank alert filtering.
- [ ] Build the Retrofit client for the API.
- [ ] Implement Heartbeat WorkManager.

### Phase 3: UX & Reliability
- [ ] Build the Compose Dashboard.
- [ ] Implement "Persistent Notification" to keep service alive.
- [ ] Add "Test Connection" button.

### Phase 4: Distribution
- [ ] Debug/Release APK signing.
- [ ] Merchant Setup Guide (How to install APK).

## Progress Log
- **2026-03-10:** Initial Blueprint created.

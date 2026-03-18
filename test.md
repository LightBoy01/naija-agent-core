  1. Phase 1: Lead Capture & Referral
   * Trigger: A potential merchant sends a message
     containing I_want_AI_for_my_business_
     (usually via a referral link) to the Master
     Bot.
   * Logic: Handled in
     apps/worker/src/handlers/onboarding.ts
     (Section 1).
   * Action: The Master Bot captures the lead and
     responds with a greeting, asking for the
     business name.

  2. Phase 2: Auto-Ignition (Zero-Touch
  Activation)
   * Trigger: The merchant receives a 6-digit Meta
     registration code and sends it to the Master
     Bot.
   * Logic: Handled in
     apps/worker/src/handlers/onboarding.ts
     (Section 2).
   * Action:
       1. The bot finds the pendingSetup for that
          phone number.
       2. It uses a temporary WhatsAppService to
          register the number with Meta and
          subscribe the WABA.
       3. It calls activateTenant to finalize the
          activation in Firestore.
       4. It notifies the Sovereign Master (Admin)
          of the successful activation.

  3. Phase 3: The #setup State Machine
  Once activated, the merchant (Boss) interacts
  with their own bot to configure it.
   * Trigger: Sending #setup to the new bot.
   * Logic: handleOnboarding.ts manages a
     step-by-step state machine:
       * Greedy Extraction: Uses Gemini Flash-Lite
         to extract multiple details (Name, PIN,
         Bank) from a single long message to speed
         up the process.
       * Step-by-Step: Covers NAME → PIN (bcrypt
         hashed) → BANK_NAME → BANK_ACCOUNT
         (NUBAN/IBAN validated) → TONE
         (Professional/Pidgin/Custom).
       * UX Features: Support for #back (history
         traversal), #cancel, and #reset.

  4. Phase 4: Completion & Transition to Training
   * Trigger: User confirms details with "YES" at
     the REVIEW step.
   * Logic: completeOnboarding is called.
   * Action:
       1. The bot gifts 1,000 AI credits to the
          merchant.
       2. The admin session is automatically
          unlocked for 2 hours.
       3. The bot transitions to Training Mode,
          instructing the Boss to send a photo of
          their price list.

  5. Phase 5: Training (OCR & Staging)
   * Trigger: Boss sends a price list image or
     text ("Coke is 200").
   * Logic: Handled in
     apps/worker/src/handlers/messaging.ts.
   * Action:
       1. Vision Shield: AI analyzes the image,
          identifies it as a price list, and uses
          save_product tool calls to extract
          items.
       2. Staging Area: Extracted items are stored
          in a temporary "Staging" area in
          Firestore (not yet live).
       3. Manager Confirmation (Phase 8.2): The
          bot asks the Boss to verify the
          extracted list.
       4. Commit: If the Boss says "YES",
          commitStagingProducts moves the items to
          the live catalog.

  Key Files Traced:
   * apps/worker/src/handlers/onboarding.ts: Core
     state machine and Auto-Ignition.
   * apps/worker/src/handlers/messaging.ts:
     Transition to Training, Vision OCR, and
     Confirmation logic.
   * packages/firebase/src/: Backend
     implementation for activateTenant,
     completeOnboarding, and staging logic.
   * scripts/test-onboarding-3.ts: The master test
     script verifying this entire chain.

  Would you like to explore the Security/PIN logic
  for admin tasks or the Credit Balance
  implementation next?

// Central System Configuration
export const SystemConfig = {
    // Financial (Kobo)
    COSTS: {
        REPLY_KOBO: 3300, // 33.00 NGN
        IMAGE_PROCESSING_KOBO: 7700, // 77.00 NGN
        DOCUMENT_ANALYSIS_KOBO: 9900, // 99.00 NGN
        VISUAL_TURN_FEE_KOBO: 5000, // 50.00 NGN
        CART_NUDGE_KOBO: 1000, // 10.00 NGN
        TRIAL_BONUS_KOBO: 100000, // 1,000.00 NGN
        STARTING_BONUS_KOBO: 50000, // 500.00 NGN

        // --- AELIXXR (Life OS) Costs ---
        LIFE_CHAT_FREE_TIER: 0,       // Chit-chat is free
        MARKET_PRICE_LOOKUP: 2000,    // 20.00 NGN (Silent Deduct)
        NAFDAC_VERIFICATION: 5000,    // 50.00 NGN (Ask Confirm)
        JAPA_CONSULTATION: 10000,     // 100.00 NGN (Ask Confirm)
    },
    // Timeouts & Limits
    LIMITS: {
        MAX_IMAGES_PER_TURN: 3,
        STAFF_DAILY_MSG_LIMIT: 50,
        MFA_EXPIRY_MINUTES: 5,
        ADMIN_SESSION_HOURS: 2,
        BRIDGE_OFFLINE_GRACE_MINUTES: 15,
        CART_ABANDON_MIN_MINUTES: 30,
        CART_ABANDON_MAX_MINUTES: 120,
    },
    // Models
    MODELS: {
        // --- ZYNUX (Business OS) ---
        // 3 Flash: Balanced for sales conversations & tool calling.
        ZYNUX_PRIMARY: 'gemini-3-flash-preview', 
        // 3.1 Flash-Lite: Cheap, ultra-fast for simple tasks (cron, routing, formatting).
        ZYNUX_WORKER: 'gemini-3.1-flash-lite-preview', 
        ZYNUX_FALLBACK: 'gemini-2.5-flash',

        // --- AELIXXR (Life OS) ---
        // 3.5 Flash: High-reasoning, premium tier for complex personal assistance.
        AELIXXR_PRIMARY: 'gemini-3.5-flash-preview',
        // 3 Flash: Better at handling MCP tools/investigations than Flash-Lite.
        AELIXXR_WORKER: 'gemini-3-flash-preview', 
        AELIXXR_FALLBACK: 'gemini-2.5-flash',

        // --- ROUTER (Gateway) ---
        ROUTER_PRIMARY: 'gemini-3.1-flash-lite-preview',
        ROUTER_FALLBACK: 'gemini-2.5-flash',

        // --- DEEPSEEK (V4) ---
        DEEPSEEK_PRO: 'deepseek-v4-pro',
        DEEPSEEK_FLASH: 'deepseek-v4-flash',

        // Legacy keys to prevent immediate breakage (deprecated)
        DEFAULT: 'gemini-3-flash-preview',
        FALLBACK_L2: 'gemini-2.5-flash',
        FALLBACK_L3: 'gemini-2.5-flash',
    },    // Defaults
    DEFAULTS: {
        TIMEZONE: 'Africa/Lagos',
        CURRENCY: 'NGN',
        LOCALE: 'en-NG',
    },
    // Contacts
    CONTACTS: {
        MASTER_ADMIN_PHONE: '2347042310893', // Sovereign Boss / Developer
        AELIXXR_PHONE_ID_DISPLAY: '2347042310893', // Used for invite generation
    }
} as const;

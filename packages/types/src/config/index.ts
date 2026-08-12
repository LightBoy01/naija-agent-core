// Central System Configuration
export const SystemConfig = {
    // Financial (Kobo)
    COSTS: {
        REPLY_KOBO: 1000, // 10.00 NGN
        TOOL_CALL_KOBO: 3000, // 30.00 NGN
        IMAGE_PROCESSING_KOBO: 5000, // 50.00 NGN
        DOCUMENT_ANALYSIS_KOBO: 5000, // 50.00 NGN
        ADVANCED_TASK_KOBO: 7000, // 70.00 NGN
        CART_NUDGE_KOBO: 1000, // 10.00 NGN
        TRIAL_BONUS_KOBO: 100000, // 1,000.00 NGN (Legacy)
        STARTING_BONUS_KOBO: 10000, // 100.00 NGN (10 Credits setup)

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
        ZYNUX_PRIMARY: 'deepseek-v4-flash',
        ZYNUX_WORKER: 'deepseek-v4-flash',
        ZYNUX_FALLBACK: 'models/gemini-3.1-flash-lite',

        // --- AELIXXR (Life OS) ---
        AELIXXR_PRIMARY: 'deepseek-v4-flash',
        AELIXXR_WORKER: 'deepseek-v4-flash',
        AELIXXR_FALLBACK: 'models/gemini-3.1-flash-lite',

        // --- ROUTER (Gateway) ---
        ROUTER_PRIMARY: 'models/gemini-3-flash-preview',
        ROUTER_FALLBACK: 'models/gemini-3.1-flash-lite',

        // --- DEEPSEEK (V4) ---
        DEEPSEEK_PRO: 'deepseek-v4-pro',
        DEEPSEEK_FLASH: 'deepseek-v4-flash',

        // --- MEDIA / SPECIALIZED (unprefixed — used in direct REST calls) ---
        IMAGE_GEN: 'models/gemini-3.1-flash-image-preview',
        EMBEDDING: 'gemini-embedding-2',
        NANO_EMBEDDING: 'gemini-embedding-2',
        VAULT_EXTRACTION: 'gemini-3.1-flash-lite',
        AELIXXR_WEB_CHAT: 'models/gemini-3.1-flash-lite',

        // Default fallback (used by GeminiProvider when no model specified)
        DEFAULT: 'models/gemini-3.1-flash-lite',
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
    },

    // Sovereign Bot IDs (used for sidecar routing across workers)
    SOVEREIGN_IDS: [
        'aelixxr',
        'zynux',
        'naija-agent-master',
        '2347072139935',
        '2347011925076',
        '1034379023092936'
    ] as readonly string[],
    SOVEREIGN_ID_MAP: {
        '2347072139935': 'aelixxr',
        '2347011925076': 'zynux',
        '1034379023092936': 'naija-agent-master',
    } as const,
} as const;

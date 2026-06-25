import { OnboardingData, FirestoreTimestamp } from '../index.js';

// Core Job Data for BullMQ
export interface JobData {
    id?: string;
    from: string;
    content: {
        text?: string;
        templateName?: string;
        languageCode?: string;
        audioId?: string;
        imageId?: string;
        documentId?: string;
        caption?: string;
        fileName?: string;
        mimeType?: string;
    };
    type: 'text' | 'image' | 'audio' | 'document' | 'template' | 'life-chat';
    orgId: string;
    messageId: string;
    phoneId: string;
    timestamp: number;
    name?: string; // Sender name
    isPinAttempt?: boolean; // Gateway-level PIN detection
    hops?: number; // Infinite loop prevention (Empire Hardening)
}

// Organization Onboarding State
export interface OnboardingConfig {
    step: 'START' | 'NAME' | 'PIN' | 'BANK_NAME' | 'BANK_ACCOUNT' | 'BANK_ACCOUNT_NAME' | 'TONE' | 'CUSTOM_TONE' | 'REVIEW' | 'BOT_PHONE' | 'OTP_WAIT' | 'COMPLETE' | 'NONE';
    data: OnboardingData;
}

// Transaction Data for Logging
export interface TransactionData {
    orgId: string;
    reference: string;
    amount: number; // In Kobo
    status: 'pending' | 'success' | 'failed';
    from?: string; // Payer phone
    verifiedAt?: FirestoreTimestamp;
    confirmedAt?: FirestoreTimestamp;
    smsId?: string;
    extractedBank?: string;
    extractedDate?: string;
    purpose?: string;
    method?: string;
    metadata?: Record<string, unknown>;
}

// Staff Data
export interface StaffData {
    phone: string;
    name: string;
    role: string;
    isActive: boolean;
    updatedAt: FirestoreTimestamp;
}

// Fraud Record
export interface FraudRecord {
    phone: string;
    reason: string;
    reportedAt: FirestoreTimestamp;
}

// Stock Lock (Conversational Commerce)
export interface StockLock {
    id: string; // The ID of the lock document
    productId: string;
    orgId: string;
    userId: string;
    lockedQuantity: number;
    status: 'active' | 'completed' | 'expired';
    expiresAt: FirestoreTimestamp;
    createdAt: FirestoreTimestamp;
}

// Conversation Message
export interface Message {
    role: 'user' | 'model' | 'assistant' | 'system';
    content: string;
    type: 'text' | 'audio' | 'image' | 'document' | 'template';
    timestamp: FirestoreTimestamp;
    metadata?: Record<string, unknown>;
}

// Chat Session
export interface Chat {
    id: string;
    organizationId: string;
    whatsappUserId: string;
    userName?: string;
    summary?: string;
    lastMessageAt?: FirestoreTimestamp;
    isOptedOut?: boolean;
    createdAt?: FirestoreTimestamp;
    updatedAt?: FirestoreTimestamp;
}

// --- AELIXXR (Life OS) Schemas ---

export interface VaultAuditLog {
    id: string;
    userId: string; // Phone number
    toolName: string;
    amountKobo?: number;
    currency?: string;
    direction: 'in' | 'out';
    status: 'success' | 'failed' | 'pending';
    reference?: string; // Transaction reference or internal ID
    metadata?: Record<string, unknown>;
    timestamp: FirestoreTimestamp | Date;
}

export interface LifeContext {
    fullName?: string;
    family?: {
        children?: { name: string; age?: number; school?: string }[];
        spouse?: string;
    };
    health?: {
        allergies?: string[];
        medications?: string[];
    };
    goals?: string[]; // e.g., "Japa by 2027", "Buy land in Lekki"
    preferences?: {
        market?: string; // e.g., "Mile 12"
        diet?: string;
    };
    communicationPreferences?: {
        tone?: 'formal' | 'pidgin' | 'direct';
        length?: 'concise' | 'detailed';
        customRules?: string[]; // e.g. ["Hates being called 'Oga'", "Prefers bullet points"]
    };
    academicProfile?: AcademicProfile; // Added for Student Lifecycle
    lastInteraction?: FirestoreTimestamp | Date;
    lastFeedbackAt?: FirestoreTimestamp | Date; // Rate limiting for feedback tool
    energyCredits?: number; // Added for the Battery/Energy System
    vaultBalanceKobo?: number; // Real Money Ledger for Savings/Bills (in Kobo)
    pin?: string; // Hashed 4-digit PIN for security (legacy name)
    pinHash?: string; // Salted Bcrypt PIN hash
    pinAttempts?: number; // Added for lockout logic
    pinLockUntil?: FirestoreTimestamp | Date; // Added for lockout logic
    sessionStatus?: string; // e.g. 'IDLE', 'AWAITING_PIN'
    sessionExpiry?: FirestoreTimestamp | Date;
    activeAgent?: string;
    hermesSessionId?: string;
}

export interface FeedbackEvent {
    id: string;
    userId: string; // Phone ID
    sessionId: string; // Chat/Session ID
    timestamp: FirestoreTimestamp | Date;
    sentiment: 'positive' | 'negative' | 'neutral';
    feedbackType: 'explicit' | 'implicit';
    userMessage: string; // Redacted/Sanitized
    aiContext?: string; // What the AI did before feedback
    resolved?: boolean;
}

export interface AcademicProfile {
    level: 'SS3' | 'UNDERGRAD' | 'GRADUATE' | 'NYSC';
    school?: string; 
    course?: string; 
    jambScore?: number;
    matricNumber?: string; // Encrypted/Private
    interests: string[]; 
    timeline: {
        nextExam?: FirestoreTimestamp; 
        nextPayment?: FirestoreTimestamp; 
    };
    walletBalance: number; // Linked to Zynux Shared Wallet
}

export interface LifeUserProfile {
    phone: string;
    name?: string;
    academicProfile?: AcademicProfile;
    createdAt: FirestoreTimestamp;
    updatedAt: FirestoreTimestamp;
}

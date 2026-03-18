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
    type: 'text' | 'image' | 'audio' | 'document' | 'template';
    orgId: string;
    messageId: string;
    phoneId: string;
    timestamp: number;
    name?: string; // Sender name
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

import { Job } from 'bullmq';
import { JobData, Organization, StaffData, SectorPack } from '@naija-agent/types';
import { WhatsAppService } from '../services/whatsapp.js';
import { PaymentProvider } from '@naija-agent/payments';
import { AIProvider } from '@naija-agent/ai';
import { Redis } from 'ioredis';

/**
 * The core context that gets passed through the Interceptor chain.
 */
export interface PipelineContext {
  // Required data from the incoming Job
  job: Job<JobData>;
  orgId: string;
  from: string;
  type: string;
  
  // Data populated by Interceptors
  org?: Organization;
  isAdmin?: boolean;
  isStaff?: boolean;
  staffData?: StaffData | null;
  tenantWhatsAppService?: WhatsAppService;
  tenantPaymentProvider?: PaymentProvider | null;
  tenantTools?: any[];
  sectorPack?: SectorPack;
  isLegacy?: boolean;
  
  // System Dependencies
  ai: AIProvider;
  redisClient: Redis;
  globalPaymentProvider: PaymentProvider | null;
  defaultWhatsAppService: WhatsAppService;
  
  // Media archival — populated by MediaInterceptor for downstream handlers
  archivedMediaUrl?: string;
  mediaBuffer?: Buffer;
  mediaMime?: string;
  
  // State Management
  billing: {
    deducted: boolean;
    amount: number;
    rollback: () => Promise<void>;
  };
  
  // If true, the pipeline stops and handleMessage is NOT called.
  shortCircuit: boolean;
  shortCircuitReason?: string;
  
  // Signals if the job should be marked as failed (throws error) or completed successfully (early exit).
  isError?: boolean;
  errorMessage?: string;
}

/**
 * Definition of a single step in the Pipeline.
 */
export interface Interceptor {
  name: string;
  execute: (ctx: PipelineContext) => Promise<PipelineContext>;
}

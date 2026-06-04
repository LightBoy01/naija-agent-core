import { Job } from 'bullmq';
import { Organization } from '@naija-agent/types';
import { AIProvider } from '@naija-agent/ai';

export interface LifePipelineContext {
  // Required data from the incoming Job
  job: Job;
  userPhone: string;
  phoneId?: string;
  orgId?: string;
  message?: string;
  type: string;
  
  // Media Identifiers
  imageId?: string;
  documentId?: string;
  audioId?: string;

  // Data populated by Interceptors
  org: Organization | null;
  lifeContext: any; // User's memory and goals
  energyCredits: number;
  timezone: string;
  localTime: string;
  activeMonitors: any[];
  
  // Accumulated context for the AI prompt
  securitySummary: string;
  ingestionSummary: string;
  mediaBuffer: Buffer | null;
  mediaMime: string | null;

  // System Dependencies
  ai: AIProvider;
  getDynamicModels: (systemInstruction?: string) => Promise<any>;
  lifeQueue: any;
  apiKey: string;
  
  // State Management
  shortCircuit: boolean;
  shortCircuitReason?: string;
  
  // Specialized Aelixxr States
  isDelegated?: boolean;
  isError?: boolean;
  errorMessage?: string;
}

export interface LifeInterceptor {
  name: string;
  execute: (ctx: LifePipelineContext) => Promise<LifePipelineContext>;
}

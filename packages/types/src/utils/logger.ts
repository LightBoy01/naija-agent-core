import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';

export const logger = pino({
  name: 'naija-agent',
  level,
  ...(process.env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});

// Re-export the pino type for consumers
export type { Logger } from 'pino';

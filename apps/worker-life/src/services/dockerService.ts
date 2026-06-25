import axios from 'axios';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

/**
 * DockerService handles the orchestration of ephemeral "on-demand" containers.
 * This allows resource-heavy agents like Hermes to run only when needed.
 */
export class DockerService {
  private socketPath = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
  private apiVersion = '1.43';

  /**
   * Spawns a Hermes container, executes a task, and returns the result.
   */
  async runHermesTask(options: {
    instruction: string;
    userPhone: string;
    orgId: string;
    proxyUrl?: string;
    sectorPack?: string;
    budgetNaira?: number;
    trajectory?: any[];
    stepCount?: number;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    const containerName = `hermes-${options.userPhone.replace('+', '')}-${randomUUID().slice(0, 8)}`;
    
    logger.info({ containerName }, '🐳 [DOCKER] Spawning ephemeral Hermes container...');

    try {
      // 1. Create the container
      // Note: In a real VPS environment, we connect via the Unix socket.
      // For this implementation, we assume the host provides access.
      const createResponse = await axios.post(
        `http://localhost/v${this.apiVersion}/containers/create?name=${containerName}`,
        {
          Image: 'naija-agent/hermes-agent:latest', // Ensure this image is built on the VPS
          Cmd: ['python3', 'cli.py', 'mcp', 'serve', '--on-demand'],
          Env: [
            `INSTRUCTION=${options.instruction}`,
            `USER_PHONE=${options.userPhone}`,
            `ORG_ID=${options.orgId}`,
            `PROXY_URL=${options.proxyUrl || ''}`,
            `SECTOR_PACK=${options.sectorPack || 'ResearchPack'}`,
            `BUDGET=${options.budgetNaira || 500}`,
            `TRAJECTORY=${JSON.stringify(options.trajectory || [])}`,
            `STEP_COUNT=${options.stepCount || 0}`,
            `DATABASE_URL=${process.env.DATABASE_URL}`,
            `GEMINI_API_KEY=${process.env.GEMINI_API_KEY}`
          ],
          HostConfig: {
            AutoRemove: true, // Automatically delete after exit
            NetworkMode: process.env.DOCKER_NETWORK || 'naija-agent-network', // Ensure it can reach Postgres/Redis
          },
        },
        { socketPath: this.socketPath }
      );

      const containerId = createResponse.data.Id;

      // 2. Start the container
      await axios.post(
        `http://localhost/v${this.apiVersion}/containers/${containerId}/start`,
        {},
        { socketPath: this.socketPath }
      );

      logger.info({ containerId }, '✅ [DOCKER] Hermes container started. Waiting for completion...');

      // 3. Wait for the container to exit
      // In a real-world high-scale app, we would use a webhook or polling.
      // For the MVP, we poll the container status.
      let retries = 0;
      const maxRetries = 60; // 5 minutes (5s interval)
      
      while (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        try {
          const inspectResponse = await axios.get(
            `http://localhost/v${this.apiVersion}/containers/${containerId}/json`,
            { socketPath: this.socketPath }
          );
          
          if (!inspectResponse.data.State.Running) {
            const exitCode = inspectResponse.data.State.ExitCode;
            logger.info({ containerId, exitCode }, '🏁 [DOCKER] Hermes container finished.');
            
            // Since AutoRemove is true, the container is gone.
            // We expect Hermes to have written its result to the Database or Redis.
            return { success: exitCode === 0 };
          }
        } catch (e) {
          // If 404, it means AutoRemove already cleaned it up.
          logger.info({ containerId }, '🏁 [DOCKER] Hermes container removed (Completed).');
          return { success: true };
        }
        
        retries++;
      }

      return { success: false, error: 'TIMEOUT' };

    } catch (error: any) {
      logger.error({ 
        error: error.message, 
        status: error.response?.status, 
        data: error.response?.data,
        url: error.config?.url
      }, '❌ [DOCKER] Failed to orchestrate Hermes container');
      return { success: false, error: error.message };
    }
  }
}

export const dockerService = new DockerService();

import { userService } from './userService.js';
import { energyService } from './energyService.js';
import { vaultBalanceService } from './vaultBalanceService.js';
import { memoryService } from './memoryService.js';

/**
 * Facade preserving backward compatibility for all existing imports.
 * All methods delegate to their respective domain services.
 */
export class LifeMemoryService {
  getContext = userService.getContext.bind(userService);
  checkExists = userService.checkExists.bind(userService);
  updateContext = userService.updateContext.bind(userService);
  createReferral = userService.createReferral.bind(userService);
  completeReferral = userService.completeReferral.bind(userService);

  deductEnergy = energyService.deductEnergy.bind(energyService);
  addEnergy = energyService.addEnergy.bind(energyService);

  addVaultBalance = vaultBalanceService.addVaultBalance.bind(vaultBalanceService);
  deductVaultBalance = vaultBalanceService.deductVaultBalance.bind(vaultBalanceService);

  saveEpisodicEvent = memoryService.saveEpisodicEvent.bind(memoryService);
  getRecentEpisodicEvents = memoryService.getRecentEpisodicEvents.bind(memoryService);
  saveSemanticMemory = memoryService.saveSemanticMemory.bind(memoryService);
  searchSemanticMemory = memoryService.searchSemanticMemory.bind(memoryService);
}

export const lifeMemory = new LifeMemoryService();

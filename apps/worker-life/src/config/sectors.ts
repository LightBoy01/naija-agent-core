/**
 * Sector Pack Configuration
 * Defines which tools are accessible to specialized SLM workers.
 */

export interface SectorConfig {
    allowedTools: string[];
}

export const SECTOR_PACKS: Record<string, SectorConfig> = {
    'EducationPack': {
        allowedTools: [
            'generate_quiz',
            'web_search',
            'search_vault',
            'get_vault_file'
        ]
    },
    'ResearchPack': {
        allowedTools: [
            'web_search',
            'fetch_webpage',
            'search_vault',
            'get_vault_file'
        ]
    },
    'LifePack': {
        allowedTools: [
            'search_vault',
            'save_note',
            'delete_from_vault',
            'get_vault_file'
        ]
    },
    'CommercePack': {
        allowedTools: [
            'web_search'
        ]
    }
};

/**
 * Default configuration if a sector is not found.
 */
export const DEFAULT_SECTOR_CONFIG: SectorConfig = {
    allowedTools: ['web_search'] // Minimal safe default
};

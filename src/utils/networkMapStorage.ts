import { NetworkMapPreferences, NetworkMapTemplate, STORAGE_KEYS } from '../types/networkMap';
import { DEFAULT_TEMPLATES, getDefaultOverviewTemplate } from './networkMapTemplates';

/**
 * LocalStorage utility for Network Map preferences and templates
 */

/**
 * Get initial default preferences
 */
function getDefaultPreferences(): NetworkMapPreferences {
  const defaultTemplate = getDefaultOverviewTemplate();
  return {
    activeTemplateId: defaultTemplate.id,
    lastUsed: {
      layout: defaultTemplate.layout,
      filters: defaultTemplate.filters,
      visualization: defaultTemplate.visualization,
    },
    customTemplates: [],
  };
}

/**
 * Save user preferences to localStorage
 */
export function savePreferences(preferences: NetworkMapPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(preferences));
  } catch (error) {
    console.error('Failed to save network map preferences:', error);
  }
}

/**
 * Load user preferences from localStorage
 */
export function loadPreferences(): NetworkMapPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
    if (!stored) {
      return getDefaultPreferences();
    }

    const parsed = JSON.parse(stored) as NetworkMapPreferences;

    // Validate structure
    if (!parsed.lastUsed || !parsed.lastUsed.layout || !parsed.lastUsed.filters) {
      return getDefaultPreferences();
    }

    return parsed;
  } catch (error) {
    console.error('Failed to load network map preferences:', error);
    return getDefaultPreferences();
  }
}

/**
 * Save custom templates to localStorage
 */
export function saveCustomTemplates(templates: NetworkMapTemplate[]): void {
  try {
    // Only save custom templates (not default ones)
    const customOnly = templates.filter(t => !t.isDefault);
    localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(customOnly));
  } catch (error) {
    console.error('Failed to save custom templates:', error);
  }
}

/**
 * Load all templates (default + custom)
 */
export function loadAllTemplates(): NetworkMapTemplate[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
    if (!stored) {
      return [...DEFAULT_TEMPLATES];
    }

    const customTemplates = JSON.parse(stored) as NetworkMapTemplate[];

    // Merge default templates with custom ones
    return [...DEFAULT_TEMPLATES, ...customTemplates];
  } catch (error) {
    console.error('Failed to load templates:', error);
    return [...DEFAULT_TEMPLATES];
  }
}

/**
 * Save a single custom template
 */
export function saveCustomTemplate(template: NetworkMapTemplate): void {
  try {
    const allTemplates = loadAllTemplates();
    const customTemplates = allTemplates.filter(t => !t.isDefault);

    // Check if template already exists (update) or is new (add)
    const existingIndex = customTemplates.findIndex(t => t.id === template.id);
    if (existingIndex >= 0) {
      customTemplates[existingIndex] = {
        ...template,
        updatedAt: new Date().toISOString(),
      };
    } else {
      customTemplates.push(template);
    }

    saveCustomTemplates(customTemplates);
  } catch (error) {
    console.error('Failed to save custom template:', error);
  }
}

/**
 * Delete a custom template
 */
export function deleteCustomTemplate(templateId: string): void {
  try {
    const allTemplates = loadAllTemplates();
    const customTemplates = allTemplates.filter(
      t => !t.isDefault && t.id !== templateId
    );
    saveCustomTemplates(customTemplates);
  } catch (error) {
    console.error('Failed to delete custom template:', error);
  }
}

/**
 * Get a specific template by ID
 */
export function getTemplateById(templateId: string): NetworkMapTemplate | undefined {
  const allTemplates = loadAllTemplates();
  return allTemplates.find(t => t.id === templateId);
}

/**
 * Clear all preferences and custom templates
 */
export function clearAllPreferences(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.PREFERENCES);
    localStorage.removeItem(STORAGE_KEYS.TEMPLATES);
  } catch (error) {
    console.error('Failed to clear preferences:', error);
  }
}

/**
 * Export templates as JSON string
 */
export function exportTemplates(templateIds?: string[]): string {
  const allTemplates = loadAllTemplates();
  const toExport = templateIds
    ? allTemplates.filter(t => templateIds.includes(t.id))
    : allTemplates.filter(t => !t.isDefault); // Export only custom by default

  return JSON.stringify(toExport, null, 2);
}

/**
 * Import templates from JSON string
 */
export function importTemplates(jsonString: string): { success: boolean; count: number; error?: string } {
  try {
    const imported = JSON.parse(jsonString) as NetworkMapTemplate[];

    if (!Array.isArray(imported)) {
      return { success: false, count: 0, error: 'Invalid format: expected array' };
    }

    // Validate each template has required fields
    const valid = imported.every(t =>
      t.id && t.name && t.layout && t.filters && t.visualization
    );

    if (!valid) {
      return { success: false, count: 0, error: 'Invalid template structure' };
    }

    // Mark all imported as custom templates
    const customImported = imported.map(t => ({
      ...t,
      isDefault: false,
      createdAt: t.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    // Merge with existing custom templates
    const existing = loadAllTemplates().filter(t => !t.isDefault);
    const merged = [...existing];

    customImported.forEach(importedTemplate => {
      const existingIndex = merged.findIndex(t => t.id === importedTemplate.id);
      if (existingIndex >= 0) {
        // Update existing
        merged[existingIndex] = importedTemplate;
      } else {
        // Add new
        merged.push(importedTemplate);
      }
    });

    saveCustomTemplates(merged);

    return { success: true, count: customImported.length };
  } catch (error) {
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check if localStorage is available
 */
export function isLocalStorageAvailable(): boolean {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

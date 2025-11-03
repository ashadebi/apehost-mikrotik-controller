import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  NetworkMapTemplate,
  NetworkMapPreferences,
  LayoutConfig,
  FilterPreferences,
  VisualizationOptions,
} from '../types/networkMap';
import {
  loadPreferences,
  savePreferences,
  loadAllTemplates,
  saveCustomTemplate,
  deleteCustomTemplate as deleteTemplateFromStorage,
  getTemplateById,
} from '../utils/networkMapStorage';
import { createCustomTemplate } from '../utils/networkMapTemplates';

interface UseNetworkMapPreferencesReturn {
  // Current state
  currentTemplate: NetworkMapTemplate | null;
  preferences: NetworkMapPreferences;
  layoutConfig: LayoutConfig;
  filters: FilterPreferences;
  visualization: VisualizationOptions;
  allTemplates: NetworkMapTemplate[];

  // Template operations
  applyTemplate: (templateId: string) => void;
  saveAsTemplate: (name: string, description: string) => void;
  deleteTemplate: (templateId: string) => void;
  refreshTemplates: () => void;

  // Setting updates
  setLayoutConfig: (layout: LayoutConfig) => void;
  setFilters: (filters: FilterPreferences) => void;
  setVisualization: (visualization: VisualizationOptions) => void;

  // Utility
  resetToDefaults: () => void;
}

/**
 * Custom hook for managing network map preferences and templates
 */
export function useNetworkMapPreferences(): UseNetworkMapPreferencesReturn {
  const [preferences, setPreferences] = useState<NetworkMapPreferences>(() => loadPreferences());
  const [allTemplates, setAllTemplates] = useState<NetworkMapTemplate[]>(() => loadAllTemplates());

  // Derived current template
  const currentTemplate = useMemo(() => {
    if (!preferences.activeTemplateId) return null;
    return getTemplateById(preferences.activeTemplateId) || null;
  }, [preferences.activeTemplateId]);

  // Extract current settings from preferences
  const layoutConfig = preferences.lastUsed.layout;
  const filters = preferences.lastUsed.filters;
  const visualization = preferences.lastUsed.visualization;

  // Auto-save preferences to localStorage whenever they change
  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  /**
   * Apply a template by ID
   */
  const applyTemplate = useCallback((templateId: string) => {
    const template = getTemplateById(templateId);
    if (!template) {
      console.error(`Template not found: ${templateId}`);
      return;
    }

    setPreferences(prev => ({
      ...prev,
      activeTemplateId: template.id,
      lastUsed: {
        layout: template.layout,
        filters: template.filters,
        visualization: template.visualization,
      },
    }));
  }, []);

  /**
   * Save current settings as a new custom template
   */
  const saveAsTemplate = useCallback((name: string, description: string) => {
    const newTemplate = createCustomTemplate(name, description, {
      layout: layoutConfig,
      filters,
      visualization,
    });

    saveCustomTemplate(newTemplate);

    // Refresh templates list
    setAllTemplates(loadAllTemplates());

    // Switch to the newly created template
    setPreferences(prev => ({
      ...prev,
      activeTemplateId: newTemplate.id,
    }));
  }, [layoutConfig, filters, visualization]);

  /**
   * Delete a custom template
   */
  const deleteTemplate = useCallback((templateId: string) => {
    deleteTemplateFromStorage(templateId);

    // Refresh templates list
    setAllTemplates(loadAllTemplates());

    // If we deleted the active template, switch to default
    if (preferences.activeTemplateId === templateId) {
      const defaultTemplate = allTemplates.find(t => t.isDefault);
      if (defaultTemplate) {
        applyTemplate(defaultTemplate.id);
      }
    }
  }, [preferences.activeTemplateId, allTemplates, applyTemplate]);

  /**
   * Refresh templates from storage
   */
  const refreshTemplates = useCallback(() => {
    setAllTemplates(loadAllTemplates());
  }, []);

  /**
   * Update layout configuration
   */
  const setLayoutConfig = useCallback((layout: LayoutConfig) => {
    setPreferences(prev => ({
      ...prev,
      activeTemplateId: null, // Clear active template when manually changing
      lastUsed: {
        ...prev.lastUsed,
        layout,
      },
    }));
  }, []);

  /**
   * Update filter preferences
   */
  const setFilters = useCallback((newFilters: FilterPreferences) => {
    setPreferences(prev => ({
      ...prev,
      activeTemplateId: null, // Clear active template when manually changing
      lastUsed: {
        ...prev.lastUsed,
        filters: newFilters,
      },
    }));
  }, []);

  /**
   * Update visualization options
   */
  const setVisualization = useCallback((newVisualization: VisualizationOptions) => {
    setPreferences(prev => ({
      ...prev,
      activeTemplateId: null, // Clear active template when manually changing
      lastUsed: {
        ...prev.lastUsed,
        visualization: newVisualization,
      },
    }));
  }, []);

  /**
   * Reset to default preferences
   */
  const resetToDefaults = useCallback(() => {
    const defaultPrefs = loadPreferences();
    setPreferences(defaultPrefs);
  }, []);

  return {
    currentTemplate,
    preferences,
    layoutConfig,
    filters,
    visualization,
    allTemplates,
    applyTemplate,
    saveAsTemplate,
    deleteTemplate,
    refreshTemplates,
    setLayoutConfig,
    setFilters,
    setVisualization,
    resetToDefaults,
  };
}

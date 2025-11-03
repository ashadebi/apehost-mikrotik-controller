import { LayoutType } from '../utils/networkLayouts';

/**
 * Layout configuration with dynamic parameters
 */
export interface LayoutConfig {
  type: LayoutType;
  spacing: number; // 100-300px
  nodeSize: 'compact' | 'normal' | 'detailed';
  // Force-directed specific
  forceStrength?: number; // -500 to -1500
  // Radial specific
  radialRadii?: {
    interface: number; // 250-400px
    host: number; // 450-700px
  };
  // Grid specific
  gridColumns?: number; // auto-calculated if not set
}

/**
 * Filter preferences for network visibility
 */
export interface FilterPreferences {
  showActiveInterfaces: boolean;
  showInactiveInterfaces: boolean;
  showDetailedInfo: boolean;
  hideHostless: boolean; // Hide interfaces with no connected hosts
}

/**
 * Visualization display options
 */
export interface VisualizationOptions {
  colorScheme: 'default' | 'status' | 'traffic';
  edgeStyle: 'solid' | 'curved' | 'orthogonal';
  showLabels: boolean;
  groupBridges: boolean; // Visual grouping of bridge members
  showLegend: boolean;
}

/**
 * Complete network map template
 */
export interface NetworkMapTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide-react icon name
  isDefault: boolean; // Whether this is a system default template
  layout: LayoutConfig;
  filters: FilterPreferences;
  visualization: VisualizationOptions;
  createdAt: string;
  updatedAt: string;
}

/**
 * User preferences (current state without template metadata)
 */
export interface NetworkMapPreferences {
  activeTemplateId: string | null;
  lastUsed: {
    layout: LayoutConfig;
    filters: FilterPreferences;
    visualization: VisualizationOptions;
  };
  customTemplates: NetworkMapTemplate[];
}

/**
 * Storage keys for localStorage
 */
export const STORAGE_KEYS = {
  PREFERENCES: 'networkmap_preferences',
  TEMPLATES: 'networkmap_templates',
  ACTIVE_TEMPLATE: 'networkmap_active_template',
} as const;

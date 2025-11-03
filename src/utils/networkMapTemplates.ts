import { NetworkMapTemplate } from '../types/networkMap';
import { TEMPLATE_ICONS } from './networkMapConstants';

/**
 * Default Network Map Templates
 * Pre-configured views for common network visualization scenarios
 */

export const DEFAULT_TEMPLATES: NetworkMapTemplate[] = [
  {
    id: 'default-overview',
    name: 'Overview',
    description: 'Quick topology overview with active interfaces in concentric layout',
    icon: TEMPLATE_ICONS.OVERVIEW,
    isDefault: true,
    layout: {
      type: 'radial',
      spacing: 150,
      nodeSize: 'compact',
      radialRadii: {
        interface: 300,
        host: 500,
      },
    },
    filters: {
      showActiveInterfaces: true,
      showInactiveInterfaces: false,
      showDetailedInfo: false,
      hideHostless: true,
    },
    visualization: {
      colorScheme: 'default',
      edgeStyle: 'curved',
      showLabels: true,
      groupBridges: false,
      showLegend: true,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'default-detailed',
    name: 'Detailed Analysis',
    description: 'Comprehensive view with all details for deep investigation',
    icon: TEMPLATE_ICONS.DETAILED,
    isDefault: true,
    layout: {
      type: 'hierarchical',
      spacing: 180,
      nodeSize: 'detailed',
    },
    filters: {
      showActiveInterfaces: true,
      showInactiveInterfaces: true,
      showDetailedInfo: true,
      hideHostless: false,
    },
    visualization: {
      colorScheme: 'status',
      edgeStyle: 'curved',
      showLabels: true,
      groupBridges: true,
      showLegend: true,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'default-monitor',
    name: 'Production Monitor',
    description: 'Real-time monitoring view with status-based coloring',
    icon: TEMPLATE_ICONS.MONITOR,
    isDefault: true,
    layout: {
      type: 'force',
      spacing: 150,
      nodeSize: 'normal',
      forceStrength: -1000,
    },
    filters: {
      showActiveInterfaces: true,
      showInactiveInterfaces: false,
      showDetailedInfo: false,
      hideHostless: true,
    },
    visualization: {
      colorScheme: 'status',
      edgeStyle: 'solid',
      showLabels: true,
      groupBridges: false,
      showLegend: true,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'default-troubleshoot',
    name: 'Troubleshooting',
    description: 'Grid layout showing all interfaces with inactive devices highlighted',
    icon: TEMPLATE_ICONS.TROUBLESHOOT,
    isDefault: true,
    layout: {
      type: 'grid',
      spacing: 200,
      nodeSize: 'normal',
      gridColumns: 5,
    },
    filters: {
      showActiveInterfaces: true,
      showInactiveInterfaces: true,
      showDetailedInfo: true,
      hideHostless: false,
    },
    visualization: {
      colorScheme: 'status',
      edgeStyle: 'solid',
      showLabels: true,
      groupBridges: false,
      showLegend: true,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'default-presentation',
    name: 'Presentation Mode',
    description: 'Clean, professional view ideal for demos and screenshots',
    icon: TEMPLATE_ICONS.PRESENTATION,
    isDefault: true,
    layout: {
      type: 'radial',
      spacing: 180,
      nodeSize: 'normal',
      radialRadii: {
        interface: 320,
        host: 540,
      },
    },
    filters: {
      showActiveInterfaces: true,
      showInactiveInterfaces: false,
      showDetailedInfo: false,
      hideHostless: true,
    },
    visualization: {
      colorScheme: 'default',
      edgeStyle: 'curved',
      showLabels: true,
      groupBridges: false,
      showLegend: false,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'default-bridge-focus',
    name: 'Bridge Focus',
    description: 'Hierarchical view optimized for switch configuration and bridge management',
    icon: TEMPLATE_ICONS.BRIDGE_FOCUS,
    isDefault: true,
    layout: {
      type: 'hierarchical',
      spacing: 160,
      nodeSize: 'detailed',
    },
    filters: {
      showActiveInterfaces: true,
      showInactiveInterfaces: true,
      showDetailedInfo: true,
      hideHostless: false,
    },
    visualization: {
      colorScheme: 'default',
      edgeStyle: 'orthogonal',
      showLabels: true,
      groupBridges: true,
      showLegend: true,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/**
 * Get default template by ID
 */
export function getDefaultTemplate(id: string): NetworkMapTemplate | undefined {
  return DEFAULT_TEMPLATES.find(t => t.id === id);
}

/**
 * Get all default templates
 */
export function getAllDefaultTemplates(): NetworkMapTemplate[] {
  return [...DEFAULT_TEMPLATES];
}

/**
 * Get the default overview template (first load)
 */
export function getDefaultOverviewTemplate(): NetworkMapTemplate {
  return DEFAULT_TEMPLATES[0];
}

/**
 * Create a new custom template from current settings
 */
export function createCustomTemplate(
  name: string,
  description: string,
  currentSettings: Omit<NetworkMapTemplate, 'id' | 'name' | 'description' | 'icon' | 'isDefault' | 'createdAt' | 'updatedAt'>
): NetworkMapTemplate {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    description,
    icon: 'Settings', // Default icon for custom templates
    isDefault: false,
    ...currentSettings,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

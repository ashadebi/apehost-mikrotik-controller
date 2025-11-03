/**
 * Network Map Constants
 * Centralizes all hardcoded values for easy configuration and maintenance
 */

// API Configuration
export const API_CONFIG = {
  REFRESH_INTERVAL: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 2000, // 2 seconds
} as const;

// Node Dimensions (width in pixels)
export const NODE_DIMENSIONS = {
  ROUTER: {
    compact: 160,
    normal: 180,
    detailed: 200,
  },
  BRIDGE: {
    compact: 140,
    normal: 160,
    detailed: 180,
  },
  INTERFACE: {
    compact: 120,
    normal: 140,
    detailed: 160,
  },
  HOST: {
    compact: 100,
    normal: 120,
    detailed: 140,
  },
  BRIDGE_PORT: {
    compact: 100,
    normal: 120,
    detailed: 140,
  },
} as const;

// Layout Algorithm Defaults
export const LAYOUT_DEFAULTS = {
  FORCE: {
    spacing: 150,
    chargeStrength: -1000,
    linkDistance: 150,
    collisionRadius: 80,
    simulationTicks: 300,
    centerStrength: 0.1,
  },
  RADIAL: {
    spacing: 150,
    interfaceRadius: 300,
    hostRadius: 500,
    minAngularSpacing: 30, // pixels between nodes
    arcSpread: Math.PI / 3, // 60 degrees per interface for hosts
  },
  HIERARCHICAL: {
    spacing: 150,
    nodeHeight: 100,
    rankSeparation: 150,
    nodeSeparation: 100,
    marginX: 50,
    marginY: 50,
  },
  GRID: {
    spacing: 200,
    hostSpacing: 160, // Denser for hosts
    columnsMultiplier: 1.5, // For aspect ratio calculation
  },
} as const;

// Visual Styling
export const VISUAL_STYLES = {
  BORDER_WIDTH: {
    router: 3,
    bridge: 3,
    interface: 2,
    bridgePort: 2,
    host: 1,
  },
  EDGE_WIDTH: {
    routerToBridge: 4,
    routerToInterface: 2,
    bridgeToMember: 3,
    interfaceToHost: 2,
  },
  FONT_SIZE: {
    nodeTitle: 13,
    nodeSubtitle: 11,
    nodeInfo: 10,
    hostStatus: 9,
    statusBadge: 10,
  },
  PADDING: {
    router: 16,
    bridge: 14,
    interface: 12,
    bridgePort: 10,
    host: 8,
  },
  HOVER_SCALE: 1.05,
  MAC_TRUNCATE_LENGTH: 17,
  DASH_PATTERN: '5,5', // For bridge member edges
} as const;

// Performance Settings
export const PERFORMANCE = {
  LARGE_NETWORK_THRESHOLD: 50, // nodes
  VERY_LARGE_NETWORK_THRESHOLD: 100, // nodes
  DEBOUNCE_DELAY: 300, // ms for filter changes
  ANIMATION_ENABLED_MAX_NODES: 30, // Disable animations above this
} as const;

// ARP Status Configuration
export const ARP_STATUS = {
  VALID_STATUSES: ['reachable', 'stale', 'delay'] as const,
  COLOR_MAP: {
    reachable: 'var(--color-accent-success)', // Green
    stale: 'var(--color-accent-primary)', // Orange
    delay: '#f59e0b', // Yellow
    down: 'var(--color-accent-error)', // Red
  },
} as const;

// Dynamic Scaling Functions
export const DYNAMIC_SCALING = {
  /**
   * Calculate optimal force strength based on network size
   */
  getForceStrength: (nodeCount: number): number => {
    if (nodeCount < 10) return -500;
    if (nodeCount < 50) return -1000;
    return -1500;
  },

  /**
   * Calculate optimal radii for radial layout
   */
  getRadialRadii: (interfaceCount: number, hostCount: number) => {
    const interfaceRadius = Math.max(250, Math.min(400, 200 + interfaceCount * 10));
    const hostRadius = Math.max(450, Math.min(700, interfaceRadius + 200 + hostCount * 5));
    return { interface: interfaceRadius, host: hostRadius };
  },

  /**
   * Calculate optimal grid columns
   */
  getGridColumns: (nodeCount: number, aspectRatio: number = 1.5): number => {
    return Math.ceil(Math.sqrt(nodeCount * aspectRatio));
  },

  /**
   * Calculate simulation ticks based on complexity
   */
  getSimulationTicks: (nodeCount: number): number => {
    return Math.min(500, 200 + nodeCount * 2);
  },

  /**
   * Get collision radius based on node type
   */
  getCollisionRadius: (nodeType: 'router' | 'interface' | 'bridge' | 'host'): number => {
    const map = { router: 100, bridge: 85, interface: 70, host: 50 };
    return map[nodeType];
  },
} as const;

// Template Icons (lucide-react icon names)
export const TEMPLATE_ICONS = {
  OVERVIEW: 'Eye',
  DETAILED: 'Search',
  MONITOR: 'Activity',
  TROUBLESHOOT: 'AlertCircle',
  PRESENTATION: 'Presentation',
  BRIDGE_FOCUS: 'GitBranch',
} as const;

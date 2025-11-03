import { Node, Edge } from 'reactflow';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import dagre from 'dagre';
import { LAYOUT_DEFAULTS, DYNAMIC_SCALING } from './networkMapConstants';

export type LayoutType = 'force' | 'hierarchical' | 'radial' | 'grid';

interface LayoutOptions {
  width?: number;
  height?: number;
  spacing?: number;
  forceStrength?: number;
  interfaceRadius?: number;
  hostRadius?: number;
}

/**
 * Force-Directed Layout using D3-Force
 * Nodes repel each other, edges act like springs
 * Creates natural, organic layouts
 */
export function forceDirectedLayout(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] {
  const {
    width = 1200,
    height = 800,
    forceStrength = DYNAMIC_SCALING.getForceStrength(nodes.length)
  } = options;

  // Create a deep copy to avoid mutations
  const simulationNodes = nodes.map((node) => ({
    ...node,
    x: node.position.x,
    y: node.position.y,
  }));

  const simulationLinks = edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
  }));

  // Calculate dynamic parameters based on network size
  const collisionRadius = nodes.reduce<number>((max, node) => {
    if (node.id === 'router') return Math.max(max, DYNAMIC_SCALING.getCollisionRadius('router'));
    if (node.id.startsWith('interface-')) return Math.max(max, DYNAMIC_SCALING.getCollisionRadius('interface'));
    if (node.id.startsWith('host-')) return Math.max(max, DYNAMIC_SCALING.getCollisionRadius('host'));
    return max;
  }, LAYOUT_DEFAULTS.FORCE.collisionRadius);

  const simulationTicks = DYNAMIC_SCALING.getSimulationTicks(nodes.length);

  // Create force simulation with dynamic parameters
  const simulation = forceSimulation(simulationNodes as any)
    .force(
      'link',
      forceLink(simulationLinks)
        .id((d: any) => d.id)
        .distance(LAYOUT_DEFAULTS.FORCE.linkDistance)
        .strength(1)
    )
    .force('charge', forceManyBody().strength(forceStrength))
    .force('center', forceCenter(width / 2, height / 2).strength(LAYOUT_DEFAULTS.FORCE.centerStrength))
    .force('collision', forceCollide().radius(collisionRadius))
    .stop();

  // Run simulation synchronously with dynamic tick count
  for (let i = 0; i < simulationTicks; i++) {
    simulation.tick();
  }

  // Update node positions
  return nodes.map((node) => {
    const simNode = simulationNodes.find((n) => n.id === node.id);
    return {
      ...node,
      position: {
        x: simNode?.x || node.position.x,
        y: simNode?.y || node.position.y,
      },
    };
  });
}

/**
 * Hierarchical Tree Layout using Dagre
 * Organized in layers based on network hierarchy
 * Router → Interfaces → Hosts
 */
export function hierarchicalLayout(
  nodes: Node[],
  edges: Edge[],
  _options: LayoutOptions = {}
): Node[] {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Configure layout direction and spacing with constants
  dagreGraph.setGraph({
    rankdir: 'TB', // Top to Bottom
    nodesep: LAYOUT_DEFAULTS.HIERARCHICAL.nodeSeparation,
    ranksep: LAYOUT_DEFAULTS.HIERARCHICAL.rankSeparation,
    marginx: LAYOUT_DEFAULTS.HIERARCHICAL.marginX,
    marginy: LAYOUT_DEFAULTS.HIERARCHICAL.marginY,
  });

  // Add nodes to dagre graph
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: node.style?.width || 180,
      height: LAYOUT_DEFAULTS.HIERARCHICAL.nodeHeight,
    });
  });

  // Add edges to dagre graph
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Calculate layout
  dagre.layout(dagreGraph);

  // Update node positions
  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const nodeWidth = typeof node.style?.width === 'number' ? node.style.width : 180;
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - 50,
      },
    };
  });
}

/**
 * Improved Radial Layout
 * Concentric circles based on node type/hierarchy
 * Router center → Interfaces ring → Hosts outer ring
 */
export function radialLayout(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] {
  const { width = 1200, height = 800 } = options;
  const centerX = width / 2;
  const centerY = height / 2;

  // Categorize nodes by type
  const routerNodes = nodes.filter((n) => n.id === 'router');
  const interfaceNodes = nodes.filter((n) => n.id.startsWith('interface-'));
  const hostNodes = nodes.filter((n) => n.id.startsWith('host-'));

  // Calculate dynamic radii based on network size
  const radii = options.interfaceRadius && options.hostRadius
    ? { interface: options.interfaceRadius, host: options.hostRadius }
    : DYNAMIC_SCALING.getRadialRadii(interfaceNodes.length, hostNodes.length);

  const updatedNodes: Node[] = [];

  // Router at center
  routerNodes.forEach((node) => {
    updatedNodes.push({
      ...node,
      position: { x: centerX - 90, y: centerY - 50 },
    });
  });

  // Interfaces in first ring with dynamic radius
  const interfaceRadius = radii.interface;
  const interfaceAngleStep = (2 * Math.PI) / Math.max(interfaceNodes.length, 1);

  interfaceNodes.forEach((node, index) => {
    const angle = index * interfaceAngleStep;
    updatedNodes.push({
      ...node,
      position: {
        x: centerX + interfaceRadius * Math.cos(angle) - 70,
        y: centerY + interfaceRadius * Math.sin(angle) - 50,
      },
    });
  });

  // Hosts in outer ring with dynamic radius, grouped by interface
  const hostRadius = radii.host;
  const hostsPerInterface = new Map<string, Node[]>();

  // Group hosts by their connected interface
  hostNodes.forEach((host) => {
    const connectedEdge = edges.find((e) => e.target === host.id);
    if (connectedEdge) {
      const interfaceId = connectedEdge.source;
      if (!hostsPerInterface.has(interfaceId)) {
        hostsPerInterface.set(interfaceId, []);
      }
      hostsPerInterface.get(interfaceId)!.push(host);
    }
  });

  // Position hosts around their interfaces
  interfaceNodes.forEach((iface, ifaceIndex) => {
    const hosts = hostsPerInterface.get(iface.id) || [];
    const baseAngle = ifaceIndex * interfaceAngleStep;
    const hostAngleRange = LAYOUT_DEFAULTS.RADIAL.arcSpread; // Configurable arc spread per interface
    const hostAngleStep = hosts.length > 1 ? hostAngleRange / (hosts.length - 1) : 0;

    hosts.forEach((host, hostIndex) => {
      const angle = baseAngle - hostAngleRange / 2 + hostIndex * hostAngleStep;
      updatedNodes.push({
        ...host,
        position: {
          x: centerX + hostRadius * Math.cos(angle) - 60,
          y: centerY + hostRadius * Math.sin(angle) - 40,
        },
      });
    });
  });

  return updatedNodes;
}

/**
 * Grid Layout
 * Organized in rows and columns
 * Good for large networks with many nodes
 */
export function gridLayout(
  nodes: Node[],
  _edges: Edge[],
  options: LayoutOptions = {}
): Node[] {
  const { spacing = LAYOUT_DEFAULTS.GRID.spacing } = options;
  const hostSpacing = LAYOUT_DEFAULTS.GRID.hostSpacing;

  // Categorize nodes
  const routerNodes = nodes.filter((n) => n.id === 'router');
  const interfaceNodes = nodes.filter((n) => n.id.startsWith('interface-'));
  const hostNodes = nodes.filter((n) => n.id.startsWith('host-'));

  const updatedNodes: Node[] = [];

  // Router at top center
  routerNodes.forEach((node) => {
    updatedNodes.push({
      ...node,
      position: { x: spacing * 2, y: 50 },
    });
  });

  // Interfaces in row below router with dynamic columns
  const interfacesPerRow = DYNAMIC_SCALING.getGridColumns(
    interfaceNodes.length,
    LAYOUT_DEFAULTS.GRID.columnsMultiplier
  );
  interfaceNodes.forEach((node, index) => {
    const row = Math.floor(index / interfacesPerRow);
    const col = index % interfacesPerRow;
    updatedNodes.push({
      ...node,
      position: {
        x: col * spacing + spacing,
        y: row * spacing + spacing * 2,
      },
    });
  });

  // Hosts in grid below interfaces with denser spacing
  const hostsPerRow = DYNAMIC_SCALING.getGridColumns(
    hostNodes.length,
    LAYOUT_DEFAULTS.GRID.columnsMultiplier
  );
  const startY = Math.ceil(interfaceNodes.length / interfacesPerRow) * spacing + spacing * 3;

  hostNodes.forEach((node, index) => {
    const row = Math.floor(index / hostsPerRow);
    const col = index % hostsPerRow;
    updatedNodes.push({
      ...node,
      position: {
        x: col * hostSpacing + spacing,
        y: row * hostSpacing + startY,
      },
    });
  });

  return updatedNodes;
}

/**
 * Apply selected layout to nodes
 */
export function applyLayout(
  layoutType: LayoutType,
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] {
  switch (layoutType) {
    case 'force':
      return forceDirectedLayout(nodes, edges, options);
    case 'hierarchical':
      return hierarchicalLayout(nodes, edges, options);
    case 'radial':
      return radialLayout(nodes, edges, options);
    case 'grid':
      return gridLayout(nodes, edges, options);
    default:
      return nodes;
  }
}

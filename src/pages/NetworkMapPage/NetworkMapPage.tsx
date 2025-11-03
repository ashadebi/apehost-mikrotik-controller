import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  ConnectionLineType
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Spin, Alert } from 'antd';
import { SaveOutlined, DeleteOutlined, UploadOutlined, ExportOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import { InterfaceTypeIcon } from '../../components/atoms/InterfaceTypeIcon/InterfaceTypeIcon';
import { NetworkInterface, ArpEntry, RouterStatus } from '../../types/api';
import { applyLayout } from '../../utils/networkLayouts';
import { Button } from '../../components/atoms/Button/Button';
import { Toggle } from '../../components/atoms/Toggle/Toggle';
import { TemplateEditorModal } from '../../components/molecules/TemplateEditorModal';
import { NetworkMapLegend } from '../../components/organisms/NetworkMapLegend';
import { useNetworkMapPreferences } from '../../hooks/useNetworkMapPreferences';
import { NODE_DIMENSIONS, API_CONFIG } from '../../utils/networkMapConstants';
import { exportTemplates, importTemplates } from '../../utils/networkMapStorage';
import styles from './NetworkMapPage.module.css';

interface NetworkTopology {
  router: RouterStatus | null;
  interfaces: NetworkInterface[];
  arpTable: ArpEntry[];
}

export const NetworkMapPage: React.FC = () => {
  // Use custom preference hook
  const {
    currentTemplate,
    allTemplates,
    layoutConfig,
    filters,
    visualization,
    applyTemplate,
    saveAsTemplate,
    deleteTemplate,
    refreshTemplates,
    setFilters,
    setVisualization,
  } = useNetworkMapPreferences();

  // Template editor modal state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateModalMode, setTemplateModalMode] = useState<'save' | 'edit'>('save');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topology, setTopology] = useState<NetworkTopology>({
    router: null,
    interfaces: [],
    arpTable: []
  });
  const [scanning, setScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Extract filter values for easier use - inactive is OFF by default
  const showActiveInterfaces = filters.showActiveInterfaces;
  const showInactiveInterfaces = filters.showInactiveInterfaces ?? false;
  const showDetailedInfo = filters.showDetailedInfo;
  const layoutType = layoutConfig.type;
  const nodeSize = layoutConfig.nodeSize;

  // Load network topology data
  const loadTopology = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [routerRes, interfacesRes, arpRes] = await Promise.all([
        fetch('/api/router/status'),
        fetch('/api/router/interfaces'),
        fetch('/api/router/ip/arp')
      ]);

      if (!routerRes.ok || !interfacesRes.ok || !arpRes.ok) {
        throw new Error('Failed to fetch network data');
      }

      const router = await routerRes.json();
      const interfaces = await interfacesRes.json();
      const arpTable = await arpRes.json();

      setTopology({ router, interfaces, arpTable });
    } catch (err) {
      console.error('Failed to load network topology:', err);
      setError('Failed to load network topology. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTopology();
    // Refresh at configured interval
    const interval = setInterval(loadTopology, API_CONFIG.REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadTopology]);

  // Trigger network scan
  const handleNetworkScan = useCallback(async () => {
    setScanning(true);
    try {
      const response = await fetch('/api/router/scan/full');

      if (!response.ok) {
        throw new Error('Network scan failed');
      }

      const scanResults = await response.json();

      // Update topology with enhanced data from scan
      setTopology(prev => ({
        ...prev,
        arpTable: scanResults.arpTable || prev.arpTable
      }));

      setLastScanTime(scanResults.scanTime);

    } catch (error) {
      console.error('Network scan failed:', error);
      setError('Network scan failed. Please try again.');
    } finally {
      setScanning(false);
    }
  }, []);

  // Memoize graph construction to prevent unnecessary recalculations
  const { nodes: constructedNodes, edges: constructedEdges } = useMemo(() => {
    if (!topology.router) {
      return { nodes: [], edges: [] };
    }

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Central router node
    newNodes.push({
      id: 'router',
      type: 'default',
      position: { x: 0, y: 0 }, // Will be positioned by layout
      data: {
        label: (
          <div className={styles.routerNode}>
            <div className={styles.nodeTitle}>{topology.router.name}</div>
            <div className={styles.nodeSubtitle}>{topology.router.model}</div>
            <div className={styles.nodeInfo}>{topology.router.ip}</div>
          </div>
        )
      },
      style: {
        background: 'var(--color-accent-primary)',
        color: 'white',
        border: '2px solid var(--color-accent-primary)',
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        width: NODE_DIMENSIONS.ROUTER[nodeSize],
        fontSize: '14px'
      }
    });

    // Separate interfaces into bridges and standalone interfaces
    const bridges = topology.interfaces.filter(iface => iface.isBridge);
    const standaloneInterfaces = topology.interfaces.filter(
      iface => !iface.isBridge && !iface.bridge
    );

    // Filter based on settings
    const filteredBridges = bridges.filter(iface => {
      if (iface.status === 'up') return showActiveInterfaces;
      return showInactiveInterfaces;
    });
    
    const filteredStandalone = standaloneInterfaces.filter(iface => {
      if (iface.status === 'up') return showActiveInterfaces;
      return showInactiveInterfaces;
    });

    // Render bridge interfaces with their member ports
    filteredBridges.forEach((bridge) => {
      const bridgeId = `interface-${bridge.id}`;
      const memberPorts = topology.interfaces.filter(
        iface => iface.bridge === bridge.name
      );

      // Filter member ports based on settings
      const visibleMemberPorts = memberPorts.filter(iface => {
        if (iface.status === 'up') return showActiveInterfaces;
        return showInactiveInterfaces;
      });

      // Create bridge node (larger, acts as a group header)
      newNodes.push({
        id: bridgeId,
        type: 'default',
        position: { x: 0, y: 0 },
        data: {
          label: (
            <div className={styles.bridgeNode}>
              <div className={styles.nodeTitleRow}>
                <InterfaceTypeIcon type="bridge" size={20} className={styles.nodeTypeIcon} />
                <div className={styles.nodeTitle}>{bridge.name}</div>
              </div>
              <div className={styles.nodeSubtitle}>Bridge ({visibleMemberPorts.length} ports)</div>
              {showDetailedInfo && bridge.ipAddress && (
                <div className={styles.nodeInfo}>IP: {bridge.ipAddress}</div>
              )}
              <div className={`${styles.statusBadge} ${bridge.status === 'up' ? styles.statusUp : styles.statusDown}`}>
                {bridge.status}
              </div>
            </div>
          )
        },
        style: {
          background: 'var(--color-bg-secondary)',
          color: 'var(--color-text-primary)',
          border: `3px solid ${bridge.status === 'up' ? 'var(--color-accent-success)' : 'var(--color-border-primary)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '14px',
          width: NODE_DIMENSIONS.BRIDGE[nodeSize],
          fontSize: '13px'
        }
      });

      // Edge from router to bridge
      newEdges.push({
        id: `router-${bridgeId}`,
        source: 'router',
        target: bridgeId,
        type: 'smoothstep',
        animated: bridge.status === 'up',
        className: 'edge-primary',
        style: {
          stroke: bridge.status === 'up' ? 'var(--color-accent-success)' : 'var(--color-border-primary)',
          strokeWidth: 3
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: bridge.status === 'up' ? 'var(--color-accent-success)' : 'var(--color-border-primary)'
        }
      });

      // Render member port nodes
      visibleMemberPorts.forEach((port) => {
        const portId = `interface-${port.id}`;

        newNodes.push({
          id: portId,
          type: 'default',
          position: { x: 0, y: 0 },
          data: {
            label: (
              <div className={styles.bridgePortNode}>
                <div className={styles.nodeTitleRow}>
                  <InterfaceTypeIcon type={port.type} size={16} className={styles.nodeTypeIcon} />
                  <div className={styles.nodeTitle}>{port.name}</div>
                </div>
                <div className={styles.nodeSubtitle}>{port.type}</div>
                {showDetailedInfo && port.ipAddress && (
                  <div className={styles.nodeInfo}>IP: {port.ipAddress}</div>
                )}
                <div className={`${styles.statusBadge} ${port.status === 'up' ? styles.statusUp : styles.statusDown}`}>
                  {port.status}
                </div>
              </div>
            )
          },
          style: {
            background: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-primary)',
            border: `2px solid ${port.status === 'up' ? 'var(--color-accent-success)' : 'var(--color-border-primary)'}`,
            borderRadius: 'var(--radius-md)',
            padding: '10px',
            width: NODE_DIMENSIONS.BRIDGE_PORT[nodeSize],
            fontSize: '11px'
          }
        });

        // Edge from bridge to member port
        newEdges.push({
          id: `${bridgeId}-${portId}`,
          source: bridgeId,
          target: portId,
          type: 'smoothstep',
          animated: port.status === 'up',
          className: 'edge-secondary',
          style: {
            stroke: port.status === 'up' ? 'var(--color-accent-success)' : 'var(--color-border-primary)',
            strokeWidth: 2,
            strokeDasharray: '5,5' // Dashed line to indicate membership
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: port.status === 'up' ? 'var(--color-accent-success)' : 'var(--color-border-primary)'
          }
        });

        // Add hosts connected to this bridge port
        const hostsOnPort = topology.arpTable.filter(
          arp => {
            const interfaceMatch = arp.interface.trim().toLowerCase() === port.name.trim().toLowerCase();
            const validStatus = ['reachable', 'stale', 'delay'].includes(arp.status);
            const isValid = !arp.disabled && !arp.invalid;
            return interfaceMatch && validStatus && isValid;
          }
        );

        hostsOnPort.forEach((host) => {
          const hostId = `host-${host.id}`;

          const getHostBorderColor = () => {
            if (host.status === 'reachable') return 'var(--color-accent-success)';
            if (host.status === 'stale') return 'var(--color-accent-primary)';
            return 'var(--color-border-primary)';
          };

          newNodes.push({
            id: hostId,
            type: 'default',
            position: { x: 0, y: 0 },
            data: {
              label: (
                <div className={styles.hostNode}>
                  <div className={styles.nodeTitle}>{host.address}</div>
                  <div className={styles.nodeSubtitle}>{host.macAddress.substring(0, 17)}</div>
                  <div className={styles.hostStatus}>{host.status}</div>
                </div>
              )
            },
            style: {
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
              border: `1px solid ${getHostBorderColor()}`,
              borderRadius: 'var(--radius-md)',
              padding: '8px',
              width: NODE_DIMENSIONS.HOST[nodeSize],
              fontSize: '10px'
            }
          });

          newEdges.push({
            id: `${portId}-${hostId}`,
            source: portId,
            target: hostId,
            type: 'smoothstep',
            className: 'edge-tertiary',
            style: {
              stroke: 'var(--color-border-secondary)',
              strokeWidth: 1
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: 'var(--color-border-secondary)'
            }
          });
        });
      });

      // Add hosts connected directly to the bridge interface
      const hostsOnBridge = topology.arpTable.filter(
        arp => {
          const interfaceMatch = arp.interface.trim().toLowerCase() === bridge.name.trim().toLowerCase();
          const validStatus = ['reachable', 'stale', 'delay'].includes(arp.status);
          const isValid = !arp.disabled && !arp.invalid;
          // Don't add if already added via a member port
          const notOnMemberPort = !memberPorts.some(
            port => arp.interface.trim().toLowerCase() === port.name.trim().toLowerCase()
          );
          return interfaceMatch && validStatus && isValid && notOnMemberPort;
        }
      );

      hostsOnBridge.forEach((host) => {
        const hostId = `host-${host.id}`;

        const getHostBorderColor = () => {
          if (host.status === 'reachable') return 'var(--color-accent-success)';
          if (host.status === 'stale') return 'var(--color-accent-primary)';
          return 'var(--color-border-primary)';
        };

        newNodes.push({
          id: hostId,
          type: 'default',
          position: { x: 0, y: 0 },
          data: {
            label: (
              <div className={styles.hostNode}>
                <div className={styles.nodeTitle}>{host.address}</div>
                <div className={styles.nodeSubtitle}>{host.macAddress.substring(0, 17)}</div>
                <div className={styles.hostStatus}>{host.status}</div>
              </div>
            )
          },
          style: {
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)',
            border: `1px solid ${getHostBorderColor()}`,
            borderRadius: 'var(--radius-md)',
            padding: '8px',
            width: NODE_DIMENSIONS.HOST[nodeSize],
            fontSize: '10px'
          }
        });

        newEdges.push({
          id: `${bridgeId}-${hostId}`,
          source: bridgeId,
          target: hostId,
          type: 'smoothstep',
          className: 'edge-tertiary',
          style: {
            stroke: 'var(--color-border-secondary)',
            strokeWidth: 1
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'var(--color-border-secondary)'
          }
        });
      });
    });

    // Render standalone (non-bridge, non-member) interfaces
    filteredStandalone.forEach((iface) => {
      const interfaceId = `interface-${iface.id}`;

      const interfaceMac = topology.arpTable.find(
        arp => arp.interface.trim().toLowerCase() === iface.name.trim().toLowerCase()
      )?.macAddress;

      const displayMac = interfaceMac || 'N/A';

      newNodes.push({
        id: interfaceId,
        type: 'default',
        position: { x: 0, y: 0 },
        data: {
          label: (
            <div className={styles.interfaceNode}>
              <div className={styles.nodeTitleRow}>
                <InterfaceTypeIcon type={iface.type} size={18} className={styles.nodeTypeIcon} />
                <div className={styles.nodeTitle}>{iface.name}</div>
              </div>
              <div className={styles.nodeSubtitle}>{iface.type}</div>
              {showDetailedInfo && (
                <>
                  {iface.ipAddress && (
                    <div className={styles.nodeInfo}>IP: {iface.ipAddress}</div>
                  )}
                  <div className={styles.nodeInfo}>
                    MAC: {displayMac.substring(0, 17)}
                  </div>
                </>
              )}
              <div className={`${styles.statusBadge} ${iface.status === 'up' ? styles.statusUp : styles.statusDown}`}>
                {iface.status}
              </div>
            </div>
          )
        },
        style: {
          background: 'var(--color-bg-tertiary)',
          color: 'var(--color-text-primary)',
          border: `2px solid ${iface.status === 'up' ? 'var(--color-accent-success)' : 'var(--color-border-primary)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '12px',
          width: NODE_DIMENSIONS.INTERFACE[nodeSize],
          fontSize: '12px'
        }
      });

      newEdges.push({
        id: `router-${interfaceId}`,
        source: 'router',
        target: interfaceId,
        type: 'smoothstep',
        animated: iface.status === 'up',
        className: 'edge-primary',
        style: {
          stroke: iface.status === 'up' ? 'var(--color-accent-success)' : 'var(--color-border-primary)',
          strokeWidth: 2
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: iface.status === 'up' ? 'var(--color-accent-success)' : 'var(--color-border-primary)'
        }
      });

      // Add connected hosts for this standalone interface
      const hostsOnInterface = topology.arpTable.filter(
        arp => {
          const interfaceMatch = arp.interface.trim().toLowerCase() === iface.name.trim().toLowerCase();
          const validStatus = ['reachable', 'stale', 'delay'].includes(arp.status);
          const isValid = !arp.disabled && !arp.invalid;
          return interfaceMatch && validStatus && isValid;
        }
      );

      hostsOnInterface.forEach((host) => {
        const hostId = `host-${host.id}`;

        const getHostBorderColor = () => {
          if (host.status === 'reachable') return 'var(--color-accent-success)';
          if (host.status === 'stale') return 'var(--color-accent-primary)';
          return 'var(--color-border-primary)';
        };

        newNodes.push({
          id: hostId,
          type: 'default',
          position: { x: 0, y: 0 },
          data: {
            label: (
              <div className={styles.hostNode}>
                <div className={styles.nodeTitle}>{host.address}</div>
                <div className={styles.nodeSubtitle}>{host.macAddress.substring(0, 17)}</div>
                <div className={styles.hostStatus}>{host.status}</div>
              </div>
            )
          },
          style: {
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)',
            border: `1px solid ${getHostBorderColor()}`,
            borderRadius: 'var(--radius-md)',
            padding: '8px',
            width: NODE_DIMENSIONS.HOST[nodeSize],
            fontSize: '10px'
          }
        });

        newEdges.push({
          id: `${interfaceId}-${hostId}`,
          source: interfaceId,
          target: hostId,
          type: 'smoothstep',
          className: 'edge-tertiary',
          style: {
            stroke: 'var(--color-border-secondary)',
            strokeWidth: 1
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'var(--color-border-secondary)'
          }
        });
      });
    });

    return { nodes: newNodes, edges: newEdges };
  }, [topology, showActiveInterfaces, showInactiveInterfaces, showDetailedInfo, nodeSize]);

  // Memoize layout application
  const layoutedNodes = useMemo(() => {
    return applyLayout(layoutType, constructedNodes, constructedEdges);
  }, [layoutType, constructedNodes, constructedEdges]);

  // Update ReactFlow state when layout changes
  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(constructedEdges);
  }, [layoutedNodes, constructedEdges, setNodes, setEdges]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <Spin size="large" tip="Loading network topology..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Network Map</h1>
        </div>
        <div className={styles.content}>
          <Alert
            message="Error Loading Network Map"
            description={error}
            type="error"
            showIcon
          />
        </div>
      </div>
    );
  }

  // Template management handlers
  const handleSaveTemplate = () => {
    setTemplateModalMode('save');
    setIsTemplateModalOpen(true);
  };

  const handleDeleteTemplate = () => {
    if (!currentTemplate || currentTemplate.isDefault) {
      alert('Cannot delete default templates');
      return;
    }
    if (confirm(`Delete template "${currentTemplate.name}"?`)) {
      deleteTemplate(currentTemplate.id);
    }
  };

  const handleExportTemplates = () => {
    const jsonString = exportTemplates();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `network-map-templates-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportTemplates = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const result = importTemplates(text);

        if (result.success) {
          alert(`Successfully imported ${result.count} template(s)`);
          refreshTemplates();
        } else {
          alert(`Import failed: ${result.error}`);
        }
      } catch (error) {
        alert('Failed to read file');
      }
    };
    input.click();
  };

  const handleSaveTemplateFromModal = (name: string, description: string) => {
    saveAsTemplate(name, description);
    setIsTemplateModalOpen(false);
  };

  const handleCancelTemplateModal = () => {
    setIsTemplateModalOpen(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Network Map</h1>

        <div className={styles.headerControls}>
          <div className={styles.templateControls}>
            <label className={styles.templateLabel}>Template:</label>
            <select
              className={styles.templateSelect}
              value={currentTemplate?.id || ''}
              onChange={(e) => applyTemplate(e.target.value)}
              title="Select a network map template"
            >
              <option value="">Custom Configuration</option>
              <optgroup label="Default Templates">
                {allTemplates.filter(t => t.isDefault).map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </optgroup>
              {allTemplates.some(t => !t.isDefault) && (
                <optgroup label="Custom Templates">
                  {allTemplates.filter(t => !t.isDefault).map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <div className={styles.templateActions}>
              <button
                className={styles.iconButton}
                onClick={handleSaveTemplate}
                title="Save current settings as a template"
              >
                <SaveOutlined />
              </button>
              <button
                className={styles.iconButton}
                onClick={handleDeleteTemplate}
                disabled={!currentTemplate || currentTemplate.isDefault}
                title="Delete current custom template"
              >
                <DeleteOutlined />
              </button>
              <button
                className={styles.iconButton}
                onClick={handleImportTemplates}
                title="Import templates from file"
              >
                <UploadOutlined />
              </button>
              <button
                className={styles.iconButton}
                onClick={handleExportTemplates}
                title="Export templates to file"
              >
                <ExportOutlined />
              </button>
            </div>
          </div>

          <div className={styles.stats}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Active:</span>
              <span className={styles.statValue}>
                {topology.interfaces.filter(i => i.status === 'up').length}
              </span>
              <button
                className={styles.iconToggle}
                onClick={() => setFilters({ ...filters, showActiveInterfaces: !showActiveInterfaces })}
                title={showActiveInterfaces ? 'Hide active interfaces' : 'Show active interfaces'}
              >
                {showActiveInterfaces ? <EyeOutlined /> : <EyeInvisibleOutlined />}
              </button>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Inactive:</span>
              <span className={styles.statValue}>
                {topology.interfaces.filter(i => i.status !== 'up').length}
              </span>
              <button
                className={styles.iconToggle}
                onClick={() => setFilters({ ...filters, showInactiveInterfaces: !showInactiveInterfaces })}
                title={showInactiveInterfaces ? 'Hide inactive interfaces' : 'Show inactive interfaces'}
              >
                {showInactiveInterfaces ? <EyeOutlined /> : <EyeInvisibleOutlined />}
              </button>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Devices:</span>
              <span className={styles.statValue}>
                {nodes.filter(n => n.id.startsWith('host-')).length}
              </span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Total ARP:</span>
              <span className={styles.statValue}>{topology.arpTable.length}</span>
            </div>
            {lastScanTime && (
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Last Scan:</span>
                <span className={styles.statValue}>
                  {new Date(lastScanTime).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>

          <div className={styles.controlsGroup}>
            <div className={styles.actionControls}>
              <Button
                variant="primary"
                size="small"
                onClick={handleNetworkScan}
                disabled={scanning}
              >
                {scanning ? 'Scanning...' : 'Scan Network'}
              </Button>
            </div>

            <div className={styles.filterControls}>
              <div className={styles.toggleGroup}>
                <Toggle
                  checked={showDetailedInfo}
                  onChange={(checked) => setFilters({ ...filters, showDetailedInfo: checked })}
                />
                <label className={styles.toggleLabel}>Show Details</label>
              </div>
              <div className={styles.toggleGroup}>
                <Toggle
                  checked={visualization.showLegend}
                  onChange={(checked) => setVisualization({ ...visualization, showLegend: checked })}
                />
                <label className={styles.toggleLabel}>Show Legend</label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.mapContainer}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView
          attributionPosition="bottom-left"
        >
          <Background color="var(--color-border-primary)" gap={16} />
          <Controls className={styles.controls} />
          <MiniMap
            className={styles.minimap}
            nodeColor={(node) => {
              if (node.id === 'router') return 'var(--color-accent-primary)';
              if (node.id.startsWith('interface-')) return 'var(--color-accent-success)';
              return 'var(--color-border-primary)';
            }}
          />
        </ReactFlow>
      </div>

      <TemplateEditorModal
        isOpen={isTemplateModalOpen}
        mode={templateModalMode}
        onSave={handleSaveTemplateFromModal}
        onCancel={handleCancelTemplateModal}
      />

      <NetworkMapLegend
        isVisible={visualization.showLegend}
        position="top-left"
        onToggle={() => setVisualization({ ...visualization, showLegend: !visualization.showLegend })}
      />
    </div>
  );
};

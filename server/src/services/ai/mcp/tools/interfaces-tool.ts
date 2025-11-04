/**
 * Interfaces Tool
 *
 * Retrieves information about network interfaces including:
 * - Interface names and types
 * - Status (up/down)
 * - Traffic statistics (RX/TX rates and bytes)
 * - MAC addresses
 */

import { BaseMCPTool } from '../base-tool.js';
import type { ToolResult, ToolExecutionContext, ToolInputSchema } from '../types.js';
import mikrotikService from '../../../mikrotik.js';

export class InterfacesTool extends BaseMCPTool {
  readonly name = 'get_interfaces';
  readonly description =
    'Get network interface information including status, type, current traffic rates (bytes/sec), and TOTAL bandwidth consumed since router boot. Returns RX/TX rates for real-time monitoring and cumulative RX/TX byte counters showing total data transferred. Use this when users ask about: total bandwidth used, cumulative data transfer, bandwidth consumed since reboot, interface status, or current traffic rates. DO NOT use for internet speed testing - use test_connectivity with action=internet-speed-test for that.';

  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Optional filter by interface type (ethernet, wireless, bridge, vlan)',
        enum: ['ethernet', 'wireless', 'bridge', 'vlan', 'bonding'],
      },
    },
    required: [],
  };

  async execute(params: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // Validate input
      const validation = this.validateInput(params);
      if (!validation.valid) {
        return this.error(`Input validation failed: ${validation.errors.join(', ')}`);
      }

      if (!mikrotikService) {
        return this.error('MikroTik service not available');
      }

      const typeFilter = params.type as string | undefined;

      // Use mikrotikService.getInterfaces() for reliable structured data
      const allInterfaces = await mikrotikService.getInterfaces();

      // Filter by type if specified
      let interfaces = allInterfaces;
      if (typeFilter) {
        interfaces = allInterfaces.filter(iface =>
          iface.type.toLowerCase() === typeFilter.toLowerCase()
        );
      }

      // Format data for AI consumption with clear field descriptions
      const formattedInterfaces = interfaces.map(iface => ({
        name: iface.name,
        type: iface.type,
        status: iface.status,
        rx_rate_bps: iface.rxRate, // Current receive rate in bytes per second
        tx_rate_bps: iface.txRate, // Current transmit rate in bytes per second
        rx_bytes_total: iface.rxBytes, // Total bytes received since boot
        tx_bytes_total: iface.txBytes, // Total bytes transmitted since boot
        rx_mb_total: (iface.rxBytes / 1024 / 1024).toFixed(2), // Total MB received
        tx_mb_total: (iface.txBytes / 1024 / 1024).toFixed(2), // Total MB transmitted
        rx_gb_total: (iface.rxBytes / 1024 / 1024 / 1024).toFixed(3), // Total GB received
        tx_gb_total: (iface.txBytes / 1024 / 1024 / 1024).toFixed(3), // Total GB transmitted
        ip_address: iface.ipAddress,
        comment: iface.comment,
        is_bridge: iface.isBridge,
        bridge_member_of: iface.bridge,
      }));

      const executionTime = Date.now() - startTime;

      // Calculate total bandwidth across all interfaces
      const totalRxBytes = interfaces.reduce((sum, iface) => sum + iface.rxBytes, 0);
      const totalTxBytes = interfaces.reduce((sum, iface) => sum + iface.txBytes, 0);

      return this.success(
        {
          interfaces: formattedInterfaces,
          count: formattedInterfaces.length,
          summary: {
            total_rx_bytes: totalRxBytes,
            total_tx_bytes: totalTxBytes,
            total_rx_gb: (totalRxBytes / 1024 / 1024 / 1024).toFixed(3),
            total_tx_gb: (totalTxBytes / 1024 / 1024 / 1024).toFixed(3),
            total_combined_gb: ((totalRxBytes + totalTxBytes) / 1024 / 1024 / 1024).toFixed(3),
          },
          timestamp: new Date().toISOString(),
        },
        executionTime
      );
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return this.error(
        error instanceof Error ? error.message : 'Failed to retrieve interfaces',
        executionTime
      );
    }
  }
}

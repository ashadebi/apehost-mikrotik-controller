import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import mikrotikService from '../services/mikrotik.js';
import settingsService from '../services/settings.js';

export const routerRoutes = Router();

function maskRouter(profile: any) {
  return {
    ...profile,
    password: profile.password ? '********' : ''
  };
}

async function getRouterSettings() {
  const settings = await settingsService.getSettings();
  const fallbackProfile = {
    id: 'default',
    name: 'Default Router',
    enabled: true,
    ...settings.mikrotik
  };
  const routers = settings.routers?.length ? settings.routers : [fallbackProfile];
  return { settings, routers };
}

/**
 * GET /api/router/profiles
 * List configured MikroTik router profiles.
 */
routerRoutes.get('/profiles', async (req: Request, res: Response) => {
  try {
    const { settings, routers } = await getRouterSettings();
    res.json({
      activeRouterId: settings.activeRouterId || routers[0]?.id || 'default',
      routers: routers.map(maskRouter)
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to load router profiles', message: error.message });
  }
});

/**
 * POST /api/router/profiles
 * Add a MikroTik router profile.
 */
routerRoutes.post('/profiles', async (req: Request, res: Response) => {
  try {
    const { settings } = await getRouterSettings();
    const profile = {
      id: req.body.id || randomUUID(),
      name: req.body.name || req.body.host || 'MikroTik Router',
      host: req.body.host,
      port: Number(req.body.port || 8728),
      username: req.body.username || 'admin',
      password: req.body.password || '',
      timeout: Number(req.body.timeout || settings.mikrotik.timeout || 10000),
      keepaliveInterval: Number(req.body.keepaliveInterval || settings.mikrotik.keepaliveInterval || 30000),
      speedTest: req.body.speedTest || settings.mikrotik.speedTest,
      enabled: req.body.enabled !== false
    };

    if (!profile.host) {
      return res.status(400).json({ error: 'Router host is required' });
    }

    const routers = [...(settings.routers || []), profile];
    await settingsService.updateSettings({ routers, activeRouterId: settings.activeRouterId || profile.id });
    res.status(201).json(maskRouter(profile));
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to add router profile', message: error.message });
  }
});

/**
 * PUT /api/router/profiles/:id
 * Update a MikroTik router profile.
 */
routerRoutes.put('/profiles/:id', async (req: Request, res: Response) => {
  try {
    const { settings } = await getRouterSettings();
    const routers = [...(settings.routers || [])];
    const index = routers.findIndex((router) => router.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Router profile not found' });
    }

    const current = routers[index];
    routers[index] = {
      ...current,
      ...req.body,
      id: current.id,
      port: Number(req.body.port ?? current.port),
      timeout: Number(req.body.timeout ?? current.timeout),
      keepaliveInterval: Number(req.body.keepaliveInterval ?? current.keepaliveInterval),
      password: req.body.password === '********' ? current.password : (req.body.password ?? current.password),
      speedTest: req.body.speedTest || current.speedTest,
      enabled: req.body.enabled ?? current.enabled
    };

    await settingsService.updateSettings({ routers });
    if (settings.activeRouterId === current.id) {
      await mikrotikService.refreshConnection();
    }
    res.json(maskRouter(routers[index]));
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update router profile', message: error.message });
  }
});

/**
 * POST /api/router/profiles/:id/activate
 * Select the active router profile used by dashboard, terminal, and agent features.
 */
routerRoutes.post('/profiles/:id/activate', async (req: Request, res: Response) => {
  try {
    const { settings, routers } = await getRouterSettings();
    const profile = routers.find((router) => router.id === req.params.id);
    if (!profile) {
      return res.status(404).json({ error: 'Router profile not found' });
    }
    if (profile.enabled === false) {
      return res.status(400).json({ error: 'Router profile is disabled' });
    }

    await settingsService.updateSettings({
      activeRouterId: profile.id,
      mikrotik: profile
    });
    await mikrotikService.refreshConnection();
    res.json({ activeRouterId: profile.id, router: maskRouter(profile) });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to activate router profile', message: error.message });
  }
});

/**
 * DELETE /api/router/profiles/:id
 * Delete a MikroTik router profile.
 */
routerRoutes.delete('/profiles/:id', async (req: Request, res: Response) => {
  try {
    const { settings } = await getRouterSettings();
    const routers = (settings.routers || []).filter((router) => router.id !== req.params.id);
    const activeRouterId = settings.activeRouterId === req.params.id ? routers[0]?.id : settings.activeRouterId;
    await settingsService.updateSettings({ routers, activeRouterId });
    if (settings.activeRouterId === req.params.id) {
      await mikrotikService.refreshConnection();
    }
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete router profile', message: error.message });
  }
});

/**
 * GET /api/router/status
 * Get router system status and information
 */
routerRoutes.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await mikrotikService.getRouterStatus();
    res.json(status);
  } catch (error: any) {
    console.error('Error fetching router status:', error);
    res.status(500).json({
      error: 'Failed to fetch router status',
      message: error.message
    });
  }
});

/**
 * GET /api/router/interfaces
 * Get list of network interfaces
 */
routerRoutes.get('/interfaces', async (req: Request, res: Response) => {
  try {
    const interfaces = await mikrotikService.getInterfaces();
    res.json(interfaces);
  } catch (error: any) {
    console.error('Error fetching interfaces:', error);
    res.status(500).json({
      error: 'Failed to fetch interfaces',
      message: error.message
    });
  }
});

/**
 * GET /api/router/resources
 * Get system resources (CPU, memory, etc.)
 */
routerRoutes.get('/resources', async (req: Request, res: Response) => {
  try {
    const resources = await mikrotikService.getSystemResources();

    // Parse and format resources
    const totalMemory = mikrotikService.parseBytes(resources['total-memory'] || '0');
    const freeMemory = mikrotikService.parseBytes(resources['free-memory'] || '0');
    const usedMemory = totalMemory - freeMemory;

    const formatted = {
      cpu: {
        load: parseInt(String(resources['cpu-load'] || '0').replace('%', '')),
        count: parseInt(resources['cpu-count'] || '1')
      },
      memory: {
        used: usedMemory,
        total: totalMemory,
        percentage: Math.round((usedMemory / totalMemory) * 100)
      },
      disk: {
        used: 0,
        total: 0,
        percentage: 0
      },
      uptime: mikrotikService.parseUptime(resources.uptime || '0s'),
      timestamp: new Date().toISOString()
    };

    res.json(formatted);
  } catch (error: any) {
    console.error('Error fetching resources:', error);
    res.status(500).json({
      error: 'Failed to fetch system resources',
      message: error.message
    });
  }
});

/**
 * PATCH /api/router/interfaces/:id
 * Update interface properties (name, comment, disabled status)
 */
routerRoutes.patch('/interfaces/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, comment, disabled } = req.body;

    console.log('Received interface update request:', {
      id,
      body: req.body,
      updates: { name, comment, disabled }
    });

    const updatedInterface = await mikrotikService.updateInterface(id, {
      name,
      comment,
      disabled
    });

    console.log('Interface updated successfully:', updatedInterface);
    res.json(updatedInterface);
  } catch (error: any) {
    console.error('Error updating interface:', error);
    res.status(500).json({
      error: 'Failed to update interface',
      message: error.message
    });
  }
});

/**
 * GET /api/router/ip/addresses
 * Get list of IP addresses
 */
routerRoutes.get('/ip/addresses', async (req: Request, res: Response) => {
  try {
    const addresses = await mikrotikService.getIpAddresses();
    res.json(addresses);
  } catch (error: any) {
    console.error('Error fetching IP addresses:', error);
    res.status(500).json({
      error: 'Failed to fetch IP addresses',
      message: error.message
    });
  }
});

/**
 * GET /api/router/ip/routes
 * Get routing table
 */
routerRoutes.get('/ip/routes', async (req: Request, res: Response) => {
  try {
    const routes = await mikrotikService.getRoutes();
    res.json(routes);
  } catch (error: any) {
    console.error('Error fetching routes:', error);
    res.status(500).json({
      error: 'Failed to fetch routes',
      message: error.message
    });
  }
});

/**
 * GET /api/router/ip/arp
 * Get ARP table
 */
routerRoutes.get('/ip/arp', async (req: Request, res: Response) => {
  try {
    const arpTable = await mikrotikService.getArpTable();
    res.json(arpTable);
  } catch (error: any) {
    console.error('Error fetching ARP table:', error);
    res.status(500).json({
      error: 'Failed to fetch ARP table',
      message: error.message
    });
  }
});

/**
 * GET /api/router/interface/bridge/host
 * Get bridge host table (MAC addresses learned on bridge ports)
 */
routerRoutes.get('/interface/bridge/host', async (req: Request, res: Response) => {
  try {
    const bridgeHosts = await mikrotikService.getBridgeHosts();
    res.json(bridgeHosts);
  } catch (error: any) {
    console.error('Error fetching bridge hosts:', error);
    res.status(500).json({
      error: 'Failed to fetch bridge hosts',
      message: error.message
    });
  }
});

/**
 * GET /api/router/export
 * Export router configuration as .rsc file
 */
routerRoutes.get('/export', async (req: Request, res: Response) => {
  try {
    const config = await mikrotikService.exportConfig();

    // Set headers for file download
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="router-config.rsc"');

    res.send(config);
  } catch (error: any) {
    console.error('Error exporting configuration:', error);
    res.status(500).json({
      error: 'Failed to export configuration',
      message: error.message
    });
  }
});

/**
 * GET /api/router/firewall/filter
 * Get firewall filter rules
 */
routerRoutes.get('/firewall/filter', async (req: Request, res: Response) => {
  try {
    const rules = await mikrotikService.getFirewallFilterRules();
    res.json(rules);
  } catch (error: any) {
    console.error('Error fetching firewall filter rules:', error);
    res.status(500).json({
      error: 'Failed to fetch firewall filter rules',
      message: error.message
    });
  }
});

/**
 * GET /api/router/firewall/nat
 * Get firewall NAT rules
 */
routerRoutes.get('/firewall/nat', async (req: Request, res: Response) => {
  try {
    const rules = await mikrotikService.getFirewallNatRules();
    res.json(rules);
  } catch (error: any) {
    console.error('Error fetching firewall NAT rules:', error);
    res.status(500).json({
      error: 'Failed to fetch firewall NAT rules',
      message: error.message
    });
  }
});

/**
 * GET /api/router/firewall/mangle
 * Get firewall mangle rules
 */
routerRoutes.get('/firewall/mangle', async (req: Request, res: Response) => {
  try {
    const rules = await mikrotikService.getFirewallMangleRules();
    res.json(rules);
  } catch (error: any) {
    console.error('Error fetching firewall mangle rules:', error);
    res.status(500).json({
      error: 'Failed to fetch firewall mangle rules',
      message: error.message
    });
  }
});

/**
 * GET /api/router/firewall/address-list
 * Get firewall address lists
 */
routerRoutes.get('/firewall/address-list', async (req: Request, res: Response) => {
  try {
    const lists = await mikrotikService.getFirewallAddressLists();
    res.json(lists);
  } catch (error: any) {
    console.error('Error fetching firewall address lists:', error);
    res.status(500).json({
      error: 'Failed to fetch firewall address lists',
      message: error.message
    });
  }
});

/**
 * GET /api/router/scan/dhcp-leases
 * Get DHCP server leases with hostname information
 */
routerRoutes.get('/scan/dhcp-leases', async (req: Request, res: Response) => {
  try {
    const leases = await mikrotikService.getDhcpLeases();
    res.json(leases);
  } catch (error: any) {
    console.error('Error fetching DHCP leases:', error);
    res.status(500).json({
      error: 'Failed to fetch DHCP leases',
      message: error.message
    });
  }
});

/**
 * GET /api/router/scan/neighbors
 * Get network neighbor discovery data (LLDP/CDP/MNDP)
 */
routerRoutes.get('/scan/neighbors', async (req: Request, res: Response) => {
  try {
    const neighbors = await mikrotikService.getNeighbors();
    res.json(neighbors);
  } catch (error: any) {
    console.error('Error fetching neighbors:', error);
    res.status(500).json({
      error: 'Failed to fetch neighbors',
      message: error.message
    });
  }
});

/**
 * GET /api/router/scan/full
 * Perform comprehensive network scan combining ARP, DHCP, and neighbor discovery
 */
routerRoutes.get('/scan/full', async (req: Request, res: Response) => {
  try {
    const scanResults = await mikrotikService.performNetworkScan();
    res.json(scanResults);
  } catch (error: any) {
    console.error('Error performing network scan:', error);
    res.status(500).json({
      error: 'Failed to perform network scan',
      message: error.message
    });
  }
});

/**
 * GET /api/router/scan/host
 * Lookup specific host by IP or MAC address
 * Query params: ip (IP address) or mac (MAC address)
 *
 * This endpoint combines data from ARP table, DHCP leases, and interface
 * configuration to provide complete information about a host.
 */
routerRoutes.get('/scan/host', async (req: Request, res: Response) => {
  try {
    const { ip, mac } = req.query;

    if (!ip && !mac) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'Either ip or mac query parameter is required'
      });
    }

    // Perform comprehensive network scan
    const scanData = await mikrotikService.performNetworkScan();
    const { enhancedHosts } = scanData;

    // Get interface information for network segments
    const interfaces = await mikrotikService.getIpAddresses();

    // Filter hosts by IP or MAC
    let matchingHosts: any[] = [];

    if (ip) {
      matchingHosts = enhancedHosts.filter((host: any) => host.address === ip);
    } else if (mac) {
      const macUpper = String(mac).toUpperCase().replace(/[:-]/g, ':');
      matchingHosts = enhancedHosts.filter((host: any) => {
        const hostMac = (host.macAddress || '').toUpperCase().replace(/[:-]/g, ':');
        return hostMac === macUpper;
      });
    }

    if (matchingHosts.length === 0) {
      return res.status(404).json({
        error: 'Host not found',
        message: `No host found with ${ip ? `IP ${ip}` : `MAC ${mac}`}`,
        query: { ip, mac },
        interfaces: interfaces.map((iface: any) => ({
          name: iface.interface,
          address: iface.address,
          network: iface.network,
        })),
        recommendations: [
          'Host may be offline or not yet discovered',
          ip ? `Try pinging the host: /ping address=${ip}` : 'Check physical connections',
          'Ensure host is on a configured network segment'
        ]
      });
    }

    // Add network segment information
    const hostsWithNetwork = matchingHosts.map((host: any) => {
      const ifaceConfig = interfaces.find((iface: any) => iface.interface === host.interface);
      return {
        ...host,
        networkSegment: ifaceConfig ? {
          address: ifaceConfig.address,
          network: ifaceConfig.network,
          interface: ifaceConfig.interface,
        } : null
      };
    });

    res.json({
      found: true,
      query: { ip, mac },
      hosts: hostsWithNetwork,
      count: hostsWithNetwork.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error looking up host:', error);
    res.status(500).json({
      error: 'Failed to lookup host',
      message: error.message
    });
  }
});

/**
 * GET /api/router/speed-test
 * Perform internet speed test (latency and download speed)
 */
routerRoutes.get('/speed-test', async (req: Request, res: Response) => {
  try {
    const speedResults = await mikrotikService.performSpeedTest();
    res.json(speedResults);
  } catch (error: any) {
    console.error('Error performing speed test:', error);
    res.status(500).json({
      error: 'Failed to perform speed test',
      message: error.message
    });
  }
});

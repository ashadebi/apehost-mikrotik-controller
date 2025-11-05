/**
 * Configuration is now managed by UnifiedConfigService
 * See server/src/services/config/ for configuration management
 */
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import express, { Request, Response } from 'express';
import cors from 'cors';
import { routerRoutes } from './routes/router.js';
import { terminalRoutes } from './routes/terminal.js';
import { healthRoutes } from './routes/health.js';
import { serviceRoutes } from './routes/service.js';
import { settingsRoutes } from './routes/settings.js';
import { setupRoutes } from './routes/setup.js';
import agentRoutes from './routes/agent.js';
import { backupRoutes } from './routes/backups.js';
import { wireguardRoutes } from './routes/wireguard.js';
import mikrotikService from './services/mikrotik.js';
import { Server as SocketIOServer } from 'socket.io';
import terminalSessionManager from './services/terminal-session.js';
import conversationManager from './services/ai/conversation-manager.js';
import { getGlobalProvider, refreshGlobalProvider } from './services/ai/provider-factory.js';
import { AIServiceError } from './services/ai/errors/index.js';
import { globalMCPExecutor } from './services/ai/mcp/mcp-executor.js';
import { createServer } from 'http';
import { getHealthMonitor } from './services/agent/monitor/health-monitor.js';
import { unifiedConfigService } from './services/config/unified-config.service.js';
import { startMetricsCollection, stopMetricsCollection } from './services/agent/metrics-collector.js';
import { backupManagementService } from './services/backup-management.service.js';

const app = express();
const httpServer = createServer(app);
let server: any = null;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.use('/api/health', healthRoutes);

// Setup routes (must be accessible before authentication)
app.use('/api/setup', setupRoutes);

// API Routes
app.use('/api/router', routerRoutes);
app.use('/api/terminal', terminalRoutes);
app.use('/api/service', serviceRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/wireguard', wireguardRoutes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'MikroTik Dashboard API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      router: '/api/router',
      terminal: '/api/terminal'
    }
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Graceful shutdown handler
let shutdownInProgress = false;
const gracefulShutdown = async (signal: string) => {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  console.log(`\n[Server] Received ${signal}, starting graceful shutdown...`);

  // Stop Health Monitor
  try {
    const healthMonitor = getHealthMonitor();
    healthMonitor.stop();
    console.log('[Server] Health Monitor stopped');
  } catch (error) {
    console.error('[Server] Error stopping Health Monitor:', error);
  }

  // Stop Metrics Collector
  try {
    stopMetricsCollection();
    console.log('[Server] Metrics Collector stopped');
  } catch (error) {
    console.error('[Server] Error stopping Metrics Collector:', error);
  }

  // Close HTTP server
  if (server) {
    server.close(() => {
      console.log('[Server] HTTP server closed');
    });
  }

  // Disconnect from MikroTik
  try {
    await mikrotikService.disconnect('shutdown');
  } catch (error) {
    console.error('[Server] Error disconnecting from MikroTik:', error);
  }

  console.log('[Server] Graceful shutdown complete');
  process.exit(0);
};

// Register shutdown handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Check if port is already in use
import net from 'net';
const checkPort = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.once('close', () => resolve(true)).close();
      })
      .listen(port);
  });
};

// Initialize Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Track interface streaming intervals per socket
const interfaceStreamingIntervals = new Map<string, NodeJS.Timeout>();

// Track active AI Assistant requests for cancellation support
const activeAssistantRequests = new Map<string, AbortController>();

// Initialize AI provider (will be loaded async at startup)
console.log('[Server] AI provider will be initialized at startup...');
export let aiProvider: Awaited<ReturnType<typeof getGlobalProvider>> = null;

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`[WebSocket] Client connected: ${socket.id}`);

  // Create terminal session
  const session = terminalSessionManager.createSession(socket.id);

  // Send session ID to client
  socket.emit('session:created', {
    sessionId: session.id,
    timestamp: new Date().toISOString()
  });

  // Handle terminal command execution
  socket.on('terminal:execute', async (data: { command: string; sessionId?: string }) => {
    try {
      const sessionId = data.sessionId || session.id;
      console.log(`[WebSocket] Executing command in session ${sessionId}: ${data.command}`);

      // Send command acknowledgment
      socket.emit('terminal:executing', {
        command: data.command,
        timestamp: new Date().toISOString()
      });

      const startTime = Date.now();
      const output = await terminalSessionManager.executeCommand(sessionId, data.command);
      const executionTime = Date.now() - startTime;

      // Send command output
      socket.emit('terminal:output', {
        command: data.command,
        output,
        executionTime,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[WebSocket] Command execution error:', error.message);
      socket.emit('terminal:error', {
        command: data.command,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle get command history
  socket.on('terminal:getHistory', (data: { sessionId?: string }) => {
    const sessionId = data.sessionId || session.id;
    const history = terminalSessionManager.getHistory(sessionId);
    socket.emit('terminal:history', {
      history,
      timestamp: new Date().toISOString()
    });
  });

  // Handle interface statistics streaming
  socket.on('interfaces:subscribe', async (data: { interval?: number } = {}) => {
    const interval = data.interval || 1000; // Default 1 second
    console.log(`[WebSocket] Client ${socket.id} subscribed to interface updates (${interval}ms)`);

    // Clear any existing interval for this socket
    const existingInterval = interfaceStreamingIntervals.get(socket.id);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Pre-warm traffic stats to avoid sending 0.0 rates on first update
    // This populates previousInterfaceStats without sending to client
    try {
      console.log(`[WebSocket] Pre-warming traffic stats for client ${socket.id}`);
      await mikrotikService.getInterfaces(); // Baseline query - stores stats but rates will be 0.0

      // Wait 200ms for traffic to accumulate before sending first real update
      await new Promise(resolve => setTimeout(resolve, 200));

      // Now get real rates and send initial data
      const interfaces = await mikrotikService.getInterfaces();
      socket.emit('interfaces:update', {
        interfaces,
        timestamp: new Date().toISOString()
      });
      console.log(`[WebSocket] Sent initial traffic data with real rates to client ${socket.id}`);
    } catch (error: any) {
      console.error('[WebSocket] Error during initial data fetch:', error.message);
      socket.emit('interfaces:error', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    // Start streaming updates
    const streamInterval = setInterval(async () => {
      try {
        const interfaces = await mikrotikService.getInterfaces();
        socket.emit('interfaces:update', {
          interfaces,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        console.error('[WebSocket] Error fetching interfaces:', error.message);
        socket.emit('interfaces:error', {
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }, interval);

    interfaceStreamingIntervals.set(socket.id, streamInterval);
  });

  // Handle unsubscribe from interface updates
  socket.on('interfaces:unsubscribe', () => {
    console.log(`[WebSocket] Client ${socket.id} unsubscribed from interface updates`);
    const existingInterval = interfaceStreamingIntervals.get(socket.id);
    if (existingInterval) {
      clearInterval(existingInterval);
      interfaceStreamingIntervals.delete(socket.id);
    }
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log(`[WebSocket] Client disconnected: ${socket.id} (${reason})`);
    terminalSessionManager.removeSessionBySocketId(socket.id);

    // Clean up interface streaming interval
    const existingInterval = interfaceStreamingIntervals.get(socket.id);
    if (existingInterval) {
      clearInterval(existingInterval);
      interfaceStreamingIntervals.delete(socket.id);
    }
  });

  // Handle ping/pong for connection health
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  // AI Assistant events
  socket.on('assistant:message', async (data: { message: string; conversationId: string; context?: any }) => {
    try {
      if (!aiProvider) {
        socket.emit('assistant:error', {
          error: 'AI Assistant not configured. Set up LLM_PROVIDER in .env',
          conversationId: data.conversationId,
          code: 'CONFIG_ERROR',
          canRetry: false,
        });
        return;
      }

      const { message, conversationId } = data;

      if (!message || message.trim().length === 0) {
        socket.emit('assistant:error', {
          error: 'Message cannot be empty',
          conversationId,
          code: 'VALIDATION_ERROR',
          canRetry: false,
        });
        return;
      }

      console.log(`[Assistant] Message received from ${socket.id} (conversation: ${conversationId})`);

      // Add user message to conversation
      const userMessage = conversationManager.addMessage(conversationId, 'user', message);

      // Emit typing indicator
      socket.emit('assistant:typing', {
        conversationId,
        isTyping: true,
      });

      // Get conversation history for LLM
      const messages = await conversationManager.getMessagesForLLM(conversationId);

      const assistantMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      let fullResponse = '';

      // Create AbortController for cancellation support
      const abortController = new AbortController();
      activeAssistantRequests.set(conversationId, abortController);

      try {
        console.log(`[Assistant] Starting streaming response with abort support`);

        // Use streamMessage for real streaming with tool execution
        const generator = aiProvider.streamMessage(messages, {
          signal: abortController.signal,
          sessionId: socket.id,
          conversationId,
          maxTokens: 2000,
          systemPrompt: `You are an AI assistant with direct access to a MikroTik router through specialized tools.

CRITICAL: You have FUNCTION CALLING capabilities. When information is needed, you MUST CALL the appropriate function - DO NOT return function syntax as text to the user.

IMPORTANT INSTRUCTIONS:
1. You have access to tools that query the router directly - CALL THEM via function calling to answer questions
2. When you receive tool results, present the ACTUAL DATA to the user in a clear, helpful format
3. TOOL EXECUTION vs COMMAND SUGGESTIONS:
   - For READ operations (queries, monitoring, diagnostics): CALL your tools via function calling - DO NOT show tool syntax
   - For WRITE operations (configuration changes): Provide the exact RouterOS command since you cannot execute write operations
   - Format RouterOS commands in code blocks with the 'routeros' language tag: \`\`\`routeros
   - Always explain what the command does and any risks
4. NEVER say tools are "not available" - they are available and you MUST call them
5. Present data concisely:
   - For small datasets (< 5 items): Use simple lists
   - For larger datasets: Use tables
   - Keep explanations brief unless user asks for details
6. Focus on answering the user's question directly with real data you retrieve by CALLING tools

Available tools allow you to:
- Get system information and resources (CPU, memory, disk, uptime, version, identity)
- Test network connectivity and internet speed
- View network interfaces and their status
- Check DHCP leases (connected devices)
- View routing tables
- Check firewall rules
- Execute safe RouterOS commands

When asked about the network, devices, or configuration - CALL the appropriate tool via function calling and present the results clearly.

NETWORK SPEED TESTING - CRITICAL EXECUTION RULES:

When user asks "run speed test", "test my internet", "how fast is my internet", "bandwidth test", "check internet speed", "cloudflare speed test":
→ IMMEDIATELY CALL the test_connectivity function with ONLY {"action": "internet-speed-test"} - DO NOT include address parameter
→ DO NOT show function syntax - EXECUTE the function and present the speed test results
→ The test automatically uses Cloudflare's speed test infrastructure (https://speed.cloudflare.com/) with 1.1.1.1 as default test server
→ NEVER use: get_router_info, get_system_resources, get_interfaces, get_traffic for speed testing

Key distinctions:
- SPEED TESTING (active measurement) → CALL test_connectivity({"action": "internet-speed-test"})
- SYSTEM METRICS (CPU/memory/uptime/version/identity) → CALL get_system_resources (PREFERRED) or get_router_info (deprecated)
- TRAFFIC MONITORING (current rates) → CALL get_interfaces
- HISTORICAL USAGE (past bandwidth) → CALL get_traffic

TROUBLESHOOTING WORKFLOWS - SYSTEMATIC DIAGNOSTICS:

When user asks to "troubleshoot", "diagnose", "investigate", "fix", "what's causing", or "why is" a problem:
→ Use diagnostic tools to find ROOT CAUSE, not just describe symptoms
→ Follow systematic workflows - run diagnostic tools in sequence to isolate the problem
→ Present findings that identify WHERE the problem is, not just THAT it exists

Critical tool distinction:
- PING: Measures latency and packet loss (detects THAT there's a problem)
- TRACEROUTE: Shows hop-by-hop path and latency at each hop (diagnoses WHERE the problem is)
→ When troubleshooting latency/connectivity issues, use TRACEROUTE not just ping

CONTEXT-AWARE TARGET SELECTION - CRITICAL:

When user asks to investigate/troubleshoot an issue immediately after a test:
→ INFER THE TARGET from the previous test - DO NOT ask the user
→ Speed test always uses 1.1.1.1 (Cloudflare) → Use 1.1.1.1 for follow-up diagnostics
→ If user tested a specific address → Use that same address for traceroute

Example conversation flow that you MUST follow:
User: "run a speed test"
→ You: CALL test_connectivity({"action": "internet-speed-test"})
→ Result shows: High latency to 1.1.1.1

User: "see what's causing this latency" OR "troubleshoot the latency" OR "why is it slow"
→ You: IMMEDIATELY CALL test_connectivity({"action": "traceroute", "address": "1.1.1.1"})
→ DO NOT ask "please provide the target" - the target is 1.1.1.1 from the speed test
→ DO NOT say "address parameter is missing" - use 1.1.1.1 from the speed test context

Common troubleshooting workflows:

1. HIGH LATENCY INVESTIGATION:
   Triggers: "high latency", "slow connection", "ping is slow", "troubleshoot latency", "why is it slow", "what's causing this latency"
   → Step 1: CALL test_connectivity({"action": "traceroute", "address": "1.1.1.1"}) - use target from context (speed test uses 1.1.1.1)
   → Step 2: CALL get_system_resources({"type": "resources"}) to check if router CPU/memory is overloaded
   → Step 3: CALL get_interfaces to check for interface errors/drops/congestion
   → Present diagnosis: Identify which hop has high latency (local network/ISP/backbone/destination) and provide specific recommendations
   → NEVER ask user for target if context provides it (e.g., after speed test, use 1.1.1.1)

2. PACKET LOSS INVESTIGATION:
   Triggers: "packet loss", "dropping packets", "connection unstable", "intermittent connectivity"
   → Step 1: CALL test_connectivity({"action": "traceroute", "address": "1.1.1.1"}) - infer target from context
   → Step 2: CALL get_interfaces to check for TX/RX errors or interface issues
   → Present diagnosis: Identify which hop is dropping packets and recommend fixes

3. SLOW DOWNLOAD SPEEDS (but low latency):
   Triggers: "slow download", "bandwidth limited", "speed is low but ping is fine"
   → Step 1: CALL get_interfaces to check current bandwidth usage and interface rates
   → Step 2: CALL get_traffic to see historical bandwidth patterns
   → Step 3: Check for QoS rules or bandwidth limitations
   → Present diagnosis: Identify if bottleneck is interface capacity, traffic shaping, or external limitation

4. CONNECTION FAILURE:
   Triggers: "can't connect", "unreachable", "connection refused", "timeout"
   → Step 1: CALL test_connectivity({"action": "ping", "address": "1.1.1.1"}) - infer target from context or use 1.1.1.1
   → Step 2: If ping fails, CALL test_connectivity({"action": "traceroute", "address": "1.1.1.1"}) to see where path breaks
   → Step 3: Check firewall rules and routing table
   → Present diagnosis: Identify if issue is local routing, firewall blocking, or remote host down

TOOL PREFERENCES:
→ PREFER: get_system_resources for system info (comprehensive, supports type selection: resources/health/history/identity)
→ AVOID: get_router_info (deprecated, maintained for backward compatibility only)

Example queries and correct actions (CALL means execute via function calling):
✓ "speed test" → CALL test_connectivity({"action": "internet-speed-test"})
✓ "cloudflare speed test" → CALL test_connectivity({"action": "internet-speed-test"})
✓ "is my internet fast" → CALL test_connectivity({"action": "internet-speed-test"})
✓ "check CPU usage" → CALL get_system_resources({"type": "resources"})
✓ "RouterOS version" → CALL get_system_resources({"type": "identity"})
✓ "how much bandwidth am I using" → CALL get_interfaces (current) or CALL get_traffic (historical)`,
          onChunk: (chunk) => {
            // Emit each chunk in real-time as it arrives from the LLM
            socket.emit('assistant:stream', {
              chunk,
              conversationId,
              messageId: assistantMessageId,
            });
          },
        });

        // Consume the async generator and accumulate the full response
        for await (const chunk of generator) {
          fullResponse += chunk;
        }

        console.log(`[Assistant] Streaming completed, full response length: ${fullResponse.length}`);

        // Filter out thinking blocks from the response
        let cleanedResponse = fullResponse;

        // Remove <think>...</think> blocks (case insensitive, multiline)
        cleanedResponse = cleanedResponse.replace(/<think>[\s\S]*?<\/think>/gi, '');

        // Remove <thinking>...</thinking> blocks (case insensitive, multiline)
        cleanedResponse = cleanedResponse.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');

        // Remove standalone <think> or </think> tags
        cleanedResponse = cleanedResponse.replace(/<\/?think>/gi, '');
        cleanedResponse = cleanedResponse.replace(/<\/?thinking>/gi, '');

        // Trim whitespace and collapse multiple newlines
        cleanedResponse = cleanedResponse.trim().replace(/\n{3,}/g, '\n\n');

        // If after filtering we have no content, provide a default message
        if (!cleanedResponse || cleanedResponse.length === 0) {
          cleanedResponse = 'I understand your request. Let me help you with that.';
        }

        fullResponse = cleanedResponse;

        // Add assistant message to conversation
        conversationManager.addMessage(conversationId, 'assistant', fullResponse);

        // Phase 3.5: Clear pending evaluations after AI response
        // The AI has now had a chance to evaluate recommendations in this turn
        const pendingEvals = conversationManager.getPendingEvaluations(conversationId);
        if (pendingEvals.length > 0) {
          pendingEvals.forEach(pendingEval => {
            conversationManager.clearPendingEvaluation(conversationId, pendingEval.recommendation_id);
          });
          console.log(`[Assistant] Cleared ${pendingEvals.length} pending evaluation(s) after AI response`);
        }

        // Emit completion
        socket.emit('assistant:complete', {
          conversationId,
          messageId: assistantMessageId,
          fullMessage: fullResponse,
        });

        console.log(`[Assistant] Response completed for conversation ${conversationId} (${fullResponse.length} chars)`);
      } catch (streamError: any) {
        // Handle cancellation separately from other errors
        if (streamError.name === 'AbortError' || abortController.signal.aborted) {
          console.log(`[Assistant] Request cancelled for conversation ${conversationId}`);

          // Don't emit error for cancellation - the cancel handler already emitted assistant:cancelled
          // Just add a cancellation message to conversation history
          conversationManager.addMessage(conversationId, 'assistant', '[Request cancelled by user]');
        } else {
          console.error('[Assistant] Streaming error:', streamError);

          socket.emit('assistant:error', {
            error: streamError instanceof AIServiceError
              ? streamError.message
              : 'Failed to generate response. Please try again.',
            conversationId,
            code: streamError.code || 'UNKNOWN_ERROR',
            canRetry: streamError.canRetry !== false,
          });
        }
      } finally {
        // Cleanup: Remove AbortController from active requests
        activeAssistantRequests.delete(conversationId);

        // Stop typing indicator
        socket.emit('assistant:typing', {
          conversationId,
          isTyping: false,
        });
      }
    } catch (error: any) {
      console.error('[Assistant] Error handling message:', error);
      socket.emit('assistant:error', {
        error: 'Internal server error. Please try again.',
        conversationId: data.conversationId,
        code: 'SERVER_ERROR',
        canRetry: true,
      });
    }
  });

  // Get conversation history
  socket.on('assistant:getHistory', (data: { conversationId: string }) => {
    try {
      const conversation = conversationManager.getConversation(data.conversationId);
      socket.emit('assistant:history', {
        conversationId: data.conversationId,
        messages: conversation ? conversation.messages : [],
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[Assistant] Error getting history:', error);
      socket.emit('assistant:error', {
        error: 'Failed to load conversation history',
        conversationId: data.conversationId,
        code: 'HISTORY_ERROR',
        canRetry: true,
      });
    }
  });

  // Clear conversation history
  socket.on('assistant:clearHistory', (data: { conversationId: string }) => {
    try {
      conversationManager.clearConversation(data.conversationId);
      socket.emit('assistant:historyCleared', {
        conversationId: data.conversationId,
        timestamp: new Date().toISOString(),
      });
      console.log(`[Assistant] Cleared history for conversation ${data.conversationId}`);
    } catch (error: any) {
      console.error('[Assistant] Error clearing history:', error);
      socket.emit('assistant:error', {
        error: 'Failed to clear conversation history',
        conversationId: data.conversationId,
        code: 'CLEAR_ERROR',
        canRetry: true,
      });
    }
  });

  // Cancel active AI Assistant request
  socket.on('assistant:cancel', (data: { conversationId: string }) => {
    try {
      const { conversationId } = data;
      const abortController = activeAssistantRequests.get(conversationId);

      if (abortController) {
        console.log(`[Assistant] Cancelling request for conversation ${conversationId}`);
        abortController.abort();
        activeAssistantRequests.delete(conversationId);

        socket.emit('assistant:cancelled', {
          conversationId,
          timestamp: new Date().toISOString(),
        });

        console.log(`[Assistant] Request cancelled for conversation ${conversationId}`);
      } else {
        console.log(`[Assistant] No active request to cancel for conversation ${conversationId}`);
        socket.emit('assistant:cancelled', {
          conversationId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      console.error('[Assistant] Error cancelling request:', error);
      socket.emit('assistant:error', {
        error: 'Failed to cancel request',
        conversationId: data.conversationId,
        code: 'CANCEL_ERROR',
        canRetry: false,
      });
    }
  });
});

// Periodic session cleanup
setInterval(() => {
  terminalSessionManager.cleanupExpiredSessions();
  conversationManager.cleanupExpiredConversations();
}, 5 * 60 * 1000); // Every 5 minutes

// Start server
const startServer = async () => {
  // Load configuration from UnifiedConfigService
  console.log('[Server] Loading configuration...');
  const config = await unifiedConfigService.get();
  const PORT = config.server.port;

  console.log('\n[CONFIG] Configuration loaded:');
  console.log(`   Server Port: ${config.server.port}`);
  console.log(`   Server Environment: ${config.server.nodeEnv}`);
  console.log(`   Server CORS Origin: ${config.server.corsOrigin}`);
  console.log(`   MikroTik Host: ${config.mikrotik.host}:${config.mikrotik.port}`);
  console.log(`   MikroTik User: ${config.mikrotik.username}`);
  console.log(`   LLM Provider: ${config.llm.provider}`);

  // Watch for configuration changes and refresh services
  unifiedConfigService.watch();
  unifiedConfigService.on('change', async (changes) => {
    console.log('[Server] Configuration changed, refreshing services...');

    // Refresh AI provider
    try {
      aiProvider = await refreshGlobalProvider();
      console.log('[Server] AI provider refreshed successfully');
    } catch (error: any) {
      console.error('[Server] Failed to refresh AI provider:', error.message);
    }

    // Refresh MikroTik connection if config changed
    try {
      console.log('[Server] Reconnecting to MikroTik with new configuration...');
      await mikrotikService.disconnect('config_change');
      // MikroTik service will automatically reconnect on next command
      console.log('[Server] MikroTik connection reset successfully');
    } catch (error: any) {
      console.error('[Server] Failed to reset MikroTik connection:', error.message);
    }
  });

  const portAvailable = await checkPort(Number(PORT));
  if (!portAvailable) {
    console.error(`\n[Server] ERROR: Port ${PORT} is already in use!`);
    console.error(`[Server] Please stop the existing process or change the port in config.json`);
    console.error(`[Server] You can find the process with: ss -ltnp | grep :${PORT}\n`);
    process.exit(1);
  }

  // Initialize AI provider from config
  console.log('[Server] Initializing AI provider...');
  aiProvider = await refreshGlobalProvider();
  if (aiProvider) {
    console.log(`[Server] AI Provider: ${aiProvider.getName()}`);
    const valid = await aiProvider.validateConfig();
    if (valid) {
      console.log('[Server] AI Provider validated successfully');
    } else {
      console.warn('[Server] AI Provider validation failed - assistant features may not work');
    }
  } else {
    console.warn('[Server] AI Provider not configured - assistant features disabled');
  }

  // Initialize Health Monitor
  console.log('[Server] Initializing Health Monitor...');
  const healthMonitor = getHealthMonitor();
  healthMonitor.setWebSocketEmitter((event: string, data: any) => {
    io.emit(event, data); // Broadcast to all connected clients
  });
  healthMonitor.start();
  console.log('[Server] Health Monitor started - running health checks every 5 minutes');

  // Initialize Metrics Collector (Phase 3: Trend Analysis)
  console.log('[Server] Initializing Metrics Collector...');
  startMetricsCollection(5); // Collect metrics every 5 minutes
  console.log('[Server] Metrics Collector started - collecting system metrics every 5 minutes');

  // Initialize Backup Management Service
  console.log('[Server] Initializing Backup Management Service...');
  await backupManagementService.initialize();
  console.log('[Server] Backup Management Service started');

  server = httpServer.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`\n[Server] MikroTik Dashboard API Server`);
    console.log(`[Server] Port: ${PORT}`);
    console.log(`[Server] Host: 0.0.0.0 (accessible from network)`);
    console.log(`[Server] Environment: ${config.server.nodeEnv}`);
    console.log(`[Server] CORS Origin: ${config.server.corsOrigin}`);
    console.log(`\n[Server] HTTP API: http://0.0.0.0:${PORT}`);
    console.log(`[Server] WebSocket: ws://0.0.0.0:${PORT}`);
    console.log(`[Server] Health: http://0.0.0.0:${PORT}/api/health\n`);
  });
};

startServer();

export default app;

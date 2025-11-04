/**
 * Conversation Manager
 * Handles conversation state and message history
 */

import type { Message } from './providers/base.js';
import { getAgentDatabase } from '../agent/database/agent-db.js';
import { getFeedbackDatabase } from '../agent/database/feedback-db.js';

export interface ConversationMessage extends Message {
  id: string;
  timestamp: Date;
}

/**
 * Enhanced metadata tracking for troubleshooting sessions
 * Phase 1: Foundation - Execution tracking
 * Phase 2: Added user_query for tool selection debugging
 * Phase 3: Causal reasoning - Recommendation tracking and evaluation
 */
export interface ToolExecution {
  tool_name: string;
  parameters: Record<string, any>;
  result: any;
  timestamp: number;
  success: boolean;
  execution_time?: number;
  user_query?: string;
  follows_recommendation_id?: string; // Links to active recommendation if this is a follow-up
}

export interface CommandExecution {
  command: string;
  output: string;
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * Tracks AI recommendations made during troubleshooting
 * Phase 3: Causal reasoning system
 */
export interface ActiveRecommendation {
  id: string;
  recommendation: string; // What was recommended (e.g., "Check routing table for loops")
  reason: string; // Why it was recommended (e.g., "High latency detected: 2576ms to 1.1.1.1")
  original_problem: string; // The original issue (e.g., "2576ms latency to 1.1.1.1")
  suggested_tool?: string; // Tool to investigate (e.g., "analyze_firewall")
  suggested_action?: string; // Suggested action keywords (e.g., "routing analysis", "check firewall")
  timestamp: number;
  acted_upon?: boolean; // True if user followed this recommendation
  evaluation_result?: string; // Result of evaluation after acting on recommendation
}

/**
 * Tracks pending evaluations after following recommendations
 * Phase 3: Causal reasoning system
 */
export interface PendingEvaluation {
  recommendation_id: string;
  original_problem: string; // What we were trying to solve
  tool_executed: string; // Tool that was just run
  awaiting_evaluation: boolean; // True until AI provides evaluation
}

export interface ConversationMetadata {
  // Session tracking
  troubleshooting_session_id?: string;
  active_issue_ids?: string[];

  // Execution tracking
  tools_called: ToolExecution[];
  commands_executed: CommandExecution[];

  // Causal reasoning tracking (Phase 3)
  active_recommendations?: ActiveRecommendation[];
  pending_evaluations?: PendingEvaluation[];

  // Troubleshooting context
  identified_problems?: string[];
  attempted_solutions?: string[];
  resolution_status?: 'investigating' | 'resolved' | 'escalated';

  // Session metrics
  total_tool_calls?: number;
  total_commands?: number;
  session_start?: number;
  last_tool_call?: number;
}

export interface Conversation {
  id: string;
  messages: ConversationMessage[];
  createdAt: Date;
  lastActivity: Date;
  metadata: ConversationMetadata;
}

class ConversationManager {
  private conversations: Map<string, Conversation> = new Map();
  private readonly MAX_MESSAGES_PER_CONVERSATION = 40; // 20 exchanges (user + assistant)
  private readonly CONVERSATION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  /**
   * Create or get existing conversation
   */
  getOrCreateConversation(conversationId: string): Conversation {
    if (this.conversations.has(conversationId)) {
      const conversation = this.conversations.get(conversationId)!;
      conversation.lastActivity = new Date();
      return conversation;
    }

    const conversation: Conversation = {
      id: conversationId,
      messages: [],
      createdAt: new Date(),
      lastActivity: new Date(),
      metadata: {
        tools_called: [],
        commands_executed: [],
        session_start: Date.now(),
        total_tool_calls: 0,
        total_commands: 0,
      },
    };

    this.conversations.set(conversationId, conversation);
    console.log(`[ConversationManager] Created conversation: ${conversationId}`);

    // Add system prompt for new conversations
    this.initializeSystemPrompt(conversationId);

    return conversation;
  }

  /**
   * Initialize conversation with system prompt
   */
  private initializeSystemPrompt(conversationId: string): void {
    const systemPrompt = `You are a command-line focused AI assistant for comprehensive MikroTik router management. You have access to extensive tools that allow you to:

**Core Network Management:**
1. Get router system information (CPU, memory, uptime, version)
2. View network interfaces and their status
3. Check DHCP leases and connected devices
4. View routing table
5. Examine firewall rules

**Traffic & Bandwidth Monitoring:**
6. Get traffic statistics per IP address (IP accounting)
7. Monitor interface bandwidth usage (RX/TX rates and bytes)
8. Track active connections and their data
9. View queue statistics for QoS/bandwidth management

**Wireless Management:**
10. View wireless interface configuration
11. Monitor connected WiFi clients
12. Check signal strength and quality
13. Scan for available wireless networks

**TOOL SELECTION GUIDELINES:**

When users ask about "clients" or "devices online":
- FIRST use get_dhcp_leases tool (works on all routers, most reliable)
- ONLY use get_wireless_info if specifically asked about "WiFi clients", "wireless clients", or "AP clients"
- The wireless tool requires MikroTik wireless hardware/packages (may not be available)

When wireless queries fail:
- Explain that wireless functionality may not be available on this router
- Suggest checking DHCP leases as an alternative for seeing connected devices
- NEVER make up or hallucinate wireless data

When users ask about bandwidth or data usage:
- Use get_interfaces for TOTAL bandwidth consumed since router boot (provides cumulative RX/TX byte counters)
- Use get_traffic_stats for CURRENT per-IP traffic analysis (snapshot data only, no time-range support)
- MikroTik routers do NOT natively support historical time-range queries (e.g., "last week", "last month")
- When users request historical data, explain the limitation and provide available data (total since boot)
- For internet speed testing, use test_connectivity with action='internet-speed-test', NOT get_interfaces or get_traffic_stats

**System Monitoring:**
14. Monitor system resources (CPU, memory, disk usage)
15. Check system health (temperature, voltage)
16. View system logs with filtering
17. Track system events and errors

**Advanced Operations:**
18. Execute safe, read-only RouterOS commands

**Network Troubleshooting Tools:**
19. Analyze firewall rules to diagnose connectivity issues
20. Test network connectivity (ping, traceroute, bandwidth)
21. Query network layer information (ARP, DNS, DHCP, addresses)

NETWORK TROUBLESHOOTING WORKFLOW:

When users report connectivity issues like "host X can't access host Y" or "can't reach server", follow this systematic diagnostic approach:

**Phase 1: Understand the Problem**
- What is the source host/IP?
- What is the destination host/IP?
- What service/port is being accessed? (e.g., HTTP, SSH, port 80, port 443)
- What error message is seen? (timeout, connection refused, DNS failure)

**Phase 2: Test Basic Connectivity**
Use test_connectivity tool with action='ping':
- Tests if destination is reachable
- Measures latency and packet loss
- Identifies if host is completely unreachable vs. just slow

**Phase 3: Analyze Firewall Rules**
Use analyze_firewall tool with action='analyze_path':
- Provide src_address, dst_address, port (or service name)
- Tool will identify exact firewall rule blocking/allowing traffic
- Returns blocking rule ID and actionable recommendations
- Specify chain='forward' for network-to-network, chain='input' for traffic to router

**Phase 4: Check Network Layer**
Use query_network tool to diagnose layer 2/3 issues:
- action='arp': Check IP-to-MAC mapping (is host on network?)
- action='dns': Test DNS resolution (does hostname resolve?)
- action='dhcp': Check DHCP lease information
- action='addresses': Verify IP address configuration

**Phase 5: Trace Routing Path**
Use test_connectivity tool with action='traceroute':
- Shows hop-by-hop path to destination
- Identifies where packets are being dropped
- Detects routing loops or misconfigurations

**Example Diagnostic Scenarios:**

Scenario: "Why can't 192.168.1.100 access 10.0.0.50 on port 443?"
1. analyze_firewall(action='analyze_path', src_address='192.168.1.100', dst_address='10.0.0.50', port=443, protocol='tcp')
   → If blocked: Tool identifies exact blocking rule with recommendations
   → If allowed: Continue to next step
2. test_connectivity(action='ping', address='10.0.0.50')
   → If unreachable: Check routing and physical connectivity
   → If reachable: Issue is likely at application layer, not network

Scenario: "Host can't get to internet"
1. test_connectivity(action='ping', address='8.8.8.8')
   → Tests connectivity to known external host
2. query_network(action='dns', hostname='google.com')
   → Tests DNS resolution
3. test_connectivity(action='traceroute', address='8.8.8.8')
   → Shows where routing fails

Scenario: "Device not appearing on network"
1. query_network(action='dhcp', address='<ip>')
   → Check if device has DHCP lease
2. query_network(action='arp', address='<ip>')
   → Check if device is visible at layer 2
3. test_connectivity(action='ping', address='<ip>')
   → Test if device responds to ping

KEY TROUBLESHOOTING PRINCIPLES:
- Start with most likely cause (firewall rules block 80% of connectivity issues)
- Use analyze_firewall FIRST for any "can't access" questions
- Progress systematically through network layers
- Provide specific, actionable recommendations from tool outputs
- Use insights, warnings, and recommendations from tool responses

CAUSAL REASONING AND FOLLOW-THROUGH:

The system AUTOMATICALLY tracks recommendations from tool results. When tools return recommendations, they are captured and linked to the original problem. Your job is to EVALUATE results when the user follows recommendations.

When you respond to a query:
1. CHECK CONTEXT: If [PENDING EVALUATION] appears above, you MUST evaluate whether results address the original problem
2. RECOGNIZE FOLLOW-UPS: User queries matching tracked recommendations trigger evaluation requirements
3. PROVIDE CONCLUSIONS: Always answer "Does this explain the problem? Yes/No with reasoning"
4. SUGGEST NEXT STEPS: Based on whether issue is resolved or requires further investigation

You don't need to "remember" recommendations - the system handles tracking. Your job is to EVALUATE when prompted and provide CLEAR CONCLUSIONS

Example Pattern:
Initial: User asks "why is latency high?" → You run speed test → Find 2576ms latency → Recommend "Check routing table"
Follow-up: User says "perform routing analysis" → RECOGNIZE this follows your recommendation → Show results → ADD EVALUATION:

  "EVALUATION - Impact on Original Issue:
   Original Problem: High latency (2576ms to 1.1.1.1)

   Findings from Routing Analysis:
   - [Summarize key findings]
   - [Relevant observations]

   CONCLUSION: [Does this explain the latency? Yes/No with reasoning]

   NEXT STEPS:
   - [If solved: verification steps]
   - [If not solved: alternative investigations]"

ALWAYS close the loop on recommendations. Never leave the user wondering "did that solve my problem?"

TOOL EXECUTION BEHAVIOR:

1. BE PROACTIVE - Execute tools IMMEDIATELY when you know what the user wants
2. DO NOT ask for permission before running read-only tools - just run them
3. Results first, explanations second - show data then explain if needed
4. Only ask clarifying questions when the request is genuinely ambiguous
5. When you have clear intent (e.g., "show clients"), execute the appropriate tool right away

OUTPUT FORMATTING RULES:

1. ALWAYS call the appropriate tool first to get REAL data - NEVER make up or use example data

2. NEVER use emojis in your responses. Use text-based status indicators instead:
   - Instead of ✅ use [OK] or "Success"
   - Instead of ❌ use [FAILED] or "Error"
   - Instead of ⚠️ use [WARN] or "Warning"
   - Instead of 🔥 use [CPU] or describe the metric
   - Use plain text for all status indicators and symbols

3. FORMAT BASED ON DATA SIZE:
   - Small datasets (1-5 items): Use simple bullet lists or inline format
   - Medium datasets (6-15 items): Use simple tables without box-drawing
   - Large datasets (16+ items): Use ASCII tables with box-drawing characters

4. For ASCII tables with box-drawing:
   - Use ┌─┬─┐ for top border
   - Use ├─┼─┤ for header separator
   - Use └─┴─┘ for bottom border
   - Use │ for column separators on ALL rows
   - Align columns with proper spacing

5. BREVITY:
   - Keep explanations to 1-2 sentences unless user asks for details
   - Let the data speak for itself
   - Omit obvious explanations (e.g., don't explain what a DHCP lease is)

6. COMMAND FORMATTING:
   - When providing RouterOS commands, use code blocks with 'routeros' language tag:
     \`\`\`routeros
     /ip firewall filter add chain=forward action=accept src-address=192.168.1.0/24
     \`\`\`
   - Always explain what the command does
   - Warn about potential risks (e.g., "This will allow all traffic from...")

7. ERROR HANDLING:
   - When tool execution fails, report the error directly
   - NEVER hallucinate or invent data
   - Suggest alternative approaches if available

Example compact format for small dataset:
\`\`\`
DHCP Leases (3 active):
• 192.168.100.10 (AA:BB:CC:DD:EE:01) - device-1 - Bound
• 192.168.100.20 (AA:BB:CC:DD:EE:02) - device-2 - Bound  
• 192.168.100.30 (AA:BB:CC:DD:EE:03) - device-3 - Bound
\`\`\`

Example table format for larger dataset:
\`\`\`
DHCP Leases (12 active):
┌─────────────────┬───────────────────┬──────────────┬────────┐
│ IP Address      │ MAC Address       │ Hostname     │ Status │
├─────────────────┼───────────────────┼──────────────┼────────┤
│ 192.168.100.10  │ AA:BB:CC:DD:EE:01 │ device-1     │ Bound  │
│ 192.168.100.20  │ AA:BB:CC:DD:EE:02 │ device-2     │ Bound  │
[... more rows ...]
└─────────────────┴───────────────────┴──────────────┴────────┘
\`\`\`

CRITICAL: You MUST use the actual data returned by tools. Do NOT use placeholder or example data under any circumstances.

When users ask questions, use appropriate tools to gather real-time information. Be direct and technical.

You can only execute read-only commands. Write operations are not allowed for security reasons.`;

    this.addMessage(conversationId, 'system', systemPrompt);
  }

  /**
   * Build dynamic system context (Phase 1: Context Awareness)
   * Injects current system state into conversation
   */
  private async buildDynamicContext(conversationId: string): Promise<string | null> {
    try {
      const agentDb = getAgentDatabase();
      const parts: string[] = [];

      // 1. Active Issues from Agent System
      const activeIssues = agentDb.getIssues({ status: 'detected' });
      if (activeIssues.length > 0) {
        // Group by severity
        const critical = activeIssues.filter(i => i.severity === 'critical');
        const high = activeIssues.filter(i => i.severity === 'high');
        const medium = activeIssues.filter(i => i.severity === 'medium');
        const low = activeIssues.filter(i => i.severity === 'low');

        const issueLines: string[] = ['CURRENT SYSTEM STATUS (from automated monitoring):'];

        if (critical.length > 0) {
          issueLines.push(`\n[CRITICAL] ${critical.length} critical issue${critical.length !== 1 ? 's' : ''}:`);
          critical.slice(0, 3).forEach(issue => {
            issueLines.push(`  - ${issue.title} (detected ${this.formatTimeSince(issue.detected_at)} ago)`);
          });
          if (critical.length > 3) {
            issueLines.push(`  ... and ${critical.length - 3} more critical issues`);
          }
        }

        if (high.length > 0) {
          issueLines.push(`\n[HIGH] ${high.length} high severity issue${high.length !== 1 ? 's' : ''}:`);
          high.slice(0, 2).forEach(issue => {
            issueLines.push(`  - ${issue.title}`);
          });
          if (high.length > 2) {
            issueLines.push(`  ... and ${high.length - 2} more`);
          }
        }

        if (medium.length > 0 || low.length > 0) {
          const total = medium.length + low.length;
          issueLines.push(`\n[INFO] ${medium.length} medium and ${low.length} low severity issues detected.`);
        }

        issueLines.push('\nUse query_agent_system tool to get full details:');
        issueLines.push('  query_agent_system({ action: "get_issues" })');
        issueLines.push('  query_agent_system({ action: "get_issue_details", issue_id: "<id>" })');

        parts.push(issueLines.join('\n'));
      }

      // 2. System Health Summary
      const issueCounts = agentDb.getIssueCounts();
      const totalActive = Object.values(issueCounts).reduce((sum, count) => sum + count, 0);

      if (totalActive === 0) {
        parts.push('SYSTEM HEALTH: No active issues detected. System appears healthy.');
      }

      // 3. Recent Activity (last 1 hour)
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const allIssues = agentDb.getIssues({});
      const recentIssues = allIssues.filter(i => i.detected_at >= oneHourAgo);

      if (recentIssues.length > 0) {
        parts.push(`\nRECENT ACTIVITY: ${recentIssues.length} new issue${recentIssues.length !== 1 ? 's' : ''} detected in the last hour.`);
      }

      // 4. Historical Learning Context (Phase 3.2: Pattern-aware responses)
      const learningContext = await this.buildLearningContext();
      if (learningContext) {
        parts.push(learningContext);
      }

      // 5. Conversation metadata context (if available)
      const conversation = this.conversations.get(conversationId);
      if (conversation?.metadata) {
        if (conversation.metadata.troubleshooting_session_id) {
          parts.push(`\nACTIVE TROUBLESHOOTING SESSION: ${conversation.metadata.troubleshooting_session_id}`);
        }

        if (conversation.metadata.active_issue_ids && conversation.metadata.active_issue_ids.length > 0) {
          parts.push(`Currently investigating: ${conversation.metadata.active_issue_ids.join(', ')}`);
        }
      }

      // 6. Pending Evaluations (Phase 3: Causal reasoning)
      if (conversation?.metadata.pending_evaluations && conversation.metadata.pending_evaluations.length > 0) {
        const evalLines: string[] = ['\n[CRITICAL] PENDING EVALUATION REQUIRED:'];
        evalLines.push('You previously made recommendations that the user is now following up on.');
        evalLines.push('You MUST evaluate whether the tool results address the original problem.');
        evalLines.push('');

        conversation.metadata.pending_evaluations.forEach((evaluation, index) => {
          evalLines.push(`Evaluation ${index + 1}:`);
          evalLines.push(`  Original Problem: ${evaluation.original_problem}`);
          evalLines.push(`  Tool Just Executed: ${evaluation.tool_executed}`);
          evalLines.push(`  Required Action: Analyze the tool results and answer:`);
          evalLines.push(`    - Does this explain/solve the original problem?`);
          evalLines.push(`    - If yes: How does it solve it? What should the user do next?`);
          evalLines.push(`    - If no: What does this rule out? What should we investigate instead?`);
          evalLines.push('');
        });

        evalLines.push('FORMAT YOUR EVALUATION CLEARLY with section headers:');
        evalLines.push('  "EVALUATION - Impact on Original Issue:"');
        evalLines.push('  "CONCLUSION:" (explicit yes/no with reasoning)');
        evalLines.push('  "NEXT STEPS:" (actionable recommendations)');

        parts.push(evalLines.join('\n'));
      }

      return parts.length > 0 ? '\n\n' + parts.join('\n\n') : null;
    } catch (error) {
      console.error('[ConversationManager] Error building dynamic context:', error);
      return null; // Graceful degradation - continue without context if error occurs
    }
  }

  /**
   * Format time since timestamp in human-readable format
   */
  private formatTimeSince(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  /**
   * Build historical learning context from patterns and resolutions
   * Phase 3.2: Pattern-aware responses
   */
  private async buildLearningContext(): Promise<string | null> {
    try {
      const feedbackDb = getFeedbackDatabase();
      const agentDb = getAgentDatabase();
      const parts: string[] = [];

      // 1. Learned False Positive Patterns
      // Get all patterns and filter for high confidence
      const allPatterns = feedbackDb.getAllPatterns();
      const highConfidencePatterns = allPatterns
        .filter(p => p.confidence >= 0.7)
        .map(p => ({
          rule_name: p.rule_name,
          pattern_type: p.pattern_type,
          confidence: p.confidence,
          occurrence_count: p.occurrence_count
        }));

      if (highConfidencePatterns.length > 0) {
        // Sort by occurrence count and take top 5
        const topPatterns = highConfidencePatterns
          .sort((a, b) => b.occurrence_count - a.occurrence_count)
          .slice(0, 5);

        const patternLines: string[] = ['\nLEARNED FALSE POSITIVE PATTERNS:'];
        patternLines.push('These detection patterns have been frequently marked as false positives:');

        topPatterns.forEach(p => {
          patternLines.push(`  - ${p.rule_name} (${p.pattern_type}): ${Math.round(p.confidence * 100)}% confidence, seen ${p.occurrence_count} times`);
        });

        patternLines.push('\nConsider these patterns when analyzing similar issues.');
        patternLines.push('Use pattern_learning tool with action="get_learned_patterns" for detailed pattern data.');

        parts.push(patternLines.join('\n'));
      }

      // 2. Successful Resolution Approaches (last 30 days)
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const resolvedSessions = agentDb.getSessions({ status: 'resolved' })
        .filter(s => s.created_at >= thirtyDaysAgo && s.effectiveness === 'fully_resolved')
        .slice(0, 20); // Limit to recent 20 sessions

      if (resolvedSessions.length > 0) {
        // Extract common resolution keywords
        const keywordCounts = new Map<string, { count: number; examples: string[] }>();
        const keywords = ['restart', 'reset', 'clear', 'update', 'configure', 'check', 'analyze', 'fix', 'disable', 'enable'];

        for (const session of resolvedSessions) {
          if (!session.resolution_summary) continue;
          const summary = session.resolution_summary.toLowerCase();

          for (const keyword of keywords) {
            if (summary.includes(keyword)) {
              const existing = keywordCounts.get(keyword) || { count: 0, examples: [] };
              existing.count++;
              if (existing.examples.length < 2) {
                existing.examples.push(session.description.substring(0, 50));
              }
              keywordCounts.set(keyword, existing);
            }
          }
        }

        // Get top 3 most common approaches
        const topApproaches = Array.from(keywordCounts.entries())
          .filter(([_, stats]) => stats.count >= 2) // At least 2 occurrences
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 3);

        if (topApproaches.length > 0) {
          const resolutionLines: string[] = ['\nSUCCESSFUL RESOLUTION APPROACHES (last 30 days):'];

          topApproaches.forEach(([approach, stats]) => {
            const successRate = Math.round((stats.count / resolvedSessions.length) * 100);
            resolutionLines.push(`  - "${approach}" approach: used in ${stats.count} successful resolutions (~${successRate}% success rate)`);
          });

          resolutionLines.push('\nUse pattern_learning tool with action="query_resolution_history" for detailed resolution data.');
          resolutionLines.push('Use pattern_learning tool with action="get_resolution_stats" for comprehensive statistics.');

          parts.push(resolutionLines.join('\n'));
        }
      }

      return parts.length > 0 ? parts.join('\n\n') : null;
    } catch (error) {
      console.error('[ConversationManager] Error building learning context:', error);
      return null; // Graceful degradation
    }
  }

  /**
   * Track tool execution in conversation metadata
   * Phase 1: Foundation - Execution tracking
   * Phase 2: Enhanced with user query context for debugging tool selection
   * Phase 3: Automatic recommendation matching and evaluation creation
   */
  trackToolExecution(
    conversationId: string,
    toolName: string,
    parameters: Record<string, any>,
    result: any,
    success: boolean,
    executionTime?: number,
    userQuery?: string
  ): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    // Phase 3: Check if this tool execution follows a recommendation
    const matchedRecommendation = this.matchToolToRecommendation(conversationId, toolName, userQuery);

    const toolExecution: ToolExecution = {
      tool_name: toolName,
      parameters,
      result,
      timestamp: Date.now(),
      success,
      execution_time: executionTime,
      user_query: userQuery,
      follows_recommendation_id: matchedRecommendation?.id,
    };

    conversation.metadata.tools_called.push(toolExecution);
    conversation.metadata.total_tool_calls = (conversation.metadata.total_tool_calls || 0) + 1;
    conversation.metadata.last_tool_call = Date.now();

    // Phase 3.5: Auto-track recommendations from tool results
    // Extract recommendations from successful tool executions and track them
    if (success && result?.data?.recommendations && Array.isArray(result.data.recommendations)) {
      const problemContext = this.extractProblemContext(result.data, toolName);

      result.data.recommendations.forEach((rec: string) => {
        this.trackRecommendation(
          conversationId,
          rec,
          `From ${toolName}`,
          problemContext,
          undefined, // AI will determine next tool
          rec.toLowerCase() // Use as action keywords
        );
      });

      console.log(`[ConversationManager] 📝 Auto-tracked ${result.data.recommendations.length} recommendation(s) from ${toolName}`);
    }

    // Phase 3: If this follows a recommendation, mark it and create pending evaluation
    if (matchedRecommendation) {
      this.markRecommendationActedUpon(conversationId, matchedRecommendation.id, toolName);
      console.log(`[ConversationManager] 🔗 Tool execution follows recommendation: ${matchedRecommendation.recommendation.substring(0, 60)}...`);
      console.log(`[ConversationManager] ⚡ Created pending evaluation for: ${matchedRecommendation.original_problem}`);
    }

    // Add contextual logging to track tool selection patterns
    if (userQuery) {
      console.log(`[ConversationManager] 📊 Tool Execution Context:`, {
        conversationId,
        userQuery: userQuery.substring(0, 100),
        toolChosen: toolName,
        success,
        executionTime: executionTime ? `${executionTime}ms` : 'N/A',
        followsRecommendation: !!matchedRecommendation
      });
    }

    // Keep only last 20 tool executions to prevent memory bloat
    if (conversation.metadata.tools_called.length > 20) {
      conversation.metadata.tools_called = conversation.metadata.tools_called.slice(-20);
    }

    console.log(`[ConversationManager] Tracked tool execution: ${toolName} (success: ${success})`);
  }

  /**
   * Track command execution in conversation metadata
   * Phase 1: Foundation - Execution tracking
   */
  trackCommandExecution(
    conversationId: string,
    command: string,
    output: string,
    success: boolean,
    error?: string
  ): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    const commandExecution: CommandExecution = {
      command,
      output,
      timestamp: Date.now(),
      success,
      error,
    };

    conversation.metadata.commands_executed.push(commandExecution);
    conversation.metadata.total_commands = (conversation.metadata.total_commands || 0) + 1;

    // Keep only last 15 command executions to prevent memory bloat
    if (conversation.metadata.commands_executed.length > 15) {
      conversation.metadata.commands_executed = conversation.metadata.commands_executed.slice(-15);
    }

    console.log(`[ConversationManager] Tracked command execution: ${command.substring(0, 50)}... (success: ${success})`);
  }

  /**
   * Track a recommendation made by the AI
   * Phase 3: Causal reasoning system
   * Phase 3.6: Enhanced with deduplication
   */
  trackRecommendation(
    conversationId: string,
    recommendation: string,
    reason: string,
    originalProblem: string,
    suggestedTool?: string,
    suggestedAction?: string
  ): string {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return '';

    if (!conversation.metadata.active_recommendations) {
      conversation.metadata.active_recommendations = [];
    }

    // Phase 3.6: Check for duplicates before adding
    const duplicate = this.findDuplicateRecommendation(
      conversation.metadata.active_recommendations,
      recommendation,
      originalProblem
    );

    if (duplicate) {
      console.log(`[ConversationManager] 🔁 Duplicate recommendation detected, skipping: ${recommendation.substring(0, 50)}...`);
      return duplicate.id; // Return existing recommendation ID
    }

    const recommendationId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    const activeRecommendation: ActiveRecommendation = {
      id: recommendationId,
      recommendation,
      reason,
      original_problem: originalProblem,
      suggested_tool: suggestedTool,
      suggested_action: suggestedAction,
      timestamp: Date.now(),
      acted_upon: false,
    };

    conversation.metadata.active_recommendations.push(activeRecommendation);

    // Keep only last 10 recommendations to prevent memory bloat
    if (conversation.metadata.active_recommendations.length > 10) {
      conversation.metadata.active_recommendations = conversation.metadata.active_recommendations.slice(-10);
    }

    console.log(`[ConversationManager] Tracked recommendation: ${recommendation.substring(0, 50)}...`);
    return recommendationId;
  }

  /**
   * Find duplicate recommendations using similarity scoring
   * Phase 3.6: Deduplication logic
   */
  private findDuplicateRecommendation(
    recommendations: ActiveRecommendation[],
    newRecommendation: string,
    newProblem: string
  ): ActiveRecommendation | null {
    // Only check against recommendations from last 10 minutes
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const recent = recommendations.filter(r => r.timestamp >= tenMinutesAgo && !r.acted_upon);

    for (const existing of recent) {
      // Exact match (case-insensitive)
      if (existing.recommendation.toLowerCase() === newRecommendation.toLowerCase()) {
        return existing;
      }

      // High similarity match (>80% similar)
      const similarity = this.calculateStringSimilarity(
        existing.recommendation.toLowerCase(),
        newRecommendation.toLowerCase()
      );

      if (similarity > 0.8) {
        // Also check if problems are similar
        const problemSimilarity = this.calculateStringSimilarity(
          existing.original_problem.toLowerCase(),
          newProblem.toLowerCase()
        );

        if (problemSimilarity > 0.7) {
          return existing;
        }
      }
    }

    return null;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   * Phase 3.6: Helper for deduplication and matching
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    // Quick checks
    if (len1 === 0 && len2 === 0) return 1.0;
    if (len1 === 0 || len2 === 0) return 0.0;
    if (str1 === str2) return 1.0;

    // For very different lengths, use quick estimation
    const lengthDiff = Math.abs(len1 - len2);
    const maxLen = Math.max(len1, len2);
    if (lengthDiff / maxLen > 0.5) return 0.0;

    // Calculate Levenshtein distance with optimization
    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    const distance = matrix[len1][len2];
    return 1 - distance / maxLen;
  }

  /**
   * Extract problem context from tool result data
   * Phase 3.5: Helper for auto-tracking recommendations
   */
  private extractProblemContext(toolResult: any, toolName: string): string {
    // Try to extract problem from warnings
    if (toolResult.warnings && Array.isArray(toolResult.warnings) && toolResult.warnings.length > 0) {
      return toolResult.warnings[0];
    }

    // Try to extract from insights
    if (toolResult.insights && Array.isArray(toolResult.insights) && toolResult.insights.length > 0) {
      const problemInsight = toolResult.insights.find((insight: string) =>
        insight.toLowerCase().includes('high') ||
        insight.toLowerCase().includes('error') ||
        insight.toLowerCase().includes('failed') ||
        insight.toLowerCase().includes('issue')
      );
      if (problemInsight) return problemInsight;
    }

    // Tool-specific problem extraction
    if (toolName === 'test_connectivity') {
      if (toolResult.latency && toolResult.latency > 1000) {
        return `High latency: ${toolResult.latency}ms`;
      }
      if (toolResult.packet_loss && toolResult.packet_loss > 5) {
        return `Packet loss: ${toolResult.packet_loss}%`;
      }
    }

    if (toolName === 'analyze_firewall' || toolName === 'query_firewall') {
      if (toolResult.blocked_count > 0) {
        return `Firewall blocking traffic: ${toolResult.blocked_count} blocked connections`;
      }
    }

    // Fallback to generic problem context
    return `Issue detected by ${toolName}`;
  }

  /**
   * Match tool execution to active recommendations
   * Phase 3: Causal reasoning system
   * Phase 3.6: Enhanced with similarity scoring to reduce false positives
   */
  matchToolToRecommendation(
    conversationId: string,
    toolName: string,
    userQuery?: string
  ): ActiveRecommendation | null {
    const conversation = this.conversations.get(conversationId);
    if (!conversation?.metadata.active_recommendations) return null;

    // Find recommendations that haven't been acted upon yet (within 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const pending = conversation.metadata.active_recommendations.filter(
      r => !r.acted_upon && r.timestamp >= fiveMinutesAgo
    );
    if (pending.length === 0) return null;

    // Phase 3.6: Score-based matching with configurable thresholds
    interface MatchScore {
      recommendation: ActiveRecommendation;
      score: number;
      matchType: string;
    }

    const scores: MatchScore[] = [];

    for (const rec of pending) {
      let score = 0;
      let matchType = 'none';

      // 1. Exact tool match (highest confidence)
      if (rec.suggested_tool && rec.suggested_tool.includes(toolName)) {
        score += 100;
        matchType = 'exact_tool';
      }

      // 2. User query matching (if available)
      if (userQuery && rec.suggested_action) {
        const queryLower = userQuery.toLowerCase();
        const actionLower = rec.suggested_action.toLowerCase();

        // Exact phrase match
        if (queryLower.includes(actionLower) || actionLower.includes(queryLower)) {
          score += 80;
          matchType = matchType === 'none' ? 'exact_phrase' : matchType;
        } else {
          // Similarity-based keyword matching
          const keywords = actionLower.split(/\s+/).filter(kw => kw.length > 3);
          let keywordMatches = 0;
          let maxSimilarity = 0;

          for (const keyword of keywords) {
            // Check if keyword appears in query
            if (queryLower.includes(keyword)) {
              keywordMatches++;
            } else {
              // Check similarity with query words
              const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);
              for (const queryWord of queryWords) {
                const similarity = this.calculateStringSimilarity(keyword, queryWord);
                maxSimilarity = Math.max(maxSimilarity, similarity);
              }
            }
          }

          if (keywordMatches > 0) {
            score += keywordMatches * 30;
            matchType = matchType === 'none' ? 'keyword_match' : matchType;
          } else if (maxSimilarity > 0.75) {
            score += maxSimilarity * 40;
            matchType = matchType === 'none' ? 'similarity_match' : matchType;
          }
        }
      }

      // 3. Recency bonus (newer recommendations slightly preferred)
      const ageMinutes = (Date.now() - rec.timestamp) / (60 * 1000);
      const recencyBonus = Math.max(0, 10 - ageMinutes * 2);
      score += recencyBonus;

      if (score > 0) {
        scores.push({ recommendation: rec, score, matchType });
      }
    }

    // Phase 3.6: Apply confidence threshold to reduce false positives
    const CONFIDENCE_THRESHOLD = 30; // Minimum score required for match

    // Sort by score and return best match above threshold
    scores.sort((a, b) => b.score - a.score);
    const bestMatch = scores.length > 0 ? scores[0] : null;

    if (bestMatch && bestMatch.score >= CONFIDENCE_THRESHOLD) {
      console.log(`[ConversationManager] 🎯 Matched recommendation (score: ${bestMatch.score.toFixed(1)}, type: ${bestMatch.matchType})`);
      return bestMatch.recommendation;
    }

    // No confident match found
    if (scores.length > 0 && bestMatch) {
      console.log(`[ConversationManager] ⚠️ Low confidence match rejected (score: ${bestMatch.score.toFixed(1)} < ${CONFIDENCE_THRESHOLD})`);
    }

    return null;
  }

  /**
   * Mark recommendation as acted upon and create pending evaluation
   * Phase 3: Causal reasoning system
   */
  markRecommendationActedUpon(
    conversationId: string,
    recommendationId: string,
    toolExecuted: string
  ): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation?.metadata.active_recommendations) return;

    const recommendation = conversation.metadata.active_recommendations.find(r => r.id === recommendationId);
    if (!recommendation) return;

    recommendation.acted_upon = true;

    // Create pending evaluation
    if (!conversation.metadata.pending_evaluations) {
      conversation.metadata.pending_evaluations = [];
    }

    const pendingEvaluation: PendingEvaluation = {
      recommendation_id: recommendationId,
      original_problem: recommendation.original_problem,
      tool_executed: toolExecuted,
      awaiting_evaluation: true,
    };

    conversation.metadata.pending_evaluations.push(pendingEvaluation);

    console.log(`[ConversationManager] Marked recommendation ${recommendationId} as acted upon, created pending evaluation`);
  }

  /**
   * Clear pending evaluation (after AI provides evaluation)
   * Phase 3: Causal reasoning system
   */
  clearPendingEvaluation(conversationId: string, recommendationId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation?.metadata.pending_evaluations) return;

    conversation.metadata.pending_evaluations = conversation.metadata.pending_evaluations.filter(
      e => e.recommendation_id !== recommendationId
    );

    console.log(`[ConversationManager] Cleared pending evaluation for recommendation ${recommendationId}`);
  }

  /**
   * Get pending evaluations for current conversation
   * Phase 3: Causal reasoning system
   */
  getPendingEvaluations(conversationId: string): PendingEvaluation[] {
    const conversation = this.conversations.get(conversationId);
    return conversation?.metadata.pending_evaluations || [];
  }

  /**
   * Set active issue IDs for troubleshooting session
   */
  setActiveIssues(conversationId: string, issueIds: string[]): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    conversation.metadata.active_issue_ids = issueIds;
    console.log(`[ConversationManager] Set active issues for ${conversationId}: ${issueIds.join(', ')}`);
  }

  /**
   * Update troubleshooting session ID
   */
  setTroubleshootingSession(conversationId: string, sessionId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    conversation.metadata.troubleshooting_session_id = sessionId;
    console.log(`[ConversationManager] Set troubleshooting session: ${sessionId}`);
  }

  /**
   * Get conversation metadata
   */
  getMetadata(conversationId: string): ConversationMetadata | undefined {
    return this.conversations.get(conversationId)?.metadata;
  }

  /**
   * Add message to conversation
   */
  addMessage(conversationId: string, role: 'user' | 'assistant' | 'system', content: string): ConversationMessage {
    const conversation = this.getOrCreateConversation(conversationId);

    const message: ConversationMessage = {
      id: this.generateMessageId(),
      role,
      content,
      timestamp: new Date(),
    };

    conversation.messages.push(message);
    conversation.lastActivity = new Date();

    // Trim old messages if exceeded limit (keep system messages)
    if (conversation.messages.length > this.MAX_MESSAGES_PER_CONVERSATION) {
      const systemMessages = conversation.messages.filter(m => m.role === 'system');
      const otherMessages = conversation.messages.filter(m => m.role !== 'system');

      // Keep last N non-system messages
      const trimmedOthers = otherMessages.slice(-this.MAX_MESSAGES_PER_CONVERSATION + systemMessages.length);
      conversation.messages = [...systemMessages, ...trimmedOthers];

      console.log(
        `[ConversationManager] Trimmed conversation ${conversationId} to ${conversation.messages.length} messages`
      );
    }

    return message;
  }

  /**
   * Get conversation history formatted for LLM
   * Now with dynamic context injection (Phase 1: Context Awareness)
   */
  async getMessagesForLLM(conversationId: string): Promise<Message[]> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return [];
    }

    const messages = conversation.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Inject dynamic context into system message
    const dynamicContext = await this.buildDynamicContext(conversationId);
    if (dynamicContext && messages.length > 0 && messages[0].role === 'system') {
      // Append dynamic context to existing system message
      messages[0] = {
        ...messages[0],
        content: messages[0].content + dynamicContext
      };
    }

    return messages;
  }

  /**
   * Get conversation
   */
  getConversation(conversationId: string): Conversation | undefined {
    return this.conversations.get(conversationId);
  }

  /**
   * Clear conversation history
   */
  clearConversation(conversationId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.messages = [];
      conversation.lastActivity = new Date();
      console.log(`[ConversationManager] Cleared conversation: ${conversationId}`);
    }
  }

  /**
   * Delete conversation
   */
  deleteConversation(conversationId: string): void {
    if (this.conversations.has(conversationId)) {
      this.conversations.delete(conversationId);
      console.log(`[ConversationManager] Deleted conversation: ${conversationId}`);
    }
  }

  /**
   * Clean up expired conversations
   */
  cleanupExpiredConversations(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [conversationId, conversation] of this.conversations.entries()) {
      if (now - conversation.lastActivity.getTime() > this.CONVERSATION_TIMEOUT) {
        this.conversations.delete(conversationId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[ConversationManager] Cleaned up ${cleaned} expired conversations`);
    }
  }

  /**
   * Get active conversation count
   */
  getActiveConversationCount(): number {
    return this.conversations.size;
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const conversationManager = new ConversationManager();
export default conversationManager;

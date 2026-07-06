import React, { useState, useEffect } from 'react';
import { Slider, Alert, Spin, message } from 'antd';
import { SettingsSection } from '../../components/organisms/SettingsSection/SettingsSection';
import { FormField } from '../../components/molecules/FormField/FormField';
import { Input } from '../../components/atoms/Input/Input';
import { Textarea } from '../../components/atoms/Textarea/Textarea';
import { Button } from '../../components/atoms/Button/Button';
import { RouterProfile, ServerSettings } from '../../types/settings';
import styles from './SettingsPage.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface TestResult {
  success: boolean;
  error?: string;
  routerInfo?: {
    name: string;
    model: string;
    version: string;
  };
  providerInfo?: {
    provider: string;
    model: string;
  };
}

export const SettingsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('');

  // Notification state
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Server Settings State
  const [serverSettings, setServerSettings] = useState<ServerSettings | null>(null);
  const [hasServerChanges, setHasServerChanges] = useState(false);

  // Track original masked values
  const [originalMaskedPassword, setOriginalMaskedPassword] = useState<string>('');
  const [originalMaskedApiKey, setOriginalMaskedApiKey] = useState<string>('');
  const [originalMaskedCloudflareToken, setOriginalMaskedCloudflareToken] = useState<string>('');

  // Connection test state
  const [mikrotikTest, setMikrotikTest] = useState<TestResult | null>(null);
  const [llmTest, setLLMTest] = useState<TestResult | null>(null);
  const [testingMikrotik, setTestingMikrotik] = useState(false);
  const [testingLLM, setTestingLLM] = useState(false);

  // Handle smooth scrolling when hash changes from navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash) {
        const element = document.getElementById(hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    };

    // Scroll on initial load if hash exists
    if (window.location.hash) {
      // Delay to ensure content is rendered
      setTimeout(handleHashChange, 100);
    }

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Track active section with intersection observer
  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '-80px 0px -60% 0px',
      threshold: 0
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.id;
          setActiveSection(sectionId);
          // Update hash without scrolling
          if (window.location.hash !== `#${sectionId}`) {
            history.replaceState(null, '', `#${sectionId}`);
          }
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    // Observe all section containers
    const sections = document.querySelectorAll('[data-section]');
    sections.forEach((section) => observer.observe(section));

    return () => {
      sections.forEach((section) => observer.unobserve(section));
    };
  }, []);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setServerSettings(data);
        setOriginalMaskedPassword(data.mikrotik.password || '');
        setOriginalMaskedApiKey(data.llm.claude.apiKey || '');
        setOriginalMaskedCloudflareToken(data.llm.cloudflare.apiToken || '');
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      setNotification({
        type: 'error',
        message: 'Failed to load settings. Please refresh the page.'
      });
    } finally {
      setLoading(false);
    }
  };

  // Test MikroTik connection
  const testMikroTikConnection = async () => {
    if (!serverSettings) return;

    setTestingMikrotik(true);
    setMikrotikTest(null);

    try {
      const response = await fetch(`${API_URL}/api/setup/test-mikrotik`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: serverSettings.mikrotik.host,
          port: serverSettings.mikrotik.port.toString(),
          username: serverSettings.mikrotik.username,
          password: serverSettings.mikrotik.password,
        }),
      });

      const result = await response.json();
      setMikrotikTest(result);

      if (result.success) {
        message.success(`Connected to ${result.routerInfo.name} (${result.routerInfo.model})`);
      } else {
        message.error(result.error || 'Connection test failed');
      }
    } catch (err: any) {
      const errorResult = { success: false, error: err.message };
      setMikrotikTest(errorResult);
      message.error('Failed to test connection: ' + err.message);
    } finally {
      setTestingMikrotik(false);
    }
  };

  // Test LLM connection
  const testLLMConnection = async () => {
    if (!serverSettings) return;

    setTestingLLM(true);
    setLLMTest(null);

    try {
      const response = await fetch(`${API_URL}/api/setup/test-llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: serverSettings.llm.provider,
          [serverSettings.llm.provider]: serverSettings.llm[serverSettings.llm.provider],
        }),
      });

      const result = await response.json();
      setLLMTest(result);

      if (result.success) {
        const providerName = serverSettings.llm.provider === 'claude' ? 'Claude API' : serverSettings.llm.provider === 'cloudflare' ? 'Cloudflare Workers AI' : 'LMStudio';
        const modelName = result.providerInfo?.model ||
          (serverSettings.llm.provider === 'claude' ? serverSettings.llm.claude.model : serverSettings.llm.provider === 'cloudflare' ? serverSettings.llm.cloudflare.model : serverSettings.llm.lmstudio.model);
        message.success(`Connected to ${providerName} (${modelName})`);
      } else {
        message.error(result.error || 'Connection test failed');
      }
    } catch (err: any) {
      const errorResult = { success: false, error: err.message };
      setLLMTest(errorResult);
      message.error('Failed to test connection: ' + err.message);
    } finally {
      setTestingLLM(false);
    }
  };

  const handleServerSave = async () => {
    if (!serverSettings) return;

    try {
      setSaving(true);
      setNotification(null);

      // Build mikrotik settings - exclude password if unchanged
      const { password: mikrotikPassword, ...mikrotikRest } = serverSettings.mikrotik;
      const mikrotikSettings = serverSettings.mikrotik.password !== originalMaskedPassword
        ? serverSettings.mikrotik
        : mikrotikRest as typeof serverSettings.mikrotik;

      // Build claude settings - exclude apiKey if unchanged
      const { apiKey: claudeApiKey, ...claudeRest } = serverSettings.llm.claude;
      const claudeSettings = serverSettings.llm.claude.apiKey !== originalMaskedApiKey
        ? serverSettings.llm.claude
        : claudeRest as typeof serverSettings.llm.claude;

      // Build cloudflare settings - exclude apiToken if unchanged
      const { apiToken: cloudflareToken, ...cloudflareRest } = serverSettings.llm.cloudflare;
      const cloudflareSettings = serverSettings.llm.cloudflare.apiToken !== originalMaskedCloudflareToken
        ? serverSettings.llm.cloudflare
        : cloudflareRest as typeof serverSettings.llm.cloudflare;

      const settingsToSave = {
        ...serverSettings,
        mikrotik: mikrotikSettings,
        llm: {
          ...serverSettings.llm,
          claude: claudeSettings,
          cloudflare: cloudflareSettings
        }
      };

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsToSave)
      });

      if (response.ok) {
        const result = await response.json();
        setHasServerChanges(false);

        // Reload settings to sync state with backend and update masked values
        await loadSettings();

        // Show success toast
        message.success(result.message || 'Server settings saved successfully!');
      } else {
        const error = await response.json();
        message.error(error.error || error.message || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      message.error('An unexpected error occurred while saving settings');
    } finally {
      setSaving(false);
    }
  };

  const updateServerSettings = <K extends 'server' | 'mikrotik' | 'llm' | 'assistant'>(
    section: K,
    field: keyof ServerSettings[K],
    value: any
  ) => {
    if (!serverSettings) return;
    setServerSettings({
      ...serverSettings,
      [section]: {
        ...serverSettings[section],
        [field]: value
      }
    });
    setHasServerChanges(true);
    // Clear test results when settings change
    if (section === 'mikrotik') {
      setMikrotikTest(null);
    } else if (section === 'llm' || section === 'assistant') {
      setLLMTest(null);
    }
  };

  const updateRouterProfile = (id: string, field: keyof RouterProfile, value: any) => {
    if (!serverSettings) return;
    setServerSettings({
      ...serverSettings,
      routers: (serverSettings.routers || []).map((router) =>
        router.id === id ? { ...router, [field]: value } : router
      )
    });
    setHasServerChanges(true);
    setMikrotikTest(null);
  };

  const addRouterProfile = () => {
    if (!serverSettings) return;
    const current = serverSettings.mikrotik;
    const router: RouterProfile = {
      id: `router-${Date.now()}`,
      name: `Router ${(serverSettings.routers || []).length + 1}`,
      host: current.host || '',
      port: current.port || 8728,
      username: current.username || 'admin',
      password: '',
      timeout: current.timeout || 10000,
      keepaliveInterval: current.keepaliveInterval || 30000,
      speedTest: current.speedTest,
      enabled: true
    };
    setServerSettings({
      ...serverSettings,
      routers: [...(serverSettings.routers || []), router],
      activeRouterId: serverSettings.activeRouterId || router.id
    });
    setHasServerChanges(true);
  };

  const removeRouterProfile = (id: string) => {
    if (!serverSettings) return;
    const routers = (serverSettings.routers || []).filter((router) => router.id !== id);
    setServerSettings({
      ...serverSettings,
      routers,
      activeRouterId: serverSettings.activeRouterId === id ? routers[0]?.id : serverSettings.activeRouterId
    });
    setHasServerChanges(true);
  };

  const activateRouterProfile = (router: RouterProfile) => {
    if (!serverSettings) return;
    setServerSettings({
      ...serverSettings,
      activeRouterId: router.id,
      mikrotik: {
        host: router.host,
        port: router.port,
        username: router.username,
        password: router.password,
        timeout: router.timeout,
        keepaliveInterval: router.keepaliveInterval,
        speedTest: router.speedTest
      }
    });
    setHasServerChanges(true);
    setMikrotikTest(null);
  };

  const updateLLMProviderSettings = (
    provider: 'claude' | 'lmstudio' | 'cloudflare',
    field: string,
    value: any
  ) => {
    if (!serverSettings) return;
    setServerSettings({
      ...serverSettings,
      llm: {
        ...serverSettings.llm,
        [provider]: {
          ...serverSettings.llm[provider],
          [field]: value
        }
      }
    });
    setHasServerChanges(true);
    setLLMTest(null);
  };

  const handleRestartSetup = async () => {
    try {
      const response = await fetch('/api/setup/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        window.location.reload();
      } else {
        const error = await response.json();
        setNotification({
          type: 'error',
          message: error.error || 'Unable to restart setup wizard'
        });
      }
    } catch (error) {
      console.error('Failed to restart setup:', error);
      setNotification({
        type: 'error',
        message: 'An unexpected error occurred'
      });
    }
  };

  if (loading || !serverSettings) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <Spin size="large" tip="Loading settings..." />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Inline Notification */}
        {notification && (
          <Alert
            type={notification.type}
            message={notification.message}
            closable
            onClose={() => setNotification(null)}
            showIcon
            style={{ marginBottom: 'var(--space-xl)' }}
          />
        )}

        <div className={styles.settingsContent}>
                      {/* Server Settings */}
                      <div
                        id="server"
                        data-section
                        className={`${styles.sectionContainer} ${activeSection === 'server' ? styles.active : ''}`}
                      >
                        <SettingsSection
                          title="Application Settings"
                          description="Configure backend server settings"
                        >
                          <FormField label="Server Port" helpText="Port number for the backend server (1-65535)">
                            <Input
                              type="number"
                              value={serverSettings.server.port}
                              onChange={(e) => updateServerSettings('server', 'port', parseInt(e.target.value))}
                            />
                          </FormField>

                          <FormField label="CORS Origin" helpText="Allowed origin for cross-origin requests">
                            <Input
                              value={serverSettings.server.corsOrigin}
                              onChange={(e) => updateServerSettings('server', 'corsOrigin', e.target.value)}
                              placeholder="http://localhost:5173"
                            />
                          </FormField>

                          <FormField label="Environment">
                            <select
                              className={styles.select}
                              value={serverSettings.server.nodeEnv}
                              onChange={(e) => updateServerSettings('server', 'nodeEnv', e.target.value)}
                            >
                              <option value="development">Development</option>
                              <option value="production">Production</option>
                            </select>
                          </FormField>
                        </SettingsSection>
                      </div>

                      {/* Router Profiles */}
                      <div
                        id="router-profiles"
                        data-section
                        className={`${styles.sectionContainer} ${activeSection === 'router-profiles' ? styles.active : ''}`}
                      >
                        <SettingsSection
                          title="Router Profiles"
                          description="Manage multiple MikroTik hosts and choose the active router for dashboard, terminal, and agent tools"
                        >
                          <div className={styles.routerProfiles}>
                            {(serverSettings.routers || []).map((router) => (
                              <div key={router.id} className={`${styles.routerProfile} ${serverSettings.activeRouterId === router.id ? styles.routerProfileActive : ''}`}>
                                <div className={styles.routerProfileHeader}>
                                  <div>
                                    <div className={styles.routerProfileTitle}>{router.name || router.host}</div>
                                    <div className={styles.routerProfileMeta}>{router.host}:{router.port} · {router.username}</div>
                                  </div>
                                  <div className={styles.routerProfileActions}>
                                    <Button
                                      size="small"
                                      variant={serverSettings.activeRouterId === router.id ? 'primary' : 'secondary'}
                                      onClick={() => activateRouterProfile(router)}
                                    >
                                      {serverSettings.activeRouterId === router.id ? 'Active' : 'Use'}
                                    </Button>
                                    <Button size="small" variant="secondary" onClick={() => removeRouterProfile(router.id)}>
                                      Remove
                                    </Button>
                                  </div>
                                </div>

                                <div className={styles.gridTwo}>
                                  <FormField label="Name">
                                    <Input value={router.name} onChange={(e) => updateRouterProfile(router.id, 'name', e.target.value)} />
                                  </FormField>
                                  <FormField label="Host">
                                    <Input value={router.host} onChange={(e) => updateRouterProfile(router.id, 'host', e.target.value)} />
                                  </FormField>
                                  <FormField label="Port">
                                    <Input type="number" value={router.port} onChange={(e) => updateRouterProfile(router.id, 'port', parseInt(e.target.value))} />
                                  </FormField>
                                  <FormField label="Username">
                                    <Input value={router.username} onChange={(e) => updateRouterProfile(router.id, 'username', e.target.value)} />
                                  </FormField>
                                  <FormField label="Password">
                                    <Input type="password" value={router.password} onChange={(e) => updateRouterProfile(router.id, 'password', e.target.value)} />
                                  </FormField>
                                  <FormField label="Enabled">
                                    <select
                                      className={styles.select}
                                      value={router.enabled ? 'yes' : 'no'}
                                      onChange={(e) => updateRouterProfile(router.id, 'enabled', e.target.value === 'yes')}
                                    >
                                      <option value="yes">Enabled</option>
                                      <option value="no">Disabled</option>
                                    </select>
                                  </FormField>
                                </div>
                              </div>
                            ))}
                          </div>

                          <Button variant="secondary" onClick={addRouterProfile}>
                            Add Router
                          </Button>
                        </SettingsSection>
                      </div>

                      {/* MikroTik Connection */}
                      <div
                        id="router-api"
                        data-section
                        className={`${styles.sectionContainer} ${activeSection === 'router-api' ? styles.active : ''}`}
                      >
                        <SettingsSection
                          title="MikroTik Connection"
                          description="Configure connection to MikroTik RouterOS via API"
                        >
                        <FormField label="Router IP Address / Hostname" helpText="IP address or hostname of your MikroTik router">
                          <Input
                            value={serverSettings.mikrotik.host}
                            onChange={(e) => updateServerSettings('mikrotik', 'host', e.target.value)}
                            placeholder="192.168.88.1 or router.local"
                          />
                        </FormField>

                        <FormField label="API Port" helpText="8728 for API, 8729 for API-SSL">
                          <Input
                            type="number"
                            value={serverSettings.mikrotik.port}
                            onChange={(e) => updateServerSettings('mikrotik', 'port', parseInt(e.target.value))}
                          />
                        </FormField>

                        <FormField label="Username" helpText="RouterOS admin username">
                          <Input
                            value={serverSettings.mikrotik.username}
                            onChange={(e) => updateServerSettings('mikrotik', 'username', e.target.value)}
                            placeholder="admin"
                          />
                        </FormField>

                        <FormField label="Password" helpText="RouterOS admin password">
                          <Input
                            type="password"
                            value={serverSettings.mikrotik.password}
                            onChange={(e) => updateServerSettings('mikrotik', 'password', e.target.value)}
                            placeholder="Enter password"
                          />
                        </FormField>

                          {/* <div className={styles.toggleGroup}>
                            <Alert
                              message="Security Notice"
                              description="Credentials are stored in config.json on the server. Keep this file secure and never commit it to version control."
                              type="warning"
                              showIcon
                            />
                          </div> */}

                          <FormField label="Connection Test" helpText="Test the connection to your MikroTik router">
                            <Button
                              variant="primary"
                              onClick={testMikroTikConnection}
                              disabled={testingMikrotik}
                            >
                              {testingMikrotik ? 'Testing MikroTik...' : 'Test MikroTik Connection'}
                            </Button>
                            {mikrotikTest && (
                              <Alert
                                type={mikrotikTest.success ? 'success' : 'error'}
                                message={mikrotikTest.success ? `Connected to ${mikrotikTest.routerInfo?.name || 'router'}` : mikrotikTest.error || 'Connection test failed'}
                                showIcon
                                style={{ marginTop: 'var(--space-md)' }}
                              />
                            )}
                          </FormField>
                        </SettingsSection>
                      </div>

                      {/* Speed Test Configuration */}
                      <div
                        id="speed-test"
                        data-section
                        className={`${styles.sectionContainer} ${activeSection === 'speed-test' ? styles.active : ''}`}
                      >
                        <SettingsSection
                          title="Speed Test Configuration"
                          description="Configure internet speed test settings"
                        >
                        <FormField label="File Size" helpText="Larger files provide more accurate results for high-speed connections">
                          <select
                            className={styles.select}
                            value={serverSettings.mikrotik.speedTest.fileSizeMB}
                            onChange={(e) => {
                              const newSettings = { ...serverSettings };
                              newSettings.mikrotik.speedTest.fileSizeMB = parseInt(e.target.value);
                              setServerSettings(newSettings);
                              setHasServerChanges(true);
                            }}
                          >
                            <option value="10">10 MB (Fast test, lower accuracy)</option>
                            <option value="25">25 MB (Quick test)</option>
                            <option value="50">50 MB (Balanced)</option>
                            <option value="100">100 MB (Good accuracy)</option>
                            <option value="250">250 MB (Recommended)</option>
                            <option value="500">500 MB (High accuracy)</option>
                            <option value="1000">1 GB (Maximum accuracy, slow)</option>
                          </select>
                        </FormField>

                        <FormField label="Test Server">
                          <div className={styles.providerSection}>
                            <div
                              className={`${styles.providerOption} ${serverSettings.mikrotik.speedTest.testServer === 'cloudflare' ? styles.active : ''}`}
                              onClick={() => {
                                const newSettings = { ...serverSettings };
                                newSettings.mikrotik.speedTest.testServer = 'cloudflare';
                                setServerSettings(newSettings);
                                setHasServerChanges(true);
                              }}
                            >
                              <div className={styles.providerHeader}>
                                <div className={styles.providerRadio}>
                                  {serverSettings.mikrotik.speedTest.testServer === 'cloudflare' && <div className={styles.providerRadioActive}></div>}
                                </div>
                                <div className={styles.providerTitle}>Cloudflare (1.1.1.1)</div>
                              </div>
                              <div className={styles.providerDescription}>
                                Fast, reliable CDN - Recommended
                              </div>
                            </div>

                            <div
                              className={`${styles.providerOption} ${serverSettings.mikrotik.speedTest.testServer === 'google' ? styles.active : ''}`}
                              onClick={() => {
                                const newSettings = { ...serverSettings };
                                newSettings.mikrotik.speedTest.testServer = 'google';
                                setServerSettings(newSettings);
                                setHasServerChanges(true);
                              }}
                            >
                              <div className={styles.providerHeader}>
                                <div className={styles.providerRadio}>
                                  {serverSettings.mikrotik.speedTest.testServer === 'google' && <div className={styles.providerRadioActive}></div>}
                                </div>
                                <div className={styles.providerTitle}>Google (8.8.8.8)</div>
                              </div>
                              <div className={styles.providerDescription}>
                                Google Public DNS servers
                              </div>
                            </div>

                            <div
                              className={`${styles.providerOption} ${serverSettings.mikrotik.speedTest.testServer === 'custom' ? styles.active : ''}`}
                              onClick={() => {
                                const newSettings = { ...serverSettings };
                                newSettings.mikrotik.speedTest.testServer = 'custom';
                                setServerSettings(newSettings);
                                setHasServerChanges(true);
                              }}
                            >
                              <div className={styles.providerHeader}>
                                <div className={styles.providerRadio}>
                                  {serverSettings.mikrotik.speedTest.testServer === 'custom' && <div className={styles.providerRadioActive}></div>}
                                </div>
                                <div className={styles.providerTitle}>Custom URL</div>
                              </div>
                              <div className={styles.providerDescription}>
                                Use your own test server endpoint
                              </div>
                            </div>
                          </div>
                        </FormField>

                        {serverSettings.mikrotik.speedTest.testServer === 'custom' && (
                          <FormField label="Custom Test URL" helpText="Full URL to download test file (must support HTTPS)">
                            <Input
                              type="url"
                              value={serverSettings.mikrotik.speedTest.customUrl}
                              onChange={(e) => {
                                const newSettings = { ...serverSettings };
                                newSettings.mikrotik.speedTest.customUrl = e.target.value;
                                setServerSettings(newSettings);
                                setHasServerChanges(true);
                              }}
                              placeholder="https://example.com/testfile"
                            />
                          </FormField>
                        )}

                        <FormField label="Timeout (seconds)" helpText="Maximum time to wait for speed test to complete">
                          <Input
                            type="number"
                            value={serverSettings.mikrotik.speedTest.timeoutSeconds}
                            onChange={(e) => {
                              const newSettings = { ...serverSettings };
                              newSettings.mikrotik.speedTest.timeoutSeconds = parseInt(e.target.value);
                              setServerSettings(newSettings);
                              setHasServerChanges(true);
                            }}
                            min="30"
                            max="300"
                          />
                        </FormField>

                          <FormField label="Ping Samples" helpText="Number of ping packets to send for latency measurement">
                            <Input
                              type="number"
                              value={serverSettings.mikrotik.speedTest.pingSamples}
                              onChange={(e) => {
                                const newSettings = { ...serverSettings };
                                newSettings.mikrotik.speedTest.pingSamples = parseInt(e.target.value);
                                setServerSettings(newSettings);
                                setHasServerChanges(true);
                              }}
                              min="1"
                              max="10"
                            />
                          </FormField>
                        </SettingsSection>
                      </div>

                      {/* LLM Configuration */}
                      <div
                        id="ai-assistant"
                        data-section
                        className={`${styles.sectionContainer} ${activeSection === 'ai-assistant' ? styles.active : ''}`}
                      >
                        <SettingsSection
                          title="AI Assistant"
                          description="Configure AI language model provider and behavior"
                        >
                        <FormField label="LLM Provider">
                          <div className={styles.providerSection}>
                            <div
                              className={`${styles.providerOption} ${serverSettings.llm.provider === 'claude' ? styles.active : ''}`}
                              onClick={() => updateServerSettings('llm', 'provider', 'claude')}
                            >
                              <div className={styles.providerHeader}>
                                <div className={styles.providerRadio}>
                                  {serverSettings.llm.provider === 'claude' && <div className={styles.providerRadioActive}></div>}
                                </div>
                                <div className={styles.providerTitle}>Claude (Anthropic)</div>
                              </div>
                              <div className={styles.providerDescription}>
                                Cloud-based AI with high quality responses
                              </div>
                            </div>

                            <div
                              className={`${styles.providerOption} ${serverSettings.llm.provider === 'lmstudio' ? styles.active : ''}`}
                              onClick={() => updateServerSettings('llm', 'provider', 'lmstudio')}
                            >
                              <div className={styles.providerHeader}>
                                <div className={styles.providerRadio}>
                                  {serverSettings.llm.provider === 'lmstudio' && <div className={styles.providerRadioActive}></div>}
                                </div>
                                <div className={styles.providerTitle}>LM Studio (Local)</div>
                              </div>
                              <div className={styles.providerDescription}>
                                Run models locally on your machine
                              </div>
                            </div>

                            <div
                              className={`${styles.providerOption} ${serverSettings.llm.provider === 'cloudflare' ? styles.active : ''}`}
                              onClick={() => updateServerSettings('llm', 'provider', 'cloudflare')}
                            >
                              <div className={styles.providerHeader}>
                                <div className={styles.providerRadio}>
                                  {serverSettings.llm.provider === 'cloudflare' && <div className={styles.providerRadioActive}></div>}
                                </div>
                                <div className={styles.providerTitle}>Cloudflare Workers AI</div>
                              </div>
                              <div className={styles.providerDescription}>
                                Workers AI comes with a curated set of popular open-source models
                              </div>
                            </div>
                          </div>
                        </FormField>

                        {serverSettings.llm.provider === 'claude' ? (
                          <>
                            <h3 className={styles.subsectionTitle}>Claude Configuration</h3>
                            <FormField label="API Key" helpText="Get your API key from https://console.anthropic.com/">
                              <Input
                                type="password"
                                value={serverSettings.llm.claude.apiKey}
                                onChange={(e) => updateLLMProviderSettings('claude', 'apiKey', e.target.value)}
                                placeholder="sk-ant-api03-..."
                              />
                            </FormField>

                            <FormField label="Model">
                              <select
                                className={styles.select}
                                value={serverSettings.llm.claude.model}
                                onChange={(e) => updateLLMProviderSettings('claude', 'model', e.target.value)}
                              >
                                <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (Latest)</option>
                                <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                                <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
                              </select>
                            </FormField>
                          </>
                        ) : serverSettings.llm.provider === 'lmstudio' ? (
                          <>
                            <h3 className={styles.subsectionTitle}>LM Studio Configuration</h3>
                            <FormField label="Server Endpoint" helpText="LM Studio server URL (usually http://localhost:1234)">
                              <Input
                                value={serverSettings.llm.lmstudio.endpoint}
                                onChange={(e) => updateLLMProviderSettings('lmstudio', 'endpoint', e.target.value)}
                                placeholder="http://localhost:1234"
                              />
                            </FormField>

                            <FormField label="Model Name" helpText="The model loaded in LM Studio">
                              <Input
                                value={serverSettings.llm.lmstudio.model}
                                onChange={(e) => updateLLMProviderSettings('lmstudio', 'model', e.target.value)}
                                placeholder="Qwen2.5-Coder-14B-Instruct-Q4_K_M.gguf"
                              />
                            </FormField>

                            <FormField label="Context Window" helpText="Maximum context size in tokens (e.g., 32768, 8192, 4096)">
                              <Input
                                type="number"
                                value={serverSettings.llm.lmstudio.contextWindow}
                                onChange={(e) => updateLLMProviderSettings('lmstudio', 'contextWindow', parseInt(e.target.value) || 32768)}
                                placeholder="32768"
                              />
                            </FormField>
                          </>
                        ) : (
                          <>
                            <h3 className={styles.subsectionTitle}>Cloudflare Workers AI Configuration</h3>
                            <FormField label="Account ID" helpText="Get your Account ID from Cloudflare dashboard">
                              <Input
                                value={serverSettings.llm.cloudflare.accountId}
                                onChange={(e) => updateLLMProviderSettings('cloudflare', 'accountId', e.target.value)}
                                placeholder="your_cloudflare_account_id"
                              />
                            </FormField>

                            <FormField label="API Token" helpText="Create an API token with Workers AI permissions">
                              <Input
                                type="password"
                                value={serverSettings.llm.cloudflare.apiToken}
                                onChange={(e) => updateLLMProviderSettings('cloudflare', 'apiToken', e.target.value)}
                                placeholder="your_api_token"
                              />
                            </FormField>

                            <FormField label="Model">
                              <select
                                className={styles.select}
                                value={serverSettings.llm.cloudflare.model}
                                onChange={(e) => updateLLMProviderSettings('cloudflare', 'model', e.target.value)}
                              >
                                <option value="@cf/meta/llama-4-scout-17b-16e-instruct">Llama 4 Scout 17B (Recommended)</option>
                              </select>
                            </FormField>

                            <FormField label="AI Gateway (Optional)" helpText="Optional: AI Gateway name for caching and analytics">
                              <Input
                                value={serverSettings.llm.cloudflare.gateway || ''}
                                onChange={(e) => updateLLMProviderSettings('cloudflare', 'gateway', e.target.value || undefined)}
                                placeholder="my-gateway-name"
                              />
                            </FormField>
                          </>
                        )}

                        <h3 className={styles.subsectionTitle}>Assistant Behavior</h3>

                        <div className={styles.sliderContainer}>
                          <div className={styles.sliderLabel}>
                            <span className={styles.sliderLabelText}>Temperature</span>
                            <span className={styles.sliderValue}>{serverSettings.assistant.temperature.toFixed(1)}</span>
                          </div>
                          <Slider
                            min={0}
                            max={2}
                            step={0.1}
                            value={serverSettings.assistant.temperature}
                            onChange={(value) => updateServerSettings('assistant', 'temperature', value)}
                            marks={{ 0: '0', 0.7: '0.7', 1: '1', 2: '2' }}
                          />
                        </div>

                        <FormField label="Max Tokens" helpText="Maximum tokens per response">
                          <Input
                            type="number"
                            value={serverSettings.assistant.maxTokens}
                            onChange={(e) => updateServerSettings('assistant', 'maxTokens', parseInt(e.target.value))}
                          />
                        </FormField>

                          <FormField label="System Prompt" helpText="Instructions for the AI assistant's behavior">
                            <Textarea
                              rows={4}
                              value={serverSettings.assistant.systemPrompt}
                              onChange={(e) => updateServerSettings('assistant', 'systemPrompt', e.target.value)}
                              placeholder="You are an expert MikroTik router assistant..."
                            />
                          </FormField>

                          <FormField label="Connection Test" helpText="Test the connection to your LLM provider">
                            <Button
                              variant="primary"
                              onClick={testLLMConnection}
                              disabled={testingLLM}
                            >
                              {testingLLM ? 'Testing LLM...' : 'Test LLM Connection'}
                            </Button>
                            {llmTest && (
                              <Alert
                                type={llmTest.success ? 'success' : 'error'}
                                message={llmTest.success ? `Connected to ${llmTest.providerInfo?.provider || serverSettings.llm.provider}` : llmTest.error || 'LLM test failed'}
                                showIcon
                                style={{ marginTop: 'var(--space-md)' }}
                              />
                            )}
                          </FormField>
                        </SettingsSection>
                      </div>

                      {/* Setup & Maintenance */}
                      <div
                        id="setup"
                        data-section
                        className={`${styles.sectionContainer} ${activeSection === 'setup' ? styles.active : ''}`}
                      >
                        <SettingsSection
                          title="Setup & Maintenance"
                          description="Manage application setup and configuration"
                        >
                          <FormField
                            label="Re-run Setup Wizard"
                            helpText="Start the initial setup wizard to reconfigure MikroTik connection and LLM settings"
                          >
                            <Button
                              variant="secondary"
                              onClick={handleRestartSetup}
                            >
                              Re-run Setup Wizard
                            </Button>
                          </FormField>
                        </SettingsSection>
                      </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className={styles.footer}>
        <Button
          onClick={() => loadSettings()}
          disabled={!hasServerChanges || saving}
        >
          Discard Changes
        </Button>
        <Button
          variant="primary"
          onClick={handleServerSave}
          disabled={!hasServerChanges || saving}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
};

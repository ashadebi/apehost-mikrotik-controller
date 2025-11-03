import React, { useState } from 'react';
import styles from './NetworkMapLegend.module.css';

interface LegendItem {
  label: string;
  color?: string;
  icon?: string;
  borderStyle?: 'solid' | 'dashed';
  type?: 'node' | 'edge' | 'status';
}

export interface NetworkMapLegendProps {
  isVisible?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  onToggle?: () => void;
}

export const NetworkMapLegend: React.FC<NetworkMapLegendProps> = ({
  isVisible = true,
  position = 'bottom-right',
  onToggle,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!isVisible) return null;

  const nodeTypes: LegendItem[] = [
    { label: 'Router', color: 'var(--color-accent-primary)', type: 'node' },
    { label: 'Bridge', color: 'var(--color-accent-success)', type: 'node' },
    { label: 'Interface', color: 'var(--color-accent-success)', type: 'node' },
    { label: 'Host', color: 'var(--color-text-secondary)', type: 'node' },
  ];

  const statusColors: LegendItem[] = [
    { label: 'Active/Up', color: 'var(--color-accent-success)', type: 'status' },
    { label: 'Inactive/Down', color: 'var(--color-border-primary)', type: 'status' },
    { label: 'Reachable', color: 'var(--color-accent-success)', type: 'status' },
    { label: 'Stale', color: 'var(--color-accent-primary)', type: 'status' },
  ];

  const connectionTypes: LegendItem[] = [
    { label: 'Direct Connection', color: 'var(--color-accent-success)', borderStyle: 'solid', type: 'edge' },
    { label: 'Bridge Member', color: 'var(--color-accent-success)', borderStyle: 'dashed', type: 'edge' },
    { label: 'Host Connection', color: 'var(--color-border-secondary)', borderStyle: 'solid', type: 'edge' },
  ];

  return (
    <div className={`${styles.legend} ${styles[position]} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>Legend</h3>
        <div className={styles.headerButtons}>
          <button
            className={styles.collapseButton}
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand legend' : 'Collapse legend'}
            aria-label={isCollapsed ? 'Expand legend' : 'Collapse legend'}
          >
            {isCollapsed ? '▼' : '▲'}
          </button>
          {onToggle && (
            <button
              className={styles.closeButton}
              onClick={onToggle}
              title="Hide legend"
              aria-label="Hide legend"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className={styles.content}>
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Node Types</h4>
            <div className={styles.items}>
              {nodeTypes.map((item) => (
                <div key={item.label} className={styles.item}>
                  <div
                    className={styles.nodeIndicator}
                    style={{
                      backgroundColor: item.color,
                      border: `2px solid ${item.color}`,
                    }}
                  />
                  <span className={styles.label}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Status</h4>
            <div className={styles.items}>
              {statusColors.map((item) => (
                <div key={item.label} className={styles.item}>
                  <div
                    className={styles.statusIndicator}
                    style={{
                      backgroundColor: item.color,
                    }}
                  />
                  <span className={styles.label}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Connections</h4>
            <div className={styles.items}>
              {connectionTypes.map((item) => (
                <div key={item.label} className={styles.item}>
                  <div
                    className={styles.edgeIndicator}
                    style={{
                      borderTop: item.borderStyle === 'dashed'
                        ? `2px dashed ${item.color}`
                        : `2px solid ${item.color}`,
                    }}
                  />
                  <span className={styles.label}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { EdgeProps, getBezierPath } from 'reactflow';
import styles from './TrafficFlowEdge.module.css';

interface TrafficData {
  rxRate: number; // Receive rate in bytes/sec
  txRate: number; // Transmit rate in bytes/sec
}

interface TrafficFlowEdgeData {
  traffic?: TrafficData;
  label?: string;
}

export const TrafficFlowEdge: React.FC<EdgeProps<TrafficFlowEdgeData>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  markerEnd,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const traffic = data?.traffic;
  const hasTraffic = traffic && (traffic.rxRate > 0 || traffic.txRate > 0);

  // Only show labels for significant traffic (> 10 KB/s on either direction)
  const hasSignificantTraffic = traffic && (traffic.rxRate > 10240 || traffic.txRate > 10240);

  // Format rate for display (more compact)
  const formatRate = (bytesPerSec: number): string => {
    if (bytesPerSec === 0) return '0';
    if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)}B`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(0)}K`;
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)}M`;
  };

  // Determine animation speed based on traffic volume
  const getAnimationDuration = (rate: number) => {
    if (rate === 0) return '0s';
    if (rate < 100 * 1024) return '3s'; // < 100 KB/s - slow
    if (rate < 1024 * 1024) return '2s'; // < 1 MB/s - medium
    return '1s'; // >= 1 MB/s - fast
  };

  const rxAnimationDuration = getAnimationDuration(traffic?.rxRate || 0);
  const txAnimationDuration = getAnimationDuration(traffic?.txRate || 0);

  return (
    <>
      {/* Main edge path */}
      <path
        id={id}
        style={style}
        className={styles.edgePath}
        d={edgePath}
        markerEnd={markerEnd}
      />

      {/* Traffic flow indicators - RX (incoming to target) */}
      {hasTraffic && traffic.rxRate > 0 && (
        <g className={styles.trafficFlowRx}>
          <circle
            r="4"
            fill="var(--color-accent-success)"
            opacity={0.8}
            style={{
              animation: `${styles.flowToTarget} ${rxAnimationDuration} linear infinite`,
            }}
          >
            <animateMotion
              dur={rxAnimationDuration}
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>
        </g>
      )}

      {/* Traffic flow indicators - TX (outgoing from target) */}
      {hasTraffic && traffic.txRate > 0 && (
        <g className={styles.trafficFlowTx}>
          <circle
            r="4"
            fill="var(--color-accent-primary)"
            opacity={0.8}
            style={{
              animation: `${styles.flowToSource} ${txAnimationDuration} linear infinite`,
            }}
          >
            <animateMotion
              dur={txAnimationDuration}
              repeatCount="indefinite"
              path={edgePath}
              keyPoints="1;0"
              keyTimes="0;1"
            />
          </circle>
        </g>
      )}

      {/* Traffic rate label - only show for significant traffic */}
      {hasSignificantTraffic && (
        <g transform={`translate(${labelX}, ${labelY - 15})`}>
          <rect
            x="-30"
            y="-10"
            width="60"
            height="20"
            rx="3"
            className={styles.labelBackground}
          />
          <text
            className={styles.labelText}
            textAnchor="middle"
            y="3"
            fontSize="9"
            fill="var(--color-text-primary)"
          >
            {traffic.rxRate > 10240 && (
              <tspan className={styles.rxLabel}>
                ↓{formatRate(traffic.rxRate)}
              </tspan>
            )}
            {traffic.rxRate > 10240 && traffic.txRate > 10240 && (
              <tspan> </tspan>
            )}
            {traffic.txRate > 10240 && (
              <tspan className={styles.txLabel}>
                ↑{formatRate(traffic.txRate)}
              </tspan>
            )}
          </text>
        </g>
      )}
    </>
  );
};

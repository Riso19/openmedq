import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Circle, Path, G, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';

// ----------------------------------------------------
// 1. Queue Composition (Card States)
// ----------------------------------------------------
interface QueueCompositionProps {
  newCount: number;
  learningCount: number;
  reviewCount: number;
  relearningCount: number;
}

export function QueueCompositionChart({
  newCount,
  learningCount,
  reviewCount,
  relearningCount
}: QueueCompositionProps) {
  const theme = useTheme();
  const total = newCount + learningCount + reviewCount + relearningCount;

  const width = 300;
  const height = 20;

  if (total === 0) {
    return (
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
        <Text style={[styles.chartTitle, { color: theme.text }]}>Queue Composition</Text>
        <View style={styles.chartWrapper}>
          <Svg width={width} height={height}>
            <Rect width={width} height={height} rx={4} ry={4} fill={theme.backgroundSelected} />
          </Svg>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No cards in the repetition queue yet.</Text>
        </View>
      </View>
    );
  }

  // Calculate segment widths
  const wNew = (newCount / total) * width;
  const wLearn = (learningCount / total) * width;
  const wReview = (reviewCount / total) * width;
  const wRelearn = (relearningCount / total) * width;

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
      <Text style={[styles.chartTitle, { color: theme.text }]}>Queue Composition</Text>
      
      <View style={styles.chartWrapper}>
        <Svg width={width} height={height}>
          {/* New Segment */}
          {wNew > 0 && (
            <Rect x={0} y={0} width={wNew} height={height} rx={wNew === width ? 4 : 0} fill={theme.peach} />
          )}
          {/* Learning Segment */}
          {wLearn > 0 && (
            <Rect x={wNew} y={0} width={wLearn} height={height} rx={wLearn === width ? 4 : 0} fill={theme.lavender} />
          )}
          {/* Review Segment */}
          {wReview > 0 && (
            <Rect x={wNew + wLearn} y={0} width={wReview} height={height} rx={wReview === width ? 4 : 0} fill={theme.teal} />
          )}
          {/* Relearning Segment */}
          {wRelearn > 0 && (
            <Rect x={wNew + wLearn + wReview} y={0} width={wRelearn} height={height} rx={wRelearn === width ? 4 : 0} fill={theme.pink} />
          )}
        </Svg>

        {/* Legend */}
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View style={[styles.legendIndicator, { backgroundColor: theme.peach }]} />
            <Text style={[styles.legendText, { color: theme.text }]}>New ({newCount})</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendIndicator, { backgroundColor: theme.lavender }]} />
            <Text style={[styles.legendText, { color: theme.text }]}>Learn ({learningCount})</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendIndicator, { backgroundColor: theme.teal }]} />
            <Text style={[styles.legendText, { color: theme.text }]}>Review ({reviewCount})</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendIndicator, { backgroundColor: theme.pink }]} />
            <Text style={[styles.legendText, { color: theme.text }]}>Relearn ({relearningCount})</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ----------------------------------------------------
// 2. Difficulty Spectrum (1-10 Histogram)
// ----------------------------------------------------
interface DifficultySpectrumProps {
  data: number[]; // 10 elements for bins 1 to 10
}

export function DifficultySpectrumChart({ data }: DifficultySpectrumProps) {
  const theme = useTheme();
  const maxVal = Math.max(...data, 1);

  const w = 310;
  const h = 150;
  const paddingL = 25;
  const paddingR = 10;
  const paddingT = 15;
  const paddingB = 25;

  const chartW = w - paddingL - paddingR;
  const chartH = h - paddingT - paddingB;

  const barW = chartW / 10 - 4;

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
      <Text style={[styles.chartTitle, { color: theme.text }]}>Difficulty Distribution</Text>
      <View style={styles.chartWrapper}>
        <Svg width={w} height={h}>
          {/* Grid lines */}
          <Line x1={paddingL} y1={paddingT} x2={w - paddingR} y2={paddingT} stroke={theme.hairline} strokeWidth={1} strokeDasharray="3 3" />
          <Line x1={paddingL} y1={paddingT + chartH / 2} x2={w - paddingR} y2={paddingT + chartH / 2} stroke={theme.hairline} strokeWidth={1} strokeDasharray="3 3" />
          <Line x1={paddingL} y1={h - paddingB} x2={w - paddingR} y2={h - paddingB} stroke={theme.text} strokeWidth={1} />

          {/* Render Bars */}
          {data.map((val, idx) => {
            const barH = (val / maxVal) * chartH;
            const x = paddingL + idx * (chartW / 10) + 2;
            const y = h - paddingB - barH;

            return (
              <G key={idx}>
                {barH > 0 && (
                  <Rect x={x} y={y} width={barW} height={barH} fill={theme.pink} rx={2} />
                )}
                {/* X Axis labels */}
                <SvgText
                  x={x + barW / 2}
                  y={h - paddingB + 14}
                  fill={theme.textSecondary}
                  fontSize={9}
                  textAnchor="middle"
                >
                  {idx + 1}
                </SvgText>
              </G>
            );
          })}

          {/* Y Axis labels */}
          <SvgText x={paddingL - 6} y={paddingT + 4} fill={theme.textSecondary} fontSize={9} textAnchor="end">{maxVal}</SvgText>
          <SvgText x={paddingL - 6} y={paddingT + chartH / 2 + 4} fill={theme.textSecondary} fontSize={9} textAnchor="end">{Math.round(maxVal / 2)}</SvgText>
          <SvgText x={paddingL - 6} y={h - paddingB + 4} fill={theme.textSecondary} fontSize={9} textAnchor="end">0</SvgText>
        </Svg>
        <Text style={[styles.chartDesc, { color: theme.textSecondary }]}>Distribution of concepts from Easy (1) to Hard (10)</Text>
      </View>
    </View>
  );
}

// ----------------------------------------------------
// 3. Memory Stability Distribution
// ----------------------------------------------------
interface MemoryStabilityProps {
  data: number[]; // 5 elements: <3d, 3-10d, 10-30d, 30-90d, 90d+
}

export function MemoryStabilityChart({ data }: MemoryStabilityProps) {
  const theme = useTheme();
  const maxVal = Math.max(...data, 1);

  const w = 310;
  const h = 150;
  const paddingL = 25;
  const paddingR = 10;
  const paddingT = 15;
  const paddingB = 25;

  const chartW = w - paddingL - paddingR;
  const chartH = h - paddingT - paddingB;

  const barW = chartW / 5 - 12;
  const labels = ['<3d', '3-10d', '10-30d', '30-90d', '90d+'];

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
      <Text style={[styles.chartTitle, { color: theme.text }]}>Memory Stability Distribution</Text>
      <View style={styles.chartWrapper}>
        <Svg width={w} height={h}>
          <Line x1={paddingL} y1={paddingT} x2={w - paddingR} y2={paddingT} stroke={theme.hairline} strokeWidth={1} strokeDasharray="3 3" />
          <Line x1={paddingL} y1={paddingT + chartH / 2} x2={w - paddingR} y2={paddingT + chartH / 2} stroke={theme.hairline} strokeWidth={1} strokeDasharray="3 3" />
          <Line x1={paddingL} y1={h - paddingB} x2={w - paddingR} y2={h - paddingB} stroke={theme.text} strokeWidth={1} />

          {data.map((val, idx) => {
            const barH = (val / maxVal) * chartH;
            const x = paddingL + idx * (chartW / 5) + 6;
            const y = h - paddingB - barH;

            return (
              <G key={idx}>
                {barH > 0 && (
                  <Rect x={x} y={y} width={barW} height={barH} fill={theme.teal} rx={2} />
                )}
                <SvgText
                  x={x + barW / 2}
                  y={h - paddingB + 14}
                  fill={theme.textSecondary}
                  fontSize={8}
                  textAnchor="middle"
                >
                  {labels[idx]}
                </SvgText>
              </G>
            );
          })}

          <SvgText x={paddingL - 6} y={paddingT + 4} fill={theme.textSecondary} fontSize={9} textAnchor="end">{maxVal}</SvgText>
          <SvgText x={paddingL - 6} y={h - paddingB + 4} fill={theme.textSecondary} fontSize={9} textAnchor="end">0</SvgText>
        </Svg>
        <Text style={[styles.chartDesc, { color: theme.textSecondary }]}>Time before recall probability drops below 90%</Text>
      </View>
    </View>
  );
}

// ----------------------------------------------------
// 4. Review Forecast (7-day workload)
// ----------------------------------------------------
interface ReviewForecastProps {
  data: number[]; // 7 elements
  labels: string[]; // ['Mon', 'Tue', ...]
}

export function ReviewForecastChart({ data, labels }: ReviewForecastProps) {
  const theme = useTheme();
  const maxVal = Math.max(...data, 1);

  const w = 310;
  const h = 150;
  const paddingL = 25;
  const paddingR = 10;
  const paddingT = 15;
  const paddingB = 25;

  const chartW = w - paddingL - paddingR;
  const chartH = h - paddingT - paddingB;

  const barW = chartW / 7 - 6;

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
      <Text style={[styles.chartTitle, { color: theme.text }]}>7-Day Review Forecast</Text>
      <View style={styles.chartWrapper}>
        <Svg width={w} height={h}>
          <Line x1={paddingL} y1={paddingT} x2={w - paddingR} y2={paddingT} stroke={theme.hairline} strokeWidth={1} strokeDasharray="3 3" />
          <Line x1={paddingL} y1={paddingT + chartH / 2} x2={w - paddingR} y2={paddingT + chartH / 2} stroke={theme.hairline} strokeWidth={1} strokeDasharray="3 3" />
          <Line x1={paddingL} y1={h - paddingB} x2={w - paddingR} y2={h - paddingB} stroke={theme.text} strokeWidth={1} />

          {data.map((val, idx) => {
            const barH = (val / maxVal) * chartH;
            const x = paddingL + idx * (chartW / 7) + 3;
            const y = h - paddingB - barH;

            return (
              <G key={idx}>
                {barH > 0 && (
                  <Rect x={x} y={y} width={barW} height={barH} fill={theme.lavender} rx={2} />
                )}
                <SvgText
                  x={x + barW / 2}
                  y={h - paddingB + 14}
                  fill={theme.textSecondary}
                  fontSize={8}
                  textAnchor="middle"
                >
                  {labels[idx]}
                </SvgText>
              </G>
            );
          })}

          <SvgText x={paddingL - 6} y={paddingT + 4} fill={theme.textSecondary} fontSize={9} textAnchor="end">{maxVal}</SvgText>
          <SvgText x={paddingL - 6} y={h - paddingB + 4} fill={theme.textSecondary} fontSize={9} textAnchor="end">0</SvgText>
        </Svg>
        <Text style={[styles.chartDesc, { color: theme.textSecondary }]}>Estimated upcoming review load over the next week</Text>
      </View>
    </View>
  );
}

// ----------------------------------------------------
// 5. Practice Volume vs. Accuracy Overlay (Last 7 Days)
// ----------------------------------------------------
interface PracticeVolumeProps {
  correctData: number[]; // 7 elements
  incorrectData: number[]; // 7 elements
  labels: string[]; // ['Mon', 'Tue', ...]
}

export function PracticeVolumeChart({
  correctData,
  incorrectData,
  labels
}: PracticeVolumeProps) {
  const theme = useTheme();

  // Find max sum of correct + incorrect for bar scaling
  const sums = correctData.map((c, i) => c + incorrectData[i]);
  const maxVal = Math.max(...sums, 1);

  const w = 310;
  const h = 150;
  const paddingL = 25;
  const paddingR = 30; // Extra room for right Y-axis
  const paddingT = 15;
  const paddingB = 25;

  const chartW = w - paddingL - paddingR;
  const chartH = h - paddingT - paddingB;

  const barW = chartW / 7 - 10;

  // Calculate coordinate paths for the line chart (accuracy %)
  const linePoints: { x: number; y: number; pct: number }[] = [];

  labels.forEach((_, idx) => {
    const total = correctData[idx] + incorrectData[idx];
    const pct = total > 0 ? (correctData[idx] / total) * 100 : 0;
    
    const x = paddingL + idx * (chartW / 7) + (chartW / 7) / 2;
    // Y-coordinate: scale 0-100% to chartH
    const y = h - paddingB - (pct / 100) * chartH;
    
    linePoints.push({ x, y, pct });
  });

  // Build path string
  let pathD = '';
  linePoints.forEach((pt, idx) => {
    if (idx === 0) {
      pathD = `M ${pt.x} ${pt.y}`;
    } else {
      pathD += ` L ${pt.x} ${pt.y}`;
    }
  });

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
      <Text style={[styles.chartTitle, { color: theme.text }]}>Practice Volume & Accuracy</Text>
      <View style={styles.chartWrapper}>
        <Svg width={w} height={h}>
          {/* Grid lines */}
          <Line x1={paddingL} y1={paddingT} x2={w - paddingR} y2={paddingT} stroke={theme.hairline} strokeWidth={1} strokeDasharray="3 3" />
          <Line x1={paddingL} y1={paddingT + chartH / 2} x2={w - paddingR} y2={paddingT + chartH / 2} stroke={theme.hairline} strokeWidth={1} strokeDasharray="3 3" />
          <Line x1={paddingL} y1={h - paddingB} x2={w - paddingR} y2={h - paddingB} stroke={theme.text} strokeWidth={1} />

          {/* Render Stacked Bars (incorrect on top of correct) */}
          {labels.map((_, idx) => {
            const corr = correctData[idx];
            const incorr = incorrectData[idx];

            const corrH = (corr / maxVal) * chartH;
            const incorrH = (incorr / maxVal) * chartH;

            const x = paddingL + idx * (chartW / 7) + 5;
            const yCorr = h - paddingB - corrH;
            const yIncorr = yCorr - incorrH;

            return (
              <G key={idx}>
                {/* Correct part */}
                {corrH > 0 && (
                  <Rect x={x} y={yCorr} width={barW} height={corrH} fill={theme.mint} rx={1} />
                )}
                {/* Incorrect part */}
                {incorrH > 0 && (
                  <Rect x={x} y={yIncorr} width={barW} height={incorrH} fill={theme.pink} rx={1} />
                )}
                {/* Day label */}
                <SvgText
                  x={x + barW / 2}
                  y={h - paddingB + 14}
                  fill={theme.textSecondary}
                  fontSize={8}
                  textAnchor="middle"
                >
                  {labels[idx]}
                </SvgText>
              </G>
            );
          })}

          {/* Left Y Axis (Volume counts) */}
          <SvgText x={paddingL - 6} y={paddingT + 4} fill={theme.textSecondary} fontSize={9} textAnchor="end">{maxVal}</SvgText>
          <SvgText x={paddingL - 6} y={h - paddingB + 4} fill={theme.textSecondary} fontSize={9} textAnchor="end">0</SvgText>

          {/* Right Y Axis (Accuracy %) */}
          <SvgText x={w - paddingR + 6} y={paddingT + 4} fill={theme.textSecondary} fontSize={9} textAnchor="start">100%</SvgText>
          <SvgText x={w - paddingR + 6} y={paddingT + chartH / 2 + 4} fill={theme.textSecondary} fontSize={9} textAnchor="start">50%</SvgText>
          <SvgText x={w - paddingR + 6} y={h - paddingB + 4} fill={theme.textSecondary} fontSize={9} textAnchor="start">0%</SvgText>

          {/* Accuracy Line & Points */}
          {linePoints.length > 1 && (
            <Path
              d={pathD}
              fill="none"
              stroke={theme.text}
              strokeWidth={2}
            />
          )}

          {/* Render accuracy circles */}
          {linePoints.map((pt, idx) => (
            <G key={idx}>
              <Circle
                cx={pt.x}
                cy={pt.y}
                r={4}
                fill={theme.backgroundElement}
                stroke={theme.text}
                strokeWidth={2}
              />
            </G>
          ))}
        </Svg>

        {/* Legend */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendIndicator, { backgroundColor: theme.mint }]} />
            <Text style={[styles.legendText, { color: theme.text }]}>Correct</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendIndicator, { backgroundColor: theme.pink }]} />
            <Text style={[styles.legendText, { color: theme.text }]}>Incorrect</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendIndicator, { backgroundColor: theme.text }]} />
            <Text style={[styles.legendText, { color: theme.text }]}>Accuracy %</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ----------------------------------------------------
// Styles
// ----------------------------------------------------
const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: Fonts.sans,
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    justifyContent: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendIndicator: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
  },
  chartDesc: {
    fontSize: 10,
    marginTop: 8,
    textAlign: 'center',
  },
});

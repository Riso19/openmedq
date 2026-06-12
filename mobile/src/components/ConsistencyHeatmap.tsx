import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

interface ConsistencyHeatmapProps {
  data: Record<string, number>; // YYYY-MM-DD -> count
}

export function ConsistencyHeatmap({ data }: ConsistencyHeatmapProps) {
  const theme = useTheme();

  // 1. Calculate end of current week (Saturday)
  const now = new Date();
  const currentDayOfWeek = now.getDay();
  const daysUntilSaturday = 6 - currentDayOfWeek;
  const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSaturday);

  // 2. Start date is 112 days (16 weeks) before Saturday of this week
  const startDate = new Date(endOfWeek.getTime() - 111 * 24 * 60 * 60 * 1000);

  // 3. Generate all 112 cells
  const cells: { dateStr: string; count: number; month: number }[] = [];
  for (let i = 0; i < 112; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
    // Format YYYY-MM-DD
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    cells.push({
      dateStr,
      count: data[dateStr] || 0,
      month: d.getMonth(),
    });
  }

  // 4. Group into 16 weeks (columns)
  const columns: typeof cells[] = [];
  for (let col = 0; col < 16; col++) {
    columns.push(cells.slice(col * 7, (col + 1) * 7));
  }

  // 5. Generate month labels and identify column index
  const monthLabels: { text: string; colIndex: number }[] = [];
  let lastMonth = -1;
  columns.forEach((colCells, colIdx) => {
    const d = new Date(colCells[0].dateStr);
    const month = d.getMonth();
    if (month !== lastMonth) {
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      monthLabels.push({ text: label, colIndex: colIdx });
      lastMonth = month;
    }
  });

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
      <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>STUDY CONSISTENCY</Text>

      {/* Month Labels */}
      <View style={styles.monthLabelsContainer}>
        <View style={styles.dayLabelsSpacer} />
        <View style={styles.weeksHeaderRow}>
          {monthLabels.map((ml, idx) => {
            // Calculate left margin based on column index
            const leftOffset = ml.colIndex * 13; // 10px width + 3px gap
            return (
              <Text 
                key={idx} 
                style={[
                  styles.monthLabel, 
                  { 
                    color: theme.textSecondary,
                    position: 'absolute',
                    left: leftOffset,
                  }
                ]}
              >
                {ml.text}
              </Text>
            );
          })}
        </View>
      </View>

      {/* Grid Container */}
      <View style={styles.heatmapBody}>
        {/* Day of week labels */}
        <View style={styles.dayLabelsCol}>
          <Text style={[styles.dayLabel, { color: theme.textSecondary }]}>Sun</Text>
          <Text style={[styles.dayLabel, { color: theme.textSecondary }]} />
          <Text style={[styles.dayLabel, { color: theme.textSecondary }]}>Tue</Text>
          <Text style={[styles.dayLabel, { color: theme.textSecondary }]} />
          <Text style={[styles.dayLabel, { color: theme.textSecondary }]}>Thu</Text>
          <Text style={[styles.dayLabel, { color: theme.textSecondary }]} />
          <Text style={[styles.dayLabel, { color: theme.textSecondary }]}>Sat</Text>
        </View>

        {/* Heatmap Grid */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gridScroll}>
          <View style={styles.grid}>
            {columns.map((colCells, colIdx) => (
              <View key={colIdx} style={styles.gridColumn}>
                {colCells.map((cell) => {
                  let cellColor: string = theme.background;
                  if (cell.count > 0) {
                    if (cell.count <= 5) cellColor = theme.teal + '30'; // 18% opacity
                    else if (cell.count <= 15) cellColor = theme.teal + '80'; // 50% opacity
                    else cellColor = theme.teal; // 100% opacity
                  } else {
                    cellColor = theme.hairline;
                  }

                  return (
                    <View
                      key={cell.dateStr}
                      style={[
                        styles.cell,
                        { 
                          backgroundColor: cellColor,
                          borderColor: theme.background,
                        }
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Key Legend */}
      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: theme.textSecondary }]}>Less</Text>
        <View style={[styles.legendCell, { backgroundColor: theme.hairline }]} />
        <View style={[styles.legendCell, { backgroundColor: theme.teal + '30' }]} />
        <View style={[styles.legendCell, { backgroundColor: theme.teal + '80' }]} />
        <View style={[styles.legendCell, { backgroundColor: theme.teal }]} />
        <Text style={[styles.legendText, { color: theme.textSecondary }]}>More</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    width: '100%',
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1.0,
  },
  monthLabelsContainer: {
    flexDirection: 'row',
    height: 14,
  },
  dayLabelsSpacer: {
    width: 28,
  },
  weeksHeaderRow: {
    flex: 1,
    height: 14,
    position: 'relative',
  },
  monthLabel: {
    fontSize: 8,
    fontWeight: 'bold',
  },
  heatmapBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayLabelsCol: {
    width: 20,
    height: 88, // 7 cells * 10px + 6 gaps * 3px
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  dayLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    height: 10,
    lineHeight: 10,
  },
  gridScroll: {
    paddingRight: 4,
  },
  grid: {
    flexDirection: 'row',
    gap: 3,
  },
  gridColumn: {
    gap: 3,
  },
  cell: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 0.5,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  legendText: {
    fontSize: 9,
    fontWeight: '600',
  },
  legendCell: {
    width: 9,
    height: 9,
    borderRadius: 2,
  },
});

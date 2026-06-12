import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  Pressable, 
  Image 
} from 'react-native';
import { Sparkles, Award } from 'lucide-react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  Easing,
  SharedValue
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

interface LevelUpModalProps {
  levelInfo: {
    oldLevel: number;
    newLevel: number;
    dopa: number;
    levelName: string;
    badgeUrl: string;
  } | null;
  onClose: () => void;
}

const CLAY_COLORS = [
  '#ff4d8b', // pink
  '#b8a4ed', // lavender
  '#ffb084', // peach
  '#e8b94a', // ochre
  '#a4d4c5', // mint
  '#ff6b5a', // coral
];

interface ParticleData {
  id: number;
  color: string;
  size: number;
  isRound: boolean;
  targetX: number;
  targetY: number;
  rotationDirection: number;
}

interface ParticleComponentProps {
  particle: ParticleData;
  progress: SharedValue<number>;
}

function ParticleComponent({ particle, progress }: ParticleComponentProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const val = progress.value;
    const x = particle.targetX * val;
    // Add a gravity arc pulling them downwards at the end
    const y = particle.targetY * val + 150 * val * val; 
    const scale = 1 - val * 0.4;
    const rotate = `${val * 360 * particle.rotationDirection}deg`;
    const opacity = 1 - val;

    return {
      transform: [
        { translateX: x },
        { translateY: y },
        { scale },
        { rotate }
      ],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        animatedStyle,
        {
          width: particle.size,
          height: particle.size,
          backgroundColor: particle.color,
          borderRadius: particle.isRound ? particle.size / 2 : 2,
        }
      ]}
    />
  );
}

export function LevelUpModal({ levelInfo, onClose }: LevelUpModalProps) {
  const theme = useTheme();
  const progress = useSharedValue(0);
  const [particles, setParticles] = useState<ParticleData[]>([]);

  useEffect(() => {
    if (levelInfo) {
      // Generate 40 random particles
      const newParticles: ParticleData[] = Array.from({ length: 40 }).map((_, i) => {
        const angle = (Math.random() * 80 + 50) * (Math.PI / 180); // 50 to 130 degrees upwards
        const speed = Math.random() * 260 + 140; // travel distance
        return {
          id: i,
          color: CLAY_COLORS[Math.floor(Math.random() * CLAY_COLORS.length)],
          size: Math.random() * 10 + 6,
          isRound: Math.random() > 0.5,
          targetX: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
          targetY: -Math.sin(angle) * speed,
          rotationDirection: Math.random() > 0.5 ? 1 : -1,
        };
      });
      Promise.resolve().then(() => {
        setParticles(newParticles);
      });

      // Trigger animation
      progress.value = 0;
      progress.value = withTiming(1, {
        duration: 2200,
        easing: Easing.out(Easing.quad),
      });
    }
  }, [levelInfo, progress]);

  if (!levelInfo) return null;

  // Local badge mapping matching the relative paths in getLevelInfo
  // Let's resolve the badge file locally on mobile
  const getBadgeSource = (badgeUrl: string) => {
    if (badgeUrl.includes('seeker-badge-1')) return require('../../assets/images/badge/seeker-badge-1.png');
    if (badgeUrl.includes('scribe-badge-2')) return require('../../assets/images/badge/scribe-badge-2.png');
    if (badgeUrl.includes('medic-badge-3')) return require('../../assets/images/badge/medic-badge-3.png');
    if (badgeUrl.includes('scholar-badge-4')) return require('../../assets/images/badge/scholar-badge-4.png');
    if (badgeUrl.includes('savant-badge-5')) return require('../../assets/images/badge/savant-badge-5.png');
    if (badgeUrl.includes('prodigy-6') || badgeUrl.includes('prodigy')) return require('../../assets/images/badge/prodigy-6.png');
    return require('../../assets/images/badge/seeker-badge-1.png');
  };

  return (
    <Modal
      visible={true}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Backdrop overlay */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Reanimated Confetti Layer */}
        <View style={styles.confettiContainer} pointerEvents="none">
          {particles.map(p => (
            <ParticleComponent key={p.id} particle={p} progress={progress} />
          ))}
        </View>

        {/* Modal Card */}
        <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.hairline }]}>
          {/* Top Crown indicator */}
          <View style={[styles.crownBadge, { backgroundColor: theme.ochre, borderColor: theme.hairline }]}>
            <Sparkles size={20} color={theme.text} />
          </View>

          <Text style={[styles.modalSubtitle, { color: theme.pink }]}>LEVEL UP!</Text>
          <Text style={[styles.modalTitle, { color: theme.text }]}>Amazing study milestone!</Text>

          {/* Badge Showcase Card */}
          <View style={[styles.badgeSpotlight, { backgroundColor: theme.backgroundElement, borderColor: theme.hairline }]}>
            <View style={[styles.newStatusBadge, { backgroundColor: theme.background, borderColor: theme.hairline }]}>
              <Award size={12} color={theme.ochre} />
              <Text style={[styles.newStatusText, { color: theme.textSecondary }]}>New Status</Text>
            </View>

            <Image 
              source={getBadgeSource(levelInfo.badgeUrl)}
              style={styles.badgeImage}
              resizeMode="contain"
            />

            <Text style={[styles.oldLevelText, { color: theme.textSecondary }]}>
              Promoted from Level {levelInfo.oldLevel}
            </Text>
            <Text style={[styles.newLevelName, { color: theme.text }]}>
              Level {levelInfo.newLevel}: {levelInfo.levelName}
            </Text>
          </View>

          <Text style={[styles.descriptionText, { color: theme.textSecondary }]}>
            You earned enough Dopa XP this session to level up. Keep practicing, maintain your daily streak, and unlock the next milestone!
          </Text>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.ctaButton,
              { backgroundColor: theme.text, opacity: pressed ? 0.9 : 1 }
            ]}
          >
            <Text style={[styles.ctaText, { color: theme.background }]}>{"Excellent, Let's Continue"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10, 10, 10, 0.4)',
  },
  confettiContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  crownBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: -22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  modalSubtitle: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'Inter, sans-serif',
    letterSpacing: -0.6,
    marginBottom: 16,
  },
  badgeSpotlight: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 24,
    alignItems: 'center',
    position: 'relative',
    marginBottom: 16,
  },
  newStatusBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  newStatusText: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  badgeImage: {
    width: 96,
    height: 96,
    marginBottom: 12,
  },
  oldLevelText: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  newLevelName: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Inter, sans-serif',
    letterSpacing: -0.4,
    marginTop: 2,
  },
  descriptionText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 20,
  },
  ctaButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
});

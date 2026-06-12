import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  Pressable, 
  StyleSheet, 
  ActivityIndicator, 
  Alert, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView 
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSignUp } from '@clerk/expo';
import { ArrowLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/hooks/use-theme';
import { triggerHaptic } from '@/lib/haptics';

export default function VerifyScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const email = (params.email as string) || '';

  // Clerk hooks
  const { signUp, setActive, isLoaded } = useSignUp() as any;

  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleVerifyCode = async () => {
    if (!isLoaded) return;
    if (!verificationCode.trim()) {
      Alert.alert('Required Code', 'Please enter the verification code.');
      return;
    }

    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    try {
      setLoading(true);
      const res = await signUp.attemptEmailAddressVerification({
        code: verificationCode.trim(),
      });

      if (res.status === 'complete') {
        await setActive({ session: res.createdSessionId });
        Alert.alert('Account Verified', 'Your account has been successfully created and linked!');
        // Redirect to profile page
        router.replace('/profile');
      } else {
        console.warn('Sign-up verification incomplete.');
        Alert.alert('Incomplete Verification', 'Verification is still pending.');
      }
    } catch (err: any) {
      console.warn('Verification failed.');
      Alert.alert(
        'Verification Failed', 
        'Invalid verification code. Please check and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <ScrollView 
        contentContainerStyle={[
          styles.scrollContent, 
          { 
            paddingTop: Math.max(insets.top, 16), 
            paddingBottom: Math.max(insets.bottom, 32) 
          }
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back Button */}
        <Pressable 
          onPress={() => {
            triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>

        {/* Title Block */}
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: theme.text }]}>Verify Account</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Enter the 6-digit verification code sent to {email ? <Text style={{ fontWeight: 'bold', color: theme.text }}>{email}</Text> : 'your email address'}.
          </Text>
        </View>

        {/* Form Fields */}
        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Verification Code</Text>
            <TextInput
              value={verificationCode}
              onChangeText={setVerificationCode}
              placeholder="123456"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              maxLength={6}
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              style={[
                styles.input, 
                { 
                  backgroundColor: theme.backgroundElement, 
                  borderColor: isFocused ? theme.pink : theme.hairline,
                  color: theme.text,
                  textAlign: 'center',
                  letterSpacing: 8,
                  fontSize: 20,
                  fontWeight: 'bold',
                }
              ]}
            />
          </View>

          <Pressable
            onPress={handleVerifyCode}
            disabled={loading}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.pink, opacity: pressed || loading ? 0.8 : 1 }
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Verify Account</Text>
            )}
          </Pressable>
        </View>

        {/* Resend Option / Hint */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecondary, textAlign: 'center' }]}>
            {"Didn't receive a code? Check your spam folder or go back to try signing up again."}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  titleBlock: {
    marginTop: 24,
    marginBottom: 32,
    gap: 8,
  },
  title: {
    fontFamily: 'Plain Black, Inter, sans-serif',
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: -1.2,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  form: {
    gap: 20,
  },
  inputContainer: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  footer: {
    marginTop: 'auto',
    paddingVertical: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 250,
  },
});

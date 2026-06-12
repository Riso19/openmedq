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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSignIn, useSSO } from '@clerk/expo';
import { ArrowLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { useTheme } from '@/hooks/use-theme';
import { triggerHaptic } from '@/lib/haptics';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();

  // Clerk hooks
  const { signIn, setActive, isLoaded } = useSignIn() as any;
  const { startSSOFlow } = useSSO();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  const handleOAuthSignIn = async (strategy: 'oauth_google' | 'oauth_apple') => {
    try {
      setLoading(true);
      triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

      const redirectUrl = Linking.createURL('/oauth-native-callback');
      const { createdSessionId, setActive: setOAuthActive } = await startSSOFlow({
        strategy,
        redirectUrl,
      });

      if (createdSessionId && setOAuthActive) {
        await setOAuthActive({ session: createdSessionId });
        Alert.alert('Welcome', 'Successfully signed in!');
        router.replace('/profile');
      }
    } catch (err: any) {
      console.warn('OAuth sign-in failed.');
      if (err.message?.includes('User canceled') || err.message?.includes('cancelled')) {
        return;
      }
      Alert.alert('Sign-In Failed', 'Failed to authenticate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!isLoaded) return;
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required Fields', 'Please enter your email and password.');
      return;
    }

    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    try {
      setLoading(true);
      const res = await signIn.create({
        identifier: email.trim(),
        password: password.trim(),
      });

      if (res.status === 'complete') {
        await setActive({ session: res.createdSessionId });
        Alert.alert('Welcome Back', 'Successfully signed in!');
        // Redirect back to profile page
        router.replace('/profile');
      } else {
        console.warn('Sign-in status incomplete.');
        Alert.alert('Incomplete Sign-In', 'Additional verification is required.');
      }
    } catch (err: any) {
      console.warn('Sign-in failed.');
      Alert.alert(
        'Sign-In Failed', 
        'Please check your credentials and try again.'
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
          <Text style={[styles.title, { color: theme.text }]}>Welcome Back</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Sign in to sync your Spaced Repetition queue and review history.
          </Text>
        </View>

        {/* Form Fields */}
        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Email Address</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="robin@example.com"
              placeholderTextColor={theme.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setIsEmailFocused(true)}
              onBlur={() => setIsEmailFocused(false)}
              style={[
                styles.input, 
                { 
                  backgroundColor: theme.backgroundElement, 
                  borderColor: isEmailFocused ? theme.pink : theme.hairline,
                  color: theme.text
                }
              ]}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setIsPasswordFocused(true)}
              onBlur={() => setIsPasswordFocused(false)}
              style={[
                styles.input, 
                { 
                  backgroundColor: theme.backgroundElement, 
                  borderColor: isPasswordFocused ? theme.pink : theme.hairline,
                  color: theme.text
                }
              ]}
            />
          </View>

          <Pressable
            onPress={handleSignIn}
            disabled={loading}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.pink, opacity: pressed || loading ? 0.8 : 1 }
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Sign In</Text>
            )}
          </Pressable>

          <View style={styles.dividerContainer}>
            <View style={[styles.dividerLine, { backgroundColor: theme.hairline }]} />
            <Text style={[styles.dividerText, { color: theme.textSecondary }]}>or</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.hairline }]} />
          </View>

          <View style={styles.oauthContainer}>
            <Pressable
              onPress={() => handleOAuthSignIn('oauth_google')}
              disabled={loading}
              style={({ pressed }) => [
                styles.oauthButton,
                { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, opacity: pressed || loading ? 0.8 : 1 }
              ]}
            >
              <Text style={[styles.oauthButtonText, { color: theme.text }]}>Continue with Google</Text>
            </Pressable>

            <Pressable
              onPress={() => handleOAuthSignIn('oauth_apple')}
              disabled={loading}
              style={({ pressed }) => [
                styles.oauthButton,
                { backgroundColor: theme.backgroundElement, borderColor: theme.hairline, opacity: pressed || loading ? 0.8 : 1 }
              ]}
            >
              <Text style={[styles.oauthButtonText, { color: theme.text }]}>Continue with Apple</Text>
            </Pressable>
          </View>
        </View>

        {/* Footer Toggle Link */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            {"Don't have an account? "}
          </Text>
          <Pressable 
            onPress={() => {
              triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
              router.replace('/signup' as any);
            }}
          >
            <Text style={[styles.footerLink, { color: theme.pink }]}>Sign Up</Text>
          </Pressable>
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
    fontSize: 15,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 14,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  oauthContainer: {
    gap: 12,
  },
  oauthButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oauthButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

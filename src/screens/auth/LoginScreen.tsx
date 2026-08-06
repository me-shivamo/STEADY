import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { track } from '../../utils/analytics';
import { toUserMessage, isCancellation } from '../../utils/errors';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import { fontWeight, fontFamily } from '../../theme/typography';
import { useScreenChrome } from '../../hooks/useScreenChrome';
import GoogleSignInButton from '../../components/common/GoogleSignInButton';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: Props) {
  useScreenChrome(colors.bgPrimary, 'dark');
  const { signIn, signInWithGoogle, requestPasswordReset } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [resetInfoText, setResetInfoText] = useState<string | null>(null);

  const handleForgotPassword = async () => {
    setErrorText(null);
    setResetInfoText(null);
    const target = email.trim();
    if (!target) {
      setErrorText('Type your email address above first, then tap "Forgot password?" again.');
      return;
    }
    if (resetLoading) return;
    setResetLoading(true);
    try {
      await requestPasswordReset(target);
      setResetInfoText(`If an account exists for ${target}, we've sent it a password-reset link.`);
    } catch (err: any) {
      setErrorText(toUserMessage(err, 'generic'));
    } finally {
      setResetLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorText(null);
    // The tap, not the outcome. Paired with `sign_in`, the gap between them is
    // the OAuth drop-off — people who open the Google sheet and back out —
    // which is invisible if only successful sign-ins are counted.
    track('auth_method_tapped', { method: 'google', screen: 'login' });
    try {
      setGoogleLoading(true);
      await signInWithGoogle();
    } catch (error) {
      // The old guard compared against the string 'User cancelled', which the
      // native module never produces — so a cancelled sign-in showed an error,
      // and every real failure showed Google's developer text verbatim.
      // isCancellation() checks the actual native status code instead.
      if (!isCancellation(error)) {
        setErrorText(toUserMessage(error, 'signIn'));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogin = async () => {
    setErrorText(null);
    setResetInfoText(null);
    if (!email.trim() || !password.trim()) {
      setErrorText('Please enter your email and password.');
      return;
    }
    setIsLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      setErrorText(toUserMessage(err, 'signIn'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header — pinned to top */}
        <View style={styles.header}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Log in to continue your journey.</Text>
        </View>

        {/* Scrollable form area */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Inputs */}
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />

            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(v => !v)}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.forgotButton} onPress={handleForgotPassword} disabled={resetLoading}>
              <Text style={styles.forgotText}>{resetLoading ? 'Sending…' : 'Forgot password?'}</Text>
            </TouchableOpacity>

            {errorText ? <Text style={styles.inlineError}>{errorText}</Text> : null}
            {resetInfoText ? <Text style={styles.inlineInfo}>{resetInfoText}</Text> : null}
          </View>

          {/* Primary CTA — must come FIRST. It used to render below both the
              divider and the Google button, so the screen read "email /
              password / or continue with / Continue with Google / Log In":
              the submit button for the form the user had just filled in sat
              underneath the alternative sign-in method, and underneath a
              divider whose whole job is to introduce that alternative. */}
          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>
              {isLoading ? 'Logging in…' : 'Log In'}
            </Text>
          </TouchableOpacity>

          {/* Divider — now just "or", since the button below already says
              "Continue with Google" and "or continue with / Continue with
              Google" read as a stutter. */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <GoogleSignInButton onPress={handleGoogleSignIn} loading={googleLoading} />

          {/* Switch to signup. The spacing lives on this button rather than on
              a wrapper around the Google button — the previous layout inherited
              its gap from a container that got removed when we adopted the
              shared GoogleSignInButton, and the line collapsed onto it. */}
          <TouchableOpacity style={styles.switchButton} onPress={() => navigation.navigate('Signup')}>
            <Text style={styles.switchText}>
              Don't have an account?{' '}
              <Text style={styles.switchLink}>Sign up</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 44,
    paddingBottom: 16,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    flexGrow: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: fontWeight.semibold,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
  form: {
    gap: 12,
    marginBottom: 22,
  },
  input: {
    height: 46,
    backgroundColor: colors.bgSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    fontSize: 15,
    color: colors.textPrimary,
    fontFamily: fontFamily.regular,
  },
  passwordContainer: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    color: colors.textPrimary,
    fontFamily: fontFamily.regular,
  },
  eyeButton: {
    paddingHorizontal: 14,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotButton: {
    alignSelf: 'flex-end',
  },
  inlineError: {
    fontSize: 13,
    color: colors.error,
    fontFamily: fontFamily.medium,
    textAlign: 'right',
    marginTop: 8,
  },
  inlineInfo: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    textAlign: 'right',
    marginTop: 8,
  },
  forgotText: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: fontWeight.semibold,
    fontFamily: fontFamily.semibold,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 22,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: fontFamily.regular,
  },
  primaryButton: {
    height: 46,
    backgroundColor: colors.accent,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: fontWeight.bold,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.2,
  },
  switchButton: {
    marginTop: 20,
    // Vertical padding gives the 13px text line a real tap target instead of
    // relying on the glyph height alone.
    paddingVertical: 8,
  },
  switchText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
  },
  switchLink: {
    color: colors.accent,
    fontWeight: fontWeight.bold,
    fontFamily: fontFamily.bold,
  },
});

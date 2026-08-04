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
  Linking,
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
import { PRIVACY_URL, TERMS_URL } from '../../constants/legal';
import { useScreenChrome } from '../../hooks/useScreenChrome';
import GoogleSignInButton from '../../components/common/GoogleSignInButton';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Signup'>;
};

export default function SignupScreen({ navigation }: Props) {
  useScreenChrome(colors.bgPrimary, 'dark');
  const { signUp, signInWithGoogle } = useAuthStore();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setErrorText(null);
    track('auth_method_tapped', { method: 'google', screen: 'signup' });
    try {
      setGoogleLoading(true);
      await signInWithGoogle();
    } catch (error: any) {
      // Same dead 'User cancelled' guard as LoginScreen had — the native
      // module reports cancellation via a status code, not that string.
      if (!isCancellation(error)) {
        setErrorText(toUserMessage(error, 'signIn'));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSignup = async () => {
    setErrorText(null);
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setErrorText('Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      setErrorText('Password must be at least 8 characters.');
      return;
    }

    setIsLoading(true);
    try {
      await signUp(email.trim(), password, fullName.trim());
    } catch (err: any) {
      setErrorText(toUserMessage(err, 'signUp'));
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
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>It only takes a minute.</Text>
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
              value={fullName}
              onChangeText={setFullName}
              placeholder="Full name"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              returnKeyType="next"
            />

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

            {/* Password with eye icon inside */}
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
                onSubmitEditing={handleSignup}
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

            {errorText ? <Text style={styles.inlineError}>{errorText}</Text> : null}
          </View>

          {/* Primary CTA first — see the matching comment in LoginScreen. The
              form's own submit button was rendering below the Google button
              and below the divider introducing it. */}
          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>
              {isLoading ? 'Creating account…' : 'Create Account'}
            </Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <GoogleSignInButton onPress={handleGoogleSignIn} loading={googleLoading} />

          {/* Switch to login */}
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.switchText}>
              Already have an account?{' '}
              <Text style={styles.switchLink}>Log in</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Legal — pinned to bottom */}
        <View style={styles.footer}>
          <Text style={styles.legal}>
            By creating an account you agree to our{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>Terms</Text>
            {' & '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy Policy</Text>.
          </Text>
        </View>
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
    paddingBottom: 16,
    flexGrow: 1,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'android' ? 40 : 20,
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
    fontSize: 14,
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
  inlineError: {
    fontSize: 13,
    color: colors.error,
    fontFamily: fontFamily.medium,
    marginTop: 8,
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
  socialButtons: {
    gap: 12,
    marginBottom: 16,
  },
  socialButton: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    gap: 8,
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
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
  legal: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    fontFamily: fontFamily.regular,
  },
  legalLink: {
    color: colors.accent,
    fontWeight: fontWeight.medium,
    fontFamily: fontFamily.medium,
  },
});

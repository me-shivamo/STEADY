import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import { fontWeight, fontFamily } from '../../theme/typography';
import { toUserMessage } from '../../utils/errors';

// Shown by RootNavigator (instead of the app) while authStore.passwordRecovery
// is true — i.e. the user arrived via a password-reset email link and holds a
// recovery session. Completing (or cancelling) the reset clears the flag and
// RootNavigator swaps back to the normal gates.
export default function SetNewPasswordScreen() {
  const completePasswordReset = useAuthStore((s) => s.completePasswordReset);
  const signOut = useAuthStore((s) => s.signOut);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string | null>(null);

  const handleSave = async () => {
    setErrorText(null);
    setInfoText(null);
    if (password.length < 6) {
      setErrorText('Use at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setErrorText("Passwords don't match. Both fields must be identical.");
      return;
    }
    setIsLoading(true);
    try {
      await completePasswordReset(password);
      setInfoText('Password updated. You are signed in with your new password.');
    } catch (err: any) {
      setErrorText(toUserMessage(err, 'generic'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>Set a new password</Text>
          <Text style={styles.subtitle}>You opened a password-reset link. Choose a new password for your account.</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder="New password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              returnKeyType="next"
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(v => !v)}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Confirm new password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          {errorText ? <Text style={styles.inlineError}>{errorText}</Text> : null}
          {infoText ? <Text style={styles.inlineInfo}>{infoText}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>{isLoading ? 'Saving…' : 'Save new password'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={signOut} disabled={isLoading}>
            <Text style={styles.cancelText}>Cancel and sign out</Text>
          </TouchableOpacity>
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
    lineHeight: 22,
    fontFamily: fontFamily.regular,
  },
  form: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 12,
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
  inlineError: {
    fontSize: 13,
    color: colors.error,
    fontFamily: fontFamily.medium,
  },
  inlineInfo: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
  primaryButton: {
    height: 46,
    backgroundColor: colors.accent,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
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
  cancelText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 14,
    fontFamily: fontFamily.regular,
  },
});

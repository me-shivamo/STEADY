import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { colors } from '../../theme/colors';
import { fontWeight } from '../../theme/typography';

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

  const handleSave = async () => {
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert("Passwords don't match", 'Both fields must be identical.');
      return;
    }
    setIsLoading(true);
    try {
      await completePasswordReset(password);
      Alert.alert('Password updated', 'You are signed in with your new password.');
    } catch (err: any) {
      Alert.alert('Could not update password', err.message ?? 'Please try again.');
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
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
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
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 22,
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
  },
  eyeButton: {
    paddingHorizontal: 14,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIcon: {
    fontSize: 16,
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
    letterSpacing: 0.2,
  },
  cancelText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 14,
  },
});

import React from 'react';
import { Text, StyleSheet, TouchableOpacity, ActivityIndicator, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../theme/colors';
import { fontFamily } from '../../theme/typography';

/**
 * "Continue with Google" button.
 *
 * Extracted because LoginScreen and SignupScreen each carried a byte-identical
 * copy of both the button and the logo — two places to keep in sync with
 * Google's branding rules, which is one more than is safe.
 *
 * BRANDING CONSTRAINTS (enforced at OAuth verification, not just style advice):
 *  - The wording must be one of Google's approved strings. "Continue with
 *    Google" is approved; do not reword it.
 *  - The "G" mark must be Google's own artwork, unmodified. The previous copies
 *    used a hand-simplified redraw of the path data (1-decimal coordinates);
 *    the official path is pasted verbatim below.
 *  - The mark needs clear space around it, hence the horizontal padding and gap.
 *
 * NOT changed, deliberately: the border stays `colors.border` so the button
 * matches the text inputs directly above it and the screen reads as one system.
 * An earlier proposal to darken it was based on the idea that white-on-#FAFAFA
 * is invisible — but the email and password fields use the very same fill and
 * border at a *thinner* stroke, so if that were true the whole form would
 * vanish first. If the button ever does need more contrast, that belongs in
 * colors.ts, applied to every surface at once.
 */

function GoogleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
      />
      <Path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <Path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
      />
      <Path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
      />
    </Svg>
  );
}

interface Props {
  onPress: () => void;
  loading?: boolean;
}

export default function GoogleSignInButton({ onPress, loading = false }: Props) {
  return (
    <TouchableOpacity
      style={[styles.button, loading && styles.buttonLoading]}
      activeOpacity={0.8}
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      accessibilityState={{ busy: loading, disabled: loading }}
    >
      <GoogleLogo />
      {/* numberOfLines guards against the label wrapping and blowing out the
          button height at large system font sizes. */}
      <Text style={styles.label} numberOfLines={1}>
        Continue with Google
      </Text>
      {/* The spinner sits in a fixed trailing slot rather than replacing the
          whole content, so the button doesn't visibly resize or go blank while
          the Google sheet is opening. */}
      <View style={styles.spinnerSlot}>
        {loading ? <ActivityIndicator size="small" color={colors.textSecondary} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    // minHeight rather than a fixed 44: Android's minimum touch target is 48dp,
    // and minHeight lets the button grow instead of clipping if the user has
    // large text enabled.
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  buttonLoading: { opacity: 0.7 },
  label: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
  },
  // Reserves the spinner's width at all times so the label doesn't shift
  // sideways when loading starts.
  spinnerSlot: { width: 18, alignItems: 'center' },
});

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { homeColors as C } from '../../theme/homeColors';
import { fontFamily } from '../../theme/typography';

interface InviteCodeCardProps {
  inviteCode: string;
}

export default function InviteCodeCard({ inviteCode }: InviteCodeCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join my group on STEADY! Use invite code ${inviteCode} to join.`,
      });
    } catch {
      // User dismissed the share sheet — nothing to handle.
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.codeCard}>
        <Text style={styles.label}>INVITE CODE</Text>
        <View style={styles.codeRow}>
          <Text style={styles.code}>{inviteCode}</Text>
          <TouchableOpacity
            style={[styles.copyBtn, copied && styles.copyBtnActive]}
            onPress={handleCopy}
            activeOpacity={0.8}
          >
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={copied ? '#fff' : C.accent} />
            <Text style={[styles.copyBtnText, copied && { color: '#fff' }]}>{copied ? 'Copied' : 'Copy'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
        <Ionicons name="share-outline" size={20} color={C.accent} />
        <Text style={styles.shareBtnText}>Share invite link</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 14,
  },
  codeCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 15,
    shadowColor: '#3C285A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    letterSpacing: 0.5,
    color: C.text2,
    textTransform: 'uppercase',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  code: {
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    fontFamily: fontFamily.bold,
    color: C.accent,
    letterSpacing: 0.6,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: C.accentSoft,
  },
  copyBtnActive: {
    backgroundColor: '#2FB67A',
  },
  copyBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: C.accent,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    shadowColor: '#3C285A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  shareBtnText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    color: C.text,
  },
});

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  BackHandler,
  TouchableWithoutFeedback,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Audio } from 'expo-av';
import { FEATURES } from '../config/features'; // ✅ Make sure path is correct

const STEALTH_RECORDINGS_KEY = 'stealthRecordings';

const HiddenFeature = () => {
  const router = useRouter();

  // 🎙️ Stealth recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingBusy, setIsRecordingBusy] = useState(false);
  const [recordingsCount, setRecordingsCount] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);

  // 👆 Triple-tap gesture state for header
  const [tapCount, setTapCount] = useState(0);
  const tapTimeoutRef = useRef<any>(null);

  // Load existing recordings count
  useEffect(() => {
    const loadRecordingsCount = async () => {
      try {
        const existing = await AsyncStorage.getItem(STEALTH_RECORDINGS_KEY);
        if (existing) {
          const list = JSON.parse(existing);
          if (Array.isArray(list)) setRecordingsCount(list.length);
        }
      } catch (e) {
        // silent fail
      }
    };
    loadRecordingsCount();

    // cleanup on unmount
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
    };
  }, []);

  const saveRecordingUri = async (uri: string | null) => {
    if (!uri) return;
    try {
      const existing = await AsyncStorage.getItem(STEALTH_RECORDINGS_KEY);
      const list = existing ? JSON.parse(existing) : [];
      const updated = Array.isArray(list) ? list : [];
      updated.push({
        uri,
        createdAt: new Date().toISOString(),
      });
      await AsyncStorage.setItem(STEALTH_RECORDINGS_KEY, JSON.stringify(updated));
      setRecordingsCount(updated.length);
    } catch (e) {
      // optional: toast
    }
  };

  const startStealthRecording = async () => {
    if (isRecordingBusy || isRecording) return;
    setIsRecordingBusy(true);
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Microphone permission required',
          'Please allow microphone access to use stealth recording.'
        );
        setIsRecordingBusy(false);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setIsRecording(true);
    } catch (e) {
      Alert.alert('Error', 'Could not start recording. Please try again.');
    } finally {
      setIsRecordingBusy(false);
    }
  };

  const stopStealthRecording = async () => {
    if (!isRecording || !recordingRef.current || isRecordingBusy) return;
    setIsRecordingBusy(true);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      await saveRecordingUri(uri);
      recordingRef.current = null;
      setIsRecording(false);
      // Very subtle feedback
      Alert.alert('Saved', 'Audio has been saved securely in the hidden area.');
    } catch (e) {
      Alert.alert('Error', 'Could not stop recording. Please try again.');
    } finally {
      setIsRecordingBusy(false);
    }
  };

  // 🔁 Toggle function for the gesture
  const toggleStealthRecording = async () => {
    if (isRecording) {
      await stopStealthRecording();
    } else {
      await startStealthRecording();
    }
  };

  // 👆 Triple-tap on header within short time
  const handleHeaderTap = () => {
    const nowCount = tapCount + 1;
    setTapCount(nowCount);

    if (nowCount === 1) {
      // start window
      tapTimeoutRef.current = setTimeout(() => {
        setTapCount(0);
      }, 600); // 600ms window for triple-tap
    }

    if (nowCount === 3) {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
      setTapCount(0);
      toggleStealthRecording();
    }
  };

  // 🔐 Biometric + Hidden Notes together
  const revealNotes = async () => {
    if (!FEATURES.hiddenNotes) {
      Alert.alert('Feature Disabled', 'Hidden Notes are not available.');
      return;
    }

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          'Biometric required',
          'Set up fingerprint or face lock on your device to access Hidden Notes.'
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to access hidden notes',
        fallbackLabel: 'Use device PIN',
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        router.push('/hiddennotes');
      } else {
        Alert.alert(
          'Authentication failed',
          'Could not verify your identity. Try again when it is safe.'
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong. Try again.');
    }
  };

  // 🕵️ Discreet mode – same behavior (exit to home)
  const disguiseExit = () => {
    Alert.alert('🕵️ Exit', 'App will now exit silently.');
    BackHandler.exitApp();
  };

  // 📌 Safety tips
  const showSafetyTips = () => {
    Alert.alert(
      'Safety Tips',
      [
        '• Keep your phone locked with a strong PIN.',
        '• Turn off message previews on the lock screen.',
        '• Regularly clear recent apps and browser history.',
        '• Use this hidden area only when it feels safe to do so.',
      ].join('\n')
    );
  };

  const logoutUser = async () => {
    try {
      await AsyncStorage.multiRemove(['username', 'userPin', 'isRegistered']);
      Alert.alert('Logged out', 'You have been logged out.', [
        { text: 'OK', onPress: () => router.replace('/register') },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to log out. Try again.');
    }
  };

  // 🔐 Biometric-protected access to Stealth Recordings
  const openStealthRecordings = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          'Biometric required',
          'Set up fingerprint or face lock on your device to view stealth recordings.'
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to view stealth recordings',
        fallbackLabel: 'Use device PIN',
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        router.push('/stealthrecordings');
      } else {
        Alert.alert(
          'Authentication failed',
          'Could not verify your identity. Try again when it is safe.'
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong. Try again.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header is tappable (triple tap gesture) */}
      <TouchableWithoutFeedback onPress={handleHeaderTap}>
        <View style={styles.header}>
          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Private Area</Text>
            </View>
            {isRecording && (
              <View className="record-indicator" style={styles.recordDotWrapper}>
                <View style={styles.recordDot} />
                <Text style={styles.recordText}>Recording…</Text>
              </View>
            )}
          </View>
          <Text style={styles.title}>Hidden Safety Tools</Text>
          <Text style={styles.subtitle}>
            Use these options when you need extra privacy, quick exit, or to protect your data.
          </Text>
        </View>
      </TouchableWithoutFeedback>

      <View style={styles.cardsContainer}>
        {/* Hidden Notes + Biometric */}
        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.card, styles.primaryCard]}
          onPress={revealNotes}
        >
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Hidden Notes</Text>
            <Text style={styles.cardTag}>Biometric lock</Text>
          </View>
          <Text style={styles.cardDescription}>
            Secure notes protected with your fingerprint/face when available. Access is blocked if biometrics are not set up.
          </Text>
        </TouchableOpacity>

        {/* Discreet Exit – same behavior (exit app → home) */}
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.card}
          onPress={disguiseExit}
        >
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Discreet Exit</Text>
            <Text style={styles.cardTagMuted}>Instant close</Text>
          </View>
          <Text style={styles.cardDescription}>
            Quickly close the app so that your phone looks normal and returns to the home screen.
          </Text>
        </TouchableOpacity>

        {/* View recordings list (biometric protected) */}
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.card}
          onPress={openStealthRecordings}
        >
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Stealth Recordings</Text>
            <Text style={styles.cardTagMuted}>
              {recordingsCount > 0 ? `${recordingsCount} saved` : 'No recordings yet'}
            </Text>
          </View>
          <Text style={styles.cardDescription}>
            View and manage audio clips captured from the hidden gesture tool. Protected by biometric authentication.
          </Text>
        </TouchableOpacity>

        {/* Safety Tips */}
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.card}
          onPress={showSafetyTips}
        >
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Safety Tips</Text>
            <Text style={styles.cardTagMuted}>Guidance</Text>
          </View>
          <Text style={styles.cardDescription}>
            Quickly read important privacy and safety tips for using this app without raising suspicion.
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.logoutButton}
          onPress={logoutUser}
        >
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
        <Text style={styles.footerHint}>
          Tip: Only use these tools when you are sure no one is watching your screen.
        </Text>
      </View>
    </View>
  );
};

export default HiddenFeature;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617', // deep slate
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 28,
  },
  header: {
    marginBottom: 18,
    marginTop: 8,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.25)',
    marginRight: 8,
  },
  pillText: {
    fontSize: 11,
    letterSpacing: 0.5,
    color: '#e5e7eb',
  },
  recordDotWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginRight: 4,
  },
  recordText: {
    fontSize: 11,
    color: '#fecaca',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#9ca3af',
    lineHeight: 18,
  },
  cardsContainer: {
    flex: 1,
    paddingVertical: 8,
  },
  card: {
    backgroundColor: '#020617',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  primaryCard: {
    borderColor: 'rgba(129, 140, 248, 0.9)',
    shadowColor: '#4f46e5',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  cardTag: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(129, 140, 248, 0.15)',
    color: '#a5b4fc',
  },
  cardTagMuted: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    color: '#cbd5f5',
  },
  cardDescription: {
    fontSize: 13,
    color: '#9ca3af',
    lineHeight: 18,
  },
  footer: {
    marginTop: 4,
  },
  logoutButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 13,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: '#fef2f2',
    fontSize: 15,
    fontWeight: '600',
  },
  footerHint: {
    marginTop: 8,
    fontSize: 11,
    textAlign: 'center',
    color: '#6b7280',
  },
});

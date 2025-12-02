import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';

const STEALTH_RECORDINGS_KEY = 'stealthRecordings';

const StealthRecordings = () => {
  const router = useRouter();
  const [recordings, setRecordings] = useState<any[]>([]);
  const [currentUri, setCurrentUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const loadRecordings = async () => {
    try {
      const existing = await AsyncStorage.getItem(STEALTH_RECORDINGS_KEY);
      const list = existing ? JSON.parse(existing) : [];
      if (Array.isArray(list)) {
        // newest first
        setRecordings(list.slice().reverse());
      } else {
        setRecordings([]);
      }
    } catch (e) {
      setRecordings([]);
    }
  };

  useEffect(() => {
    loadRecordings();

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const stopCurrentSound = async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (e) {
        // ignore
      } finally {
        soundRef.current = null;
      }
    }
  };

  const togglePlay = async (item: any) => {
    if (isBusy) return;
    setIsBusy(true);

    try {
      // If same recording & already playing -> pause
      if (currentUri === item.uri && isPlaying) {
        if (soundRef.current) {
          await soundRef.current.pauseAsync();
        }
        setIsPlaying(false);
        setIsBusy(false);
        return;
      }

      // If same uri but paused -> resume
      if (currentUri === item.uri && !isPlaying) {
        if (soundRef.current) {
          await soundRef.current.playAsync();
          setIsPlaying(true);
          setIsBusy(false);
          return;
        }
      }

      // Different recording -> stop current, play new
      await stopCurrentSound();

      const { sound } = await Audio.Sound.createAsync({ uri: item.uri });
      soundRef.current = sound;
      setCurrentUri(item.uri);
      setIsPlaying(true);

      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          setIsPlaying(false);
          setCurrentUri(null);
        }
      });

      await sound.playAsync();
    } catch (e) {
      Alert.alert('Error', 'Could not play this recording.');
    } finally {
      setIsBusy(false);
    }
  };

  const deleteRecording = (item: any) => {
    Alert.alert(
      'Delete recording?',
      'This audio will be removed permanently from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // underlying stored order is oldest first
              const existing = await AsyncStorage.getItem(STEALTH_RECORDINGS_KEY);
              const list = existing ? JSON.parse(existing) : [];
              if (Array.isArray(list)) {
                const filtered = list.filter((r: any) => r.uri !== item.uri);
                await AsyncStorage.setItem(
                  STEALTH_RECORDINGS_KEY,
                  JSON.stringify(filtered)
                );
              }
              // refresh UI list
              await loadRecordings();

              // stop audio if deleting currently playing
              if (currentUri === item.uri) {
                await stopCurrentSound();
                setCurrentUri(null);
                setIsPlaying(false);
              }
            } catch (e) {
              Alert.alert('Error', 'Could not delete this recording.');
            }
          },
        },
      ]
    );
  };

  const clearAllRecordings = () => {
    if (!recordings.length) return;
    Alert.alert(
      'Delete all recordings?',
      'All stealth recordings will be removed permanently from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(STEALTH_RECORDINGS_KEY);
              await stopCurrentSound();
              setRecordings([]);
              setCurrentUri(null);
              setIsPlaying(false);
            } catch (e) {
              Alert.alert('Error', 'Could not delete all recordings.');
            }
          },
        },
      ]
    );
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString()} • ${d.toLocaleTimeString()}`;
    } catch {
      return iso;
    }
  };

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isThisPlaying = currentUri === item.uri && isPlaying;
    return (
      <View style={styles.itemCard}>
        <View style={styles.itemTopRow}>
          <Text style={styles.itemTitle}>Recording {recordings.length - index}</Text>
          <Text style={styles.itemTime}>{formatDate(item.createdAt)}</Text>
        </View>

        <View style={styles.itemActionsRow}>
          <TouchableOpacity
            style={[
              styles.itemButton,
              isThisPlaying && styles.itemButtonActive,
            ]}
            onPress={() => togglePlay(item)}
            disabled={isBusy}
          >
            <Text style={styles.itemButtonText}>
              {isThisPlaying ? 'Pause' : 'Play'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.itemButton, styles.deleteButton]}
            onPress={() => deleteRecording(item)}
            disabled={isBusy}
          >
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Stealth Recordings</Text>
        <Text style={styles.subtitle}>
          These audio clips were captured from the hidden area. Play or delete them safely.
        </Text>
      </View>

      {/* List */}
      <View style={styles.listContainer}>
        {recordings.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No recordings yet</Text>
            <Text style={styles.emptyText}>
              Press and hold the Stealth Audio Recorder card in the hidden area to capture audio secretly.
            </Text>
          </View>
        ) : (
          <FlatList
            data={recordings}
            keyExtractor={(item) => item.uri}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>

      {/* Footer actions */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.clearAllButton,
            !recordings.length && { opacity: 0.4 },
          ]}
          onPress={clearAllRecordings}
          disabled={!recordings.length}
        >
          <Text style={styles.clearAllText}>Delete All Recordings</Text>
        </TouchableOpacity>
        <Text style={styles.footerHint}>
          Recordings are stored only on this device and can be erased at any time.
        </Text>
      </View>
    </View>
  );
};

export default StealthRecordings;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
  },
  header: {
    marginBottom: 16,
  },
  backButton: {
    marginBottom: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  backText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#9ca3af',
    lineHeight: 18,
  },
  listContainer: {
    flex: 1,
    marginTop: 8,
  },
  itemCard: {
    backgroundColor: '#020617',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    padding: 12,
    marginBottom: 10,
  },
  itemTopRow: {
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e5e7eb',
    marginBottom: 2,
  },
  itemTime: {
    fontSize: 11,
    color: '#9ca3af',
  },
  itemActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 10,
  },
  itemButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.5)',
  },
  itemButtonActive: {
    borderColor: 'rgba(129, 140, 248, 0.9)',
  },
  itemButtonText: {
    fontSize: 13,
    color: '#e5e7eb',
  },
  deleteButton: {
    borderColor: 'rgba(248, 113, 113, 0.7)',
  },
  deleteButtonText: {
    fontSize: 13,
    color: '#fecaca',
  },
  emptyState: {
    marginTop: 40,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e5e7eb',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 18,
  },
  footer: {
    marginTop: 10,
  },
  clearAllButton: {
    backgroundColor: '#ef4444',
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 6,
  },
  clearAllText: {
    color: '#fef2f2',
    fontSize: 14,
    fontWeight: '600',
  },
  footerHint: {
    fontSize: 11,
    textAlign: 'center',
    color: '#6b7280',
  },
});

// PrivateMediaSaver.js
// Private Media Vault (images/videos/audio)
// Required packages:
// expo install expo-file-system expo-document-picker expo-media-library @react-native-async-storage/async-storage expo-av expo-linear-gradient expo-image-picker expo-clipboard
//
// Optional for Android deletion to be more reliable:
// add READ_EXTERNAL_STORAGE / WRITE_EXTERNAL_STORAGE in app.json (see bottom notes) and rebuild native app (expo prebuild / EAS).

import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
  Appearance, FlatList, Image, Modal, SafeAreaView, StatusBar, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
// use legacy version so copyAsync/downloadAsync behave consistently for wide SDKs
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { Audio, Video } from 'expo-av';

const FILES_META_KEY = '@saved_media_meta_v_final';
const ALLOWED_MIME_PREFIX = ['image/', 'video/', 'audio/'];
const ALLOWED_EXT = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif',
  '.mp4', '.mov', '.m4v', '.mkv',
  '.mp3', '.m4a', '.wav', '.aac'
];

const randomId = (prefix = '') => prefix + Math.random().toString(36).slice(2, 9);
function getExtFromName(name) { if (!name || !name.includes('.')) return ''; return '.' + name.split('.').pop().toLowerCase(); }
function isImage(name, mime) { if (mime) return mime.startsWith('image/'); return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(getExtFromName(name)); }
function isVideo(name, mime) { if (mime) return mime.startsWith('video/'); return ['.mp4', '.mov', '.m4v', '.mkv'].includes(getExtFromName(name)); }
function isAudio(name, mime) { if (mime) return mime.startsWith('audio/'); return ['.mp3', '.m4a', '.wav', '.aac'].includes(getExtFromName(name)); }

/**
 * Best-effort delete:
 * - Attempts file:// deletion (fast)
 * - Attempts to find & delete via MediaLibrary by scanning recent assets (requires permission)
 * - Falls back to FileSystem.deleteAsync on raw URI
 *
 * NOTE: Searching & deleting in media library can be expensive, and permission is requested only when needed.
 */
async function tryDeleteOriginal(uri, nameHint) {
  try {
    if (!uri) return false;

    // 1) file:// direct removal (works for expo-image-picker cache / many local files)
    if (uri.startsWith('file://')) {
      try {
        const path = uri.replace('file://', '');
        await FileSystem.deleteAsync(path, { idempotent: true });
        return true;
      } catch (e) {
        console.warn('file:// delete failed', e);
      }
    }

    // 2) Try MediaLibrary deletion (if it looks like a content/media uri)
    // Request permission and scan recent assets to try to find a matching asset to delete.
    try {
      // We'll request permission only when necessary
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        // Fetch assets in pages and try to find best match by localUri or filename.
        let after = null;
        const pageSize = 200;
        for (let page = 0; page < 8; page++) { // limit loops to avoid performance issues
          const fetch = await MediaLibrary.getAssetsAsync({
            first: pageSize,
            mediaType: ['photo', 'video', 'audio'],
            after,
          });
          const assets = fetch.assets || [];
          if (!assets.length) break;
          // find by exact localUri, by filename, or localUri containing name
          const match = assets.find(a => {
            if (a.localUri && uri && a.localUri === uri) return true;
            if (a.filename && nameHint && a.filename === nameHint) return true;
            if (a.localUri && nameHint && a.localUri.includes(nameHint)) return true;
            return false;
          });
          if (match) {
            try {
              await MediaLibrary.deleteAssetsAsync([match.id]);
              return true;
            } catch (e) {
              console.warn('MediaLibrary.deleteAssetsAsync failed', e);
              break; // don't loop forever if delete fails
            }
          }
          if (!fetch.hasNextPage) break;
          after = assets[assets.length - 1]?.id;
          if (!after) break;
        }
      } else {
        console.warn('MediaLibrary permission not granted:', status);
      }
    } catch (e) {
      console.warn('MediaLibrary deletion attempt failed', e);
    }

    // 3) Try deleting raw URI with FileSystem.deleteAsync as last in-process attempt
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      return true;
    } catch (e) {
      console.warn('FileSystem.deleteAsync fallback failed', e);
    }

    return false;
  } catch (err) {
    console.warn('tryDeleteOriginal ultimate fail', err);
    return false;
  }
}

/**
 * Robust copy into app storage:
 * Strategies attempted (in order):
 * 1) FileSystem.copyAsync
 * 2) FileSystem.downloadAsync
 * 3) readAsStringAsync Base64 -> writeAsStringAsync Base64 (fallback)
 *
 * Returns: { dest, deleted, debugCollector }
 * Throws error if all strategies fail; error.debugCollector contains step-by-step info.
 */
async function copyToAppStorageAndRemoveOriginal(uri, name, debugCollector = []) {
  const ext = getExtFromName(name) || '';
  const destName = `${randomId('media-')}${ext || ''}`;
  const dest = FileSystem.documentDirectory + destName;

  // Strategy 1: copyAsync
  try {
    await FileSystem.copyAsync({ from: uri, to: dest });
    debugCollector.push({ step: 'copyAsync success' });
    const deleted = await tryDeleteOriginal(uri, name);
    return { dest, deleted, debugCollector };
  } catch (e) {
    debugCollector.push({ step: 'copyAsync failed', error: String(e) });
    console.warn('copyAsync failed', e);
  }

  // Strategy 2: downloadAsync
  try {
    const r = await FileSystem.downloadAsync(uri, dest);
    debugCollector.push({ step: 'downloadAsync result', r });
    const deleted = await tryDeleteOriginal(uri, name);
    return { dest, deleted, debugCollector };
  } catch (e) {
    debugCollector.push({ step: 'downloadAsync failed', error: String(e) });
    console.warn('downloadAsync failed', e);
  }

  // Strategy 3: base64 read/write fallback
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });
    debugCollector.push({ step: 'base64 read/write success' });
    const deleted = await tryDeleteOriginal(uri, name);
    return { dest, deleted, debugCollector };
  } catch (e) {
    debugCollector.push({ step: 'base64 fallback failed', error: String(e) });
    console.warn('base64 fallback failed', e);
  }

  const err = new Error('Unable to copy file into app storage (provider restriction). See debugCollector for steps.');
  err.debugCollector = debugCollector;
  throw err;
}

// ---------------- Component ----------------
const PrivateMediaSaver = ({ themeOverride = 'system' }) => {
  const systemScheme = Appearance.getColorScheme() || 'light';
  const [effectiveScheme, setEffectiveScheme] = useState(themeOverride === 'system' ? systemScheme : themeOverride);
  useEffect(() => {
    if (themeOverride === 'system') {
      const sub = Appearance.addChangeListener(({ colorScheme }) => setEffectiveScheme(colorScheme || 'light'));
      return () => sub.remove();
    }
    setEffectiveScheme(themeOverride === 'system' ? systemScheme : themeOverride);
  }, [themeOverride]);

  const dark = effectiveScheme === 'dark';
  const styles = getStyles(dark);

  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null); // { uri, type }
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(FILES_META_KEY);
      if (raw) setFiles(JSON.parse(raw));
    })();
  }, []);

  const persistFiles = async (next) => {
    setFiles(next);
    await AsyncStorage.setItem(FILES_META_KEY, JSON.stringify(next));
  };

  // Main action: use ImagePicker for images/videos, fallback DocumentPicker for audio/other providers
  const pickAndSave = async () => {
    try {
      setSaving(true);

      // Request permission: some Android devices need permission for ImagePicker to list gallery
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission required', 'Allow access to media to pick images or videos.');
        setSaving(false);
        return;
      }

      // Use ImagePicker - still works reliably for images & videos
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 1,
      });

      if (picked && (picked.cancelled === true || picked.canceled === true)) {
        // fallback: document picker (helpful for audio or cloud-supplied URIs)
        const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false });
        if (res.type === 'cancel') {
          setSaving(false);
          return;
        }
        await handlePickedFile(res);
      } else {
        // image-picker returned asset (newer SDKs may put asset in picked.assets)
        let asset = Array.isArray(picked?.assets) && picked.assets.length > 0 ? picked.assets[0] : picked;
        const uri = asset.uri;
        const ext = uri.includes('.') ? '.' + uri.split('.').pop().split('?')[0] : '';
        const name = asset.fileName || (`media${ext}`);
        const size = asset.fileSize || 0;
        const mimeType = asset.type ? (asset.type === 'image' ? 'image/jpeg' : asset.type) : null;

        await handlePickedFile({ uri, name, size, mimeType, rawAsset: asset });
      }
    } catch (err) {
      console.warn('pickAndSave error', err);
      Alert.alert('Error', 'Could not pick or save media. ' + (err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handlePickedFile = async ({ uri, name, size, mimeType }) => {
    // Debug object for easy paste if failure occurs
    const debugSmall = { uri, name, size, mimeType };
    console.log('PICKED OBJECT:', debugSmall);

    // Validate by MIME then extension
    const allowedByMime = mimeType && ALLOWED_MIME_PREFIX.some((p) => mimeType.startsWith(p));
    const ext = getExtFromName(name || uri);
    const allowedByExt = ext && ALLOWED_EXT.includes(ext);

    if (!allowedByMime && !allowedByExt) {
      Alert.alert('Unsupported file', 'Only images, videos, and audio files are allowed.');
      return;
    }

    // Try copying aggressively (safe)
    try {
      const result = await copyToAppStorageAndRemoveOriginal(uri, name || ('media' + ext));
      const meta = {
        id: randomId('m-'),
        originalName: name || result.dest.split('/').pop(),
        storedPath: result.dest,
        size: size || 0,
        savedAt: Date.now(),
        deletedOriginal: !!result.deleted,
      };

      const next = [meta, ...files];
      await persistFiles(next);
      Alert.alert('Saved', `${meta.originalName} saved to app vault.${result.deleted ? ' Original removed.' : ' Original could not be removed.'}`);
      return;
    } catch (err) {
      console.warn('final copy failed', err);
      const small = {
        uri,
        name,
        mimeType,
        size,
        debugCollector: err.debugCollector || [],
        message: err.message || String(err),
      };
      // copy debug to clipboard for easy paste into chat if needed
      try { await Clipboard.setStringAsync(JSON.stringify(small, null, 2)); } catch (e) { /* ignore */ }
      Alert.alert(
        'Save failed',
        'Could not copy file into app storage. Debug info copied to clipboard — paste it here so I can patch the provider.',
      );
      return;
    }
  };

  const openMedia = async (item) => {
    try {
      const uri = item.storedPath;
      if (isImage(item.originalName, null)) setPreview({ uri, type: 'image' });
      else if (isVideo(item.originalName, null)) setPreview({ uri, type: 'video' });
      else if (isAudio(item.originalName, null)) setPreview({ uri, type: 'audio' });
      else setPreview({ uri, type: 'file' });
    } catch (err) {
      console.warn('Open media error', err);
      Alert.alert('Error', 'Could not open media');
    }
  };

  const removeMedia = async (item) => {
    try { await FileSystem.deleteAsync(item.storedPath, { idempotent: true }); } catch (e) { console.warn(e); }
    const next = files.filter((f) => f.id !== item.id);
    await persistFiles(next);
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => openMedia(item)}>
      {isImage(item.originalName, null) ? (
        <Image source={{ uri: item.storedPath }} style={styles.thumb} />
      ) : isVideo(item.originalName, null) ? (
        <View style={styles.thumbPlaceholder}><Text style={styles.thumbText}>🎥</Text></View>
      ) : isAudio(item.originalName, null) ? (
        <View style={styles.thumbPlaceholder}><Text style={styles.thumbText}>🎵</Text></View>
      ) : (
        <View style={styles.thumbPlaceholder}><Text style={styles.thumbText}>📄</Text></View>
      )}
      <Text style={styles.name} numberOfLines={1}>{item.originalName}</Text>
      <View style={styles.rowBetween}>
        <Text style={styles.small}>{item.deletedOriginal ? 'Original removed' : 'Original kept'}</Text>
        <TouchableOpacity onPress={() => removeMedia(item)}><Text style={styles.delete}>Delete</Text></TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={dark ? ['#05060a', '#071027'] : ['#f6f8ff', '#e9f0ff']} style={{ flex: 1 }}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.headerWrap}>
          <Text style={[styles.title]}>Private Media Vault</Text>
          <Text style={[styles.subtitle]}>Save images, videos and audio — originals removed when possible.</Text>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <View style={styles.controls}>
            <TouchableOpacity style={styles.primary} onPress={pickAndSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save Media</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {files.length === 0 ? (
          <View style={styles.empty}><Text style={styles.emptyText}>No saved media yet — tap Save Media to add.</Text></View>
        ) : (
          <FlatList data={files} keyExtractor={(i) => i.id} renderItem={renderItem} numColumns={2} style={{ flex: 1 }} contentContainerStyle={{ padding: 8 }} />
        )}

        <Modal visible={!!preview} onRequestClose={() => { setPreview(null); setPlaying(false); }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: dark ? '#000' : '#fff' }}>
            <View style={{ padding: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
              <TouchableOpacity onPress={() => { setPreview(null); setPlaying(false); }}><Text style={{ color: dark ? '#fff' : '#000' }}>Close</Text></TouchableOpacity>
            </View>

            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              {preview?.type === 'image' && <Image source={{ uri: preview.uri }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />}
              {preview?.type === 'video' && <Video source={{ uri: preview.uri }} style={{ width: '100%', height: 300 }} useNativeControls resizeMode="contain" />}
              {preview?.type === 'audio' && (
                <View style={{ width: '100%', padding: 20 }}>
                  <Text style={{ color: dark ? '#fff' : '#000', marginBottom: 12 }}>Play audio</Text>
                  <TouchableOpacity
                    onPress={async () => {
                      if (!playing) {
                        const { sound } = await Audio.Sound.createAsync({ uri: preview.uri });
                        audioRef.current = sound;
                        await sound.playAsync();
                        setPlaying(true);
                      } else {
                        await audioRef.current?.stopAsync();
                        await audioRef.current?.unloadAsync();
                        setPlaying(false);
                      }
                    }}
                    style={{ backgroundColor: '#1e88e5', padding: 12, borderRadius: 8 }}
                  >
                    <Text style={{ color: '#fff' }}>{playing ? 'Stop' : 'Play'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default PrivateMediaSaver;

const getStyles = (dark = false) => StyleSheet.create({
  headerWrap: { paddingTop: 28, paddingHorizontal: 16, paddingBottom: 8 }, // moved lower to avoid camera notch
  title: { fontSize: 22, fontWeight: '700', color: dark ? '#e6eefc' : '#0b3d91', marginBottom: 6 },
  subtitle: { color: dark ? '#9fb3d9' : '#556', marginBottom: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  primary: { backgroundColor: '#1e88e5', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  primaryText: { color: '#fff', fontWeight: '700' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: dark ? '#9fb3d9' : '#666' },
  card: { flex: 1, margin: 8, backgroundColor: dark ? '#071026' : '#fff', borderRadius: 12, padding: 10, alignItems: 'center' },
  thumb: { width: '100%', height: 120, borderRadius: 8 },
  thumbPlaceholder: { width: '100%', height: 120, borderRadius: 8, backgroundColor: dark ? '#06324a' : '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  thumbText: { fontSize: 32 },
  name: { marginTop: 8, color: dark ? '#e6eefc' : '#111' },
  rowBetween: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  small: { color: dark ? '#9fb3d9' : '#666', fontSize: 12 },
  delete: { color: '#ff476f', fontWeight: '700' },
});

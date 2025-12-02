// app/locationshare.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Share,
  Linking,
  Appearance,
  StatusBar,
  FlatList,
  SafeAreaView,
  Modal,
} from "react-native";
import * as Location from "expo-location";
import * as Clipboard from "expo-clipboard";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";

const SAVED_KEY = "@saved_locations_v2";

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f1724" }] },
];

function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 9);
}

export default function LocationShare({ themeOverride = "system" }: { themeOverride?: "light" | "dark" | "system" }) {
  const systemColorScheme = Appearance.getColorScheme() || "light";
  const [effectiveScheme, setEffectiveScheme] = useState(themeOverride === "system" ? systemColorScheme : themeOverride);
  useEffect(() => {
    if (themeOverride === "system") {
      const sub = Appearance.addChangeListener(({ colorScheme }) => setEffectiveScheme(colorScheme || "light"));
      return () => sub.remove();
    }
    setEffectiveScheme(themeOverride === "system" ? systemColorScheme : themeOverride);
  }, [themeOverride]);

  const dark = effectiveScheme === "dark";
  const styles = getStyles(dark);

  const [location, setLocation] = useState<{ latitude: number; longitude: number; timestamp: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedLocations, setSavedLocations] = useState<
    Array<{ id: string; latitude: number; longitude: number; address?: string | null; savedAt: number }>
  >([]);
  const [showSavedList, setShowSavedList] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SAVED_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setSavedLocations(parsed);
        }
      } catch (e) {
        console.warn("Load saved locations failed", e);
      }
    })();
  }, []);

  // Helper: request permission
  const requestPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === "granted";
    } catch (e) {
      console.warn("Permission error", e);
      return false;
    }
  };

  // Fetch current device location + reverse-geocode to address
  const fetchLocation = async () => {
    setLoading(true);
    try {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert(
          "Location permission required",
          "Please allow location access to fetch your current position.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open settings", onPress: () => Linking.openSettings && Linking.openSettings() },
          ]
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest, maximumAge: 5000 });
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, timestamp: loc.timestamp || Date.now() };
      setLocation(coords);

      // reverse geocode
      try {
        const places = await Location.reverseGeocodeAsync({ latitude: coords.latitude, longitude: coords.longitude });
        if (places && places.length > 0) {
          const p = places[0];
          const formatted = [p.name, p.street, p.subregion || p.city, p.region, p.postalCode, p.country].filter(Boolean).join(", ");
          setAddress(formatted || null);
        } else {
          setAddress(null);
        }
      } catch (err) {
        console.warn("Reverse geocode error", err);
        setAddress(null);
      }
    } catch (err) {
      console.warn("Fetch location failed", err);
      Alert.alert("Error", "Unable to fetch location: " + String((err as any)?.message || err));
    } finally {
      setLoading(false);
    }
  };

  // Save current location into saved list (persist to AsyncStorage)
  const saveLocation = async () => {
    if (!location) {
      Alert.alert("No location", "Please fetch current location first.");
      return;
    }
    const record = { id: uid("loc-"), latitude: location.latitude, longitude: location.longitude, address: address || null, savedAt: Date.now() };
    try {
      const next = [record, ...savedLocations];
      setSavedLocations(next);
      await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next));
      Alert.alert("Saved", "Location saved to vault.");
    } catch (err) {
      console.warn("Save failed", err);
      Alert.alert("Error", "Could not save location.");
    }
  };

  // Open coordinates in native maps
  const openInMaps = (lat: number, lon: number) => {
    const url =
      Platform.OS === "ios"
        ? `maps:0,0?q=${lat},${lon}`
        : `geo:${lat},${lon}?q=${lat},${lon}`;
    Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/?q=${lat},${lon}`));
  };

  // Copy a saved location or current to clipboard (maps url + coords)
  const copyToClipboard = async (lat: number, lon: number) => {
    const url = `https://maps.google.com/?q=${lat},${lon}`;
    await Clipboard.setStringAsync(`${url}\nLat: ${lat}\nLon: ${lon}`);
    Alert.alert("Copied", "Location copied to clipboard.");
  };

  // Share a saved location or current
  const shareLocation = async (lat: number, lon: number, addr?: string | null) => {
    const url = `https://maps.google.com/?q=${lat},${lon}`;
    try {
      await Share.share({ message: `${addr ? addr + "\n" : ""}${url}`, title: "My location", url });
    } catch (e) {
      console.warn("Share failed", e);
    }
  };

  // When user taps a saved item we preview it (load into preview area)
  const previewSaved = (rec: { id: string; latitude: number; longitude: number; address?: string | null; savedAt: number }) => {
    setLocation({ latitude: rec.latitude, longitude: rec.longitude, timestamp: rec.savedAt });
    setAddress(rec.address ?? null);
    setShowSavedList(false);
  };

  // Remove saved location
  const removeSaved = async (id: string) => {
    Alert.alert("Delete saved location", "Delete this saved location?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const next = savedLocations.filter((s) => s.id !== id);
          setSavedLocations(next);
          await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next));
        },
      },
    ]);
  };

  // Determine which coords to show in map: prefer current fetched then last saved
  const displayed = (() => {
    if (location) return { lat: location.latitude, lon: location.longitude, time: location.timestamp, addr: address ?? null };
    if (savedLocations.length > 0) {
      const s = savedLocations[0];
      return { lat: s.latitude, lon: s.longitude, time: s.savedAt, addr: s.address ?? null };
    }
    return null;
  })();

  return (
    <>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
      <LinearGradient colors={dark ? ["#0b1220", "#071027"] : ["#f6f8ff", "#e9f0ff"]} style={styles.wrapper}>
        <SafeAreaView style={styles.container}>
          <Text style={styles.title}>📍 Quick Location</Text>
          <Text style={styles.subtitle}>Get, preview, copy, share or save your current position</Text>

          <TouchableOpacity style={[styles.actionButton, loading && styles.disabledButton]} onPress={fetchLocation} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>Get Current Location</Text>}
          </TouchableOpacity>

          {displayed ? (
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.coord}>
                    Latitude: <Text style={styles.bold}>{displayed.lat.toFixed(6)}</Text>
                  </Text>
                  <Text style={styles.coord}>
                    Longitude: <Text style={styles.bold}>{displayed.lon.toFixed(6)}</Text>
                  </Text>
                  {displayed.addr ? <Text style={styles.address}>🏠 {displayed.addr}</Text> : <Text style={styles.address}>Address unavailable</Text>}
                  <Text style={styles.time}>⏱ {new Date(displayed.time).toLocaleString()}</Text>
                </View>
                <View style={{ width: 12 }} />
              </View>

              <View style={styles.mapWrapper}>
                <MapView
                  style={styles.map}
                  provider={PROVIDER_GOOGLE}
                  customMapStyle={dark ? DARK_MAP_STYLE : []}
                  initialRegion={{
                    latitude: displayed.lat,
                    longitude: displayed.lon,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                  region={{
                    latitude: displayed.lat,
                    longitude: displayed.lon,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                >
                  <Marker coordinate={{ latitude: displayed.lat, longitude: displayed.lon }} />
                </MapView>
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.smallBtn} onPress={() => copyToClipboard(displayed.lat, displayed.lon)}>
                  <Text style={styles.smallBtnText}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallBtn} onPress={() => shareLocation(displayed.lat, displayed.lon, displayed.addr)}>
                  <Text style={styles.smallBtnText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallBtn} onPress={() => openInMaps(displayed.lat, displayed.lon)}>
                  <Text style={styles.smallBtnText}>Open in Maps</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.smallBtn, styles.saveBtn]} onPress={saveLocation}>
                  <Text style={[styles.smallBtnText, { color: "#fff" }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.hintCard}>
              <Text style={styles.hint}>No location yet — tap "Get Current Location" to begin.</Text>
              {savedLocations.length > 0 ? (
                <TouchableOpacity onPress={() => setShowSavedList(true)}>
                  <Text style={styles.lastSaved}>Last saved: {new Date(savedLocations[0].savedAt).toLocaleString()} • Tap to view</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {/* Saved list */}
          <View style={{ marginTop: 14 }}>
            <TouchableOpacity style={styles.viewSavedBtn} onPress={() => setShowSavedList(true)}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>View Saved Locations ({savedLocations.length})</Text>
            </TouchableOpacity>
          </View>

          {/* Saved list modal */}
          <Modal visible={showSavedList} animationType="slide" transparent>
            <SafeAreaView style={styles.modalBackdrop}>
              <View style={styles.modal}>
                <Text style={styles.modalTitle}>Saved Locations</Text>
                <FlatList
                  data={savedLocations}
                  keyExtractor={(i) => i.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.savedRow}
                      onPress={() => previewSaved(item)}
                      onLongPress={() => removeSaved(item.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "700" }}>{item.address ?? `Lat ${item.latitude.toFixed(5)}, Lon ${item.longitude.toFixed(5)}`}</Text>
                        <Text style={{ color: "#666", marginTop: 6 }}>{new Date(item.savedAt).toLocaleString()}</Text>
                      </View>
                      <TouchableOpacity onPress={() => openInMaps(item.latitude, item.longitude)} style={styles.smallCircle}>
                        <Text style={{ color: "#fff" }}>↗️</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  )}
                  ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                  ListEmptyComponent={<Text style={{ color: "#666", textAlign: "center", marginTop: 20 }}>No saved locations</Text>}
                />

                <TouchableOpacity style={[styles.modalBtn, { marginTop: 12 }]} onPress={() => setShowSavedList(false)}>
                  <Text style={{ fontWeight: "700" }}>Close</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </Modal>
        </SafeAreaView>
      </LinearGradient>
    </>
  );
}

// Styles
function getStyles(dark = false) {
  const common = {
    wrapper: { flex: 1 },
    container: { flex: 1, padding: 20, justifyContent: "flex-start" },
    title: { fontSize: 26, fontWeight: "700", marginTop: 28 },
    subtitle: { marginTop: 6 },
    actionButton: {
      marginTop: 18,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
    },
    disabledButton: { opacity: 0.7 },
    actionText: { fontSize: 16, fontWeight: "600" },

    card: { marginTop: 18, borderRadius: 12, padding: 14, shadowColor: "#000", shadowOpacity: 0.06, elevation: 2 },
    row: { flexDirection: "row", alignItems: "center" },
    coord: { marginVertical: 3 },
    bold: { fontWeight: "700" },
    address: { marginTop: 6 },
    time: { marginTop: 6, fontSize: 12 },
    mapWrapper: { height: 160, marginTop: 12, borderRadius: 10, overflow: "hidden" },
    map: { flex: 1 },
    actionsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
    smallBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#e6eefc" },
    smallBtnText: { fontWeight: "600" },
    hintCard: { marginTop: 18, padding: 16, borderRadius: 12 },
    hint: {},
    lastSaved: { marginTop: 8, fontSize: 12 },
    viewSavedBtn: { marginTop: 8, backgroundColor: "#1e88e5", paddingVertical: 12, borderRadius: 10, alignItems: "center" },

    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 18 },
    modal: { flex: 0.8, backgroundColor: "#fff", borderRadius: 12, padding: 14 },
    modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 10 },
    savedRow: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, backgroundColor: "#fafafa" },
    smallCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#1e88e5", alignItems: "center", justifyContent: "center" },
    modalBtn: { paddingVertical: 12, alignItems: "center", borderRadius: 10 },
    saveBtn: { backgroundColor: "#1e88e5" },
  };

  if (dark) {
    return StyleSheet.create({
      ...common,
      title: { ...common.title, color: "#e6f0ff" },
      subtitle: { ...common.subtitle, color: "#bcd0ff" },
      actionButton: { ...common.actionButton, backgroundColor: "#1f6feb" },
      actionText: { ...common.actionText, color: "#fff" },
      card: { ...common.card, backgroundColor: "#0f1724" },
      coord: { ...common.coord, color: "#e6eefc" },
      address: { ...common.address, color: "#cfe1ff" },
      time: { ...common.time, color: "#9fb3d9" },
      smallBtn: { ...common.smallBtn, backgroundColor: "#274b9a" },
      smallBtnText: { ...common.smallBtnText, color: "#fff" },
      hintCard: { ...common.hintCard, backgroundColor: "#071026" },
      hint: { color: "#c8d9ff" },
      lastSaved: { ...common.lastSaved, color: "#9fb3d9" },
      viewSavedBtn: { ...common.viewSavedBtn, backgroundColor: "#274b9a" },
      modal: { ...common.modal, backgroundColor: "#071026" },
      modalTitle: { color: "#e6eefc" },
      savedRow: { ...common.savedRow, backgroundColor: "#061426" },
    });
  }

  return StyleSheet.create({
    ...common,
    title: { ...common.title, color: "#0b3d91" },
    subtitle: { ...common.subtitle, color: "#446" },
    actionButton: { ...common.actionButton, backgroundColor: "#1e88e5" },
    actionText: { ...common.actionText, color: "#fff" },
    card: { ...common.card, backgroundColor: "#fff" },
    coord: { ...common.coord, color: "#333" },
    address: { ...common.address, color: "#555" },
    time: { ...common.time, color: "#777" },
    smallBtn: { ...common.smallBtn, backgroundColor: "#e6eefc" },
    smallBtnText: { ...common.smallBtnText, color: "#0b3d91" },
    hintCard: { ...common.hintCard, backgroundColor: "#fff" },
    hint: { color: "#555" },
    lastSaved: { ...common.lastSaved, color: "#777" },
    viewSavedBtn: { ...common.viewSavedBtn, backgroundColor: "#1e88e5" },
  });
}

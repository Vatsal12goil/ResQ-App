// Index.js (full-screen themed landing)
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Pressable,
  Animated,
  Platform,
  Dimensions,
  Modal,
  ScrollView,
  StatusBar,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "react-native-vector-icons/Ionicons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width, height } = Dimensions.get("window");

/* -------------------------- Reusable THEMES -------------------------- */
export const THEMES = {
  day: {
    key: "day",
    name: "Day",
    gradient: ["#FFFBEB", "#EEF2FF"], // warm pale -> soft blue
    colors: {
      surface: "#FFFFFF",
      text: "#0B1220",
      muted: "#6B7280",
      primary: "#2563EB", // blue
      accent: "#F59E0B", // amber
      border: "#E6EEF8",
      buttonText: "#FFFFFF",
      heroTitleVibrant: "#0ea5a4", // vibrant teal for day title
    },
  },
  night: {
    key: "night",
    name: "Night",
    gradient: ["#0f1024", "#2b0840"], // deep indigo -> purple
    colors: {
      surface: "rgba(255,255,255,0.04)",
      text: "#F8FAFF",
      muted: "#B9C3D3",
      primary: "#A78BFA", // lavender
      accent: "#FF7AB6",
      border: "rgba(255,255,255,0.06)",
      buttonText: "#0B1220",
      heroTitleVibrant: "#DDE6FF",
    },
  },
};

/* GPS / shield themed Unsplash image (full-bleed background) */
const HERO_SAFE =
  "https://images.unsplash.com/photo-1521791136064-7986c2920216?q=80&w=2000&auto=format&fit=crop";

export default function Index() {
  const router = useRouter();

  // theme persisted in AsyncStorage as 'appTheme'
  const [themeKey, setThemeKey] = useState("day");
  const theme = THEMES[themeKey];

  // float animation for hero card subtle motion
  const floatAnim = useRef(new Animated.Value(0)).current;

  // modal for more info
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    // read saved theme and check registration on mount
    (async () => {
      try {
        const savedTheme = await AsyncStorage.getItem("appTheme");
        if (savedTheme && (savedTheme === "day" || savedTheme === "night")) {
          setThemeKey(savedTheme);
        }

        const isRegistered = await AsyncStorage.getItem("isRegistered");
        if (isRegistered === "true") {
          // Redirect registered users straight to calculator
          router.replace("/calculator");
          return;
        }
      } catch (e) {
        // ignore read errors
      }

      // start subtle floating loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatAnim, { toValue: -8, duration: 3200, useNativeDriver: true }),
          Animated.timing(floatAnim, { toValue: 0, duration: 3200, useNativeDriver: true }),
        ])
      ).start();
    })();
  }, []);

  // toggle theme (persist choice)
  const toggleTheme = async (key) => {
    setThemeKey(key);
    try {
      await AsyncStorage.setItem("appTheme", key);
    } catch (e) {}
  };

  // CTA handlers
  const onRegister = () => router.push({ pathname: "/register" });

  return (
    <LinearGradient colors={theme.gradient} style={styles.outer}>
      <StatusBar barStyle={themeKey === "day" ? "dark-content" : "light-content"} />
      <ImageBackground
        source={{ uri: HERO_SAFE }}
        style={styles.bg}
        imageStyle={{ resizeMode: "cover" }}
        blurRadius={themeKey === "day" ? 0 : 2}
      >
        {/* subtle overlay to increase contrast for text */}
        <LinearGradient
          colors={themeKey === "day" ? ["rgba(255,255,255,0.12)", "rgba(255,255,255,0.06)"] : ["rgba(0,0,0,0.28)", "rgba(0,0,0,0.48)"]}
          style={styles.overlay}
        />

        <View style={[styles.container]}>
          {/* Top bar: brand + theme toggle */}
          <View style={styles.topRow}>
            <View style={styles.brandRow}>
              <Icon name="shield-outline" size={22} color={theme.colors.accent} />
              <Text style={[styles.brand, { color: theme.colors.text }]}>  ResQApp</Text>
            </View>

            <View style={styles.topActions}>
              {/* Theme toggle: still quick press to swap */}
              <Pressable
                onPress={() => toggleTheme(themeKey === "day" ? "night" : "day")}
                style={({ pressed }) => [styles.smallAction, { opacity: pressed ? 0.8 : 1 }]}
              >
                <Icon name={themeKey === "day" ? "moon-outline" : "sunny-outline"} size={18} color={theme.colors.text} />
              </Pressable>
            </View>
          </View>

          {/* Hero (fills most of screen) */}
          <Animated.View style={[styles.heroWrap, { transform: [{ translateY: floatAnim }] }]}>
            <View style={[styles.heroCard, { backgroundColor: themeKey === "day" ? "rgba(255,255,255,0.82)" : "rgba(8,6,16,0.44)" }]}>
              <Text
                style={[
                  styles.heroTitle,
                  {
                    color: themeKey === "day" ? theme.colors.heroTitleVibrant : theme.colors.heroTitleVibrant,
                    textShadowColor: themeKey === "day" ? "rgba(12,12,12,0.08)" : "rgba(0,0,0,0.6)",
                    textShadowOffset: { width: 0, height: 2 },
                    textShadowRadius: 6,
                  },
                ]}
              >
                Rescue. Respond. ResQ.
              </Text>

              <Text style={[styles.heroSubtitle, { color: theme.colors.muted }]}>
                Fast, reliable emergency tools for helpers and volunteers. Quick register and you’re ready.
              </Text>

              <View style={styles.heroButtons}>
                <Pressable
                  onPress={onRegister}
                  style={({ pressed }) => [
                    styles.cta,
                    { backgroundColor: theme.colors.primary, opacity: pressed ? 0.92 : 1 },
                  ]}
                >
                  <Icon name="person-add-outline" size={16} color={theme.colors.buttonText} style={{ marginRight: 8 }} />
                  <Text style={[styles.ctaText, { color: theme.colors.buttonText }]}>Register</Text>
                </Pressable>

                <Pressable
                  onPress={() => setInfoOpen(true)}
                  style={({ pressed }) => [
                    styles.ghost,
                    { borderColor: theme.colors.border, opacity: pressed ? 0.9 : 1 },
                  ]}
                >
                  <Icon name="information-circle-outline" size={16} color={theme.colors.text} style={{ marginRight: 8 }} />
                  <Text style={[styles.ghostText, { color: theme.colors.text }]}>More info</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>

          {/* Feature strip anchored near bottom */}
          <View style={styles.featuresRow}>
            <View style={styles.featureItem}>
              <Icon name="timer-outline" size={22} color={theme.colors.primary} />
              <Text style={[styles.featureText, { color: theme.colors.text }]}>Fast</Text>
            </View>
            <View style={styles.featureItem}>
              <Icon name="shield-checkmark-outline" size={22} color={theme.colors.primary} />
              <Text style={[styles.featureText, { color: theme.colors.text }]}>Secure</Text>
            </View>
            <View style={styles.featureItem}>
              <Icon name="people-outline" size={22} color={theme.colors.primary} />
              <Text style={[styles.featureText, { color: theme.colors.text }]}>Community</Text>
            </View>
          </View>
        </View>

        {/* More Info Modal */}
        <Modal animationType="slide" visible={infoOpen} transparent>
          <View style={modalStyles.backdrop}>
            <View style={[modalStyles.modalCard, { backgroundColor: themeKey === "day" ? "#fff" : "rgba(10,8,18,0.92)" }]}>
              <ScrollView contentContainerStyle={{ padding: 18 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                  <Icon name="information-circle" size={22} color={theme.colors.accent} />
                  <Text style={[modalStyles.modalTitle, { color: theme.colors.text }]}> About ResQApp</Text>
                </View>

                <Text style={[modalStyles.modalText, { color: theme.colors.muted }]}>
                  ResQApp is built to help volunteers, communities and first-responders act fast. Register once to unlock quick-access tools like instant calculators, checklists, and contact sharing for emergencies.
                </Text>

                <Text style={[modalStyles.modalText, { color: theme.colors.muted, marginTop: 8 }]}>
                  We keep your PIN secure on device. <Text style={{ fontWeight: "700" }}>Note:</Text> Do not set your PIN as 000000. It is reserved for resetting and reopening registration.
                </Text>

                <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 18 }}>
                  <Pressable onPress={() => setInfoOpen(false)} style={({ pressed }) => [{ padding: 10, borderRadius: 8, backgroundColor: theme.colors.primary, opacity: pressed ? 0.9 : 1 }]}>
                    <Text style={{ color: theme.colors.buttonText, fontWeight: "800" }}>Close</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ImageBackground>
    </LinearGradient>
  );
}

/* ------------------ styles ------------------ */
const baseFont = Platform.select({ ios: "AvenirNext-Regular", android: "Roboto", default: "System" });

const styles = StyleSheet.create({
  outer: { flex: 1 },
  bg: {
    flex: 1,
    width,
    height,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
  },
  container: {
    flex: 1,
    paddingTop: 50,
    paddingHorizontal: 20,
    justifyContent: "space-between",
    alignItems: "center",
  },
  topRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brand: { fontSize: 18, fontWeight: "900", marginLeft: 6, fontFamily: baseFont },
  topActions: {},
  smallAction: { padding: 8, borderRadius: 10 },

  heroWrap: { flex: 1, width: "100%", justifyContent: "center", alignItems: "center" },
  heroCard: {
    width: "100%",
    maxWidth: 900,
    borderRadius: 18,
    padding: 22,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 10,
  },
  heroTitle: { fontSize: 28, fontWeight: "900", marginBottom: 8, fontFamily: baseFont },
  heroSubtitle: { fontSize: 15, marginBottom: 14, lineHeight: 20 },
  heroButtons: { flexDirection: "row" },
  cta: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginRight: 12 },
  ctaText: { fontWeight: "900", fontSize: 16 },
  ghost: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1 },
  ghostText: { fontSize: 15 },

  featuresRow: { width: "100%", flexDirection: "row", justifyContent: "space-around", paddingVertical: 18 },
  featureItem: { alignItems: "center", width: "30%" },
  featureText: { marginTop: 8, fontWeight: "800" },
});

/* Modal styles */
const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    borderRadius: 14,
    overflow: "hidden",
  },
  modalTitle: { fontSize: 18, fontWeight: "900" },
  modalText: { fontSize: 14, lineHeight: 20 },
});

// HomeScreen.mesmerizing.js
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Animated,
  Platform,
  Dimensions,
  Pressable,
  Easing,
  StatusBar,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useNavigation, useFocusEffect, NavigationProp } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";

const { width } = Dimensions.get("window");
const baseFont = Platform.select({ ios: "AvenirNext-Regular", android: "Roboto", default: "System" });

/* ---------------- THEMES ---------------- */
const THEMES = {
  day: {
    key: "day",
    gradient: ["#F6F9FF", "#EAF2FF"],
    colors: {
      backgroundTop: "#F6F9FF",
      backgroundBottom: "#EAF2FF",
      text: "#0B1730",
      muted: "#61707A",
      primary: "#1E62D6",
      accent: "#0EA5A4",
      card: "#FFFFFF",        // neutral off-white for Day
      cardBorder: "#E6EAF0",
      panic: "#C93B30",
      ring: "rgba(201,59,48,0.10)",
      innerIconTintDay: "rgba(0,0,0,0.03)",
    },
  },
  night: {
    key: "night",
    gradient: ["#071023", "#1B1330"],
    colors: {
      backgroundTop: "#071023",
      backgroundBottom: "#1B1330",
      text: "#EAF1FF",
      muted: "#9DA9BF",
      primary: "#8A77FF",
      accent: "#FF86B6",
      card: "#0D1624", // solid dark card
      cardBorder: "rgba(255,255,255,0.06)",
      panic: "#FF6B6B",
      ring: "rgba(255,107,107,0.10)",
      innerIconTintNight: "rgba(255,255,255,0.05)",
    },
  },
};

/* ---------------- Feature List ---------------- */
type RootStackParamList = {
  sosdial: undefined;
  locationshare: undefined;
  filesave: undefined;
  chat: undefined;
  hiddenfeature: undefined;
  helpline: undefined;
  panicbutton: undefined;
};

const features = [
  { key: "sos", title: "SOS Dial", icon: "call", route: "sosdial", color: "#C93B30" },
  { key: "location", title: "Share Location", icon: "location", route: "locationshare", color: "#1E62D6" },
  { key: "filesave", title: "File Save", icon: "folder-open", route: "filesave", color: "#D98A2F" },
  { key: "chat", title: "Chat", icon: "chatbubbles", route: "chat", color: "#2FAB6A" },
  { key: "hide", title: "Hidden", icon: "eye-off", route: "hiddenfeature", color: "#6B5CE6" },
  { key: "helpline", title: "Helpline", icon: "help-circle", route: "helpline", color: "#E64B6B" },
];

/* ---------------- Main Component ---------------- */
export default function HomeScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  // hydration state
  const [hydrated, setHydrated] = useState(false);
  const [themeKey, setThemeKey] = useState<"day" | "night">("night"); // temporary placeholder
  const theme = THEMES[themeKey];
  const C = theme.colors;

  // animations
  const listAnim = useRef(new Animated.Value(0)).current;
  const panicScale = useRef(new Animated.Value(1)).current;
  const panicGlow = useRef(new Animated.Value(0)).current;
  const loopsRef = useRef<{ blip?: Animated.CompositeAnimation } | null>(null);

  // read saved theme (default to day if none)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("appTheme");
        if (mounted) {
          if (saved === "day" || saved === "night") setThemeKey(saved);
          else setThemeKey("day"); // default explicitly to day
        }
      } catch (e) {
        if (mounted) setThemeKey("day");
      } finally {
        if (mounted) setHydrated(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const startAnimations = useCallback(() => {
    // entrance
    listAnim.setValue(0);
    Animated.timing(listAnim, { toValue: 1, duration: 600, delay: 180, useNativeDriver: true }).start();

    // panic blip loop
    loopsRef.current = {};
    loopsRef.current.blip = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(panicScale, { toValue: 1.06, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(panicGlow, { toValue: 1, duration: 140, useNativeDriver: false }),
        ]),
        Animated.parallel([
          Animated.timing(panicScale, { toValue: 1.0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(panicGlow, { toValue: 0, duration: 260, useNativeDriver: false }),
        ]),
        Animated.delay(1200),
      ]),
      { iterations: -1 }
    );
    loopsRef.current.blip.start();
  }, [listAnim, panicGlow, panicScale]);

  const stopAnimations = useCallback(() => {
    try {
      loopsRef.current?.blip?.stop();
      loopsRef.current = null;
    } catch (e) {}
  }, []);

  // start/stop when focused (prevents stale animation on return)
  useFocusEffect(
    useCallback(() => {
      if (!hydrated) return;
      startAnimations();
      return () => stopAnimations();
    }, [hydrated, startAnimations, stopAnimations])
  );

  // cleanup on unmount
  useEffect(() => () => stopAnimations(), [stopAnimations]);

  // toggle theme and persist
  const toggleTheme = async () => {
    const next = themeKey === "day" ? "night" : "day";
    setThemeKey(next);
    try {
      await AsyncStorage.setItem("appTheme", next);
    } catch (e) {}
  };

  const goTo = (route: keyof RootStackParamList) => navigation.navigate(route);

  const handlePanicPress = () => {
    Alert.alert("🚨 Activate SOS?", "Open Panic Screen?", [
      { text: "Cancel", style: "cancel" },
      { text: "Open", onPress: () => navigation.navigate("panicbutton") },
    ]);
  };

  // card animation (stagger)
  const cardAnimatedStyle = (idx: number) => {
    const translateY = listAnim.interpolate({ inputRange: [0, 1], outputRange: [18 + idx * 6, 0] });
    const opacity = listAnim;
    return { transform: [{ translateY }], opacity };
  };

  // small helpers
  const rippleColor = themeKey === "day" ? "#00000004" : "#ffffff04";
  const innerBgFor = (itemColor: string) => (themeKey === "day" ? C.innerIconTintDay : C.innerIconTintNight || "rgba(255,255,255,0.05)");

  // Render tile: include themeKey in the tile wrapper key so Animated view can't keep old style
  const renderTile = ({ item, index }: any) => (
    <Animated.View key={`${item.key}-${themeKey}`} style={[styles.tileWrap, cardAnimatedStyle(index)]}>
      <Pressable
        onPress={() => goTo(item.route as any)}
        android_ripple={{ color: rippleColor }}
        style={({ pressed }) => [
          styles.tile,
          {
            backgroundColor: C.card,      // explicit from theme
            borderColor: C.cardBorder,   // explicit from theme
            opacity: pressed ? 0.96 : 1,
            shadowColor: themeKey === "day" ? "#00102822" : "#00000066",
          },
        ]}
      >
        <View style={[styles.tileIconWrap, { backgroundColor: innerBgFor(item.color) }]}>
          <Icon name={item.icon} size={28} color={item.color} />
        </View>
        <Text style={[styles.tileTitle, { color: C.text }]}>{item.title}</Text>
      </Pressable>
    </Animated.View>
  );

  const panicGlowStyle = {
    opacity: panicGlow.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.2] }),
    transform: [{ scale: panicGlow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }],
  };

  // while reading AsyncStorage show a neutral dark placeholder to avoid flashes
  if (!hydrated) {
    const placeholder = THEMES.night;
    return (
      <LinearGradient colors={[placeholder.gradient[0], placeholder.gradient[1]]} style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.centerPlaceholder}>
          <Icon name="shield-checkmark" size={28} color={placeholder.colors.accent} />
          <Text style={{ color: placeholder.colors.text, fontSize: 20, fontWeight: "900", marginTop: 8 }}>ResQ</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[theme.colors.backgroundTop, theme.colors.backgroundBottom]} style={styles.screen}>
      <StatusBar barStyle={themeKey === "day" ? "dark-content" : "light-content"} />
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Icon name="shield-checkmark" size={22} color={C.accent} />
          <Text style={[styles.brandText, { color: C.text }]}>  ResQ</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={toggleTheme} style={[styles.iconButton, { borderColor: C.cardBorder }]}>
            <Icon name={themeKey === "day" ? "moon-outline" : "sunny-outline"} size={18} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={[styles.title, { color: C.text }]}>Rescue tools — fast & reliable</Text>
        <Text style={[styles.subtitle, { color: C.muted }]}>Quick-access utilities for responders.</Text>
      </View>

      <View style={styles.panicArea}>
        <Animated.View style={[styles.panicRing, { backgroundColor: C.ring }, panicGlowStyle]} />
        <Animated.View style={{ transform: [{ scale: panicScale }] }}>
          <TouchableOpacity
            onPress={handlePanicPress}
            activeOpacity={0.86}
            style={[styles.panicBtn, { backgroundColor: C.panic, shadowColor: themeKey === "day" ? "#00102822" : "#00000066" }]}
          >
            <Text style={styles.panicText}>🚨 PANIC</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <View style={styles.grid}>
        <FlatList
          // KEY PROP: forces FlatList to remount whenever themeKey changes, removing recycled stale backgrounds
          key={themeKey}
          data={features}
          renderItem={renderTile}
          keyExtractor={(i) => i.key}
          numColumns={2}
          columnWrapperStyle={styles.row}
          scrollEnabled={false}
          // disable aggressive clipping so tiles don't reuse views improperly on some Android builds
          removeClippedSubviews={false}
          contentContainerStyle={{ paddingBottom: 18 }}
          extraData={themeKey} // extra safety to re-render items when theme changes
        />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: C.muted }]}>ResQApp • Ready when you are</Text>
      </View>
    </LinearGradient>
  );
}

/* -------------------- Styles -------------------- */
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 56 : 36,
    paddingHorizontal: 18,
  },

  centerPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  header: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    zIndex: 4,
  },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brandText: { fontSize: 18, fontWeight: "900", fontFamily: baseFont },

  headerActions: { flexDirection: "row", alignItems: "center" },
  iconButton: {
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginLeft: 8,
  },

  hero: {
    marginTop: 6,
    marginBottom: 18,
  },
  title: { fontSize: 22, fontWeight: "900", letterSpacing: 0.2, fontFamily: baseFont },
  subtitle: { fontSize: 14, marginTop: 6, lineHeight: 20 },

  panicArea: { alignItems: "center", marginBottom: 18, zIndex: 3 },
  panicRing: {
    position: "absolute",
    width: width - 48,
    height: 92,
    borderRadius: 18,
    top: -6,
  },
  panicBtn: {
    width: width - 72,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
  },
  panicText: { color: "#fff", fontSize: 18, fontWeight: "900" },

  grid: { flex: 1, marginTop: 4 },
  row: { justifyContent: "space-between", marginBottom: 14 },
  tileWrap: { width: (width - 36 - 16) / 2 },
  tile: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    minHeight: 120,
    justifyContent: "center",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  tileIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  tileTitle: { fontSize: 14, fontWeight: "800", textAlign: "center" },

  footer: { alignItems: "center", paddingVertical: 14 },
  footerText: { fontSize: 12 },
});

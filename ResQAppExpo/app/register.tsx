// RegisterScreen.js
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Animated,
  Platform,
  PanResponder,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

/* ---------- TWO THEMES: Day (light) & Night (dark) ---------- */
const THEMES = {
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
    },
  },
};

const getTheme = (key) => THEMES[key] || THEMES.day;

export default function RegisterScreen() {
  const router = useRouter();

  // form state (username intentionally NOT persisted between launches)
  const [username, setUsername] = useState("");
  const [rawPin, setRawPin] = useState("");
  const [showPin, setShowPin] = useState(false);

  // theme state (default to day so you see light UI initially)
  const [themeKey, setThemeKey] = useState("day");
  const theme = getTheme(themeKey);
  const colors = theme.colors;

  // button press animation
  const btnScale = useRef(new Animated.Value(1)).current;

  // toggle geometry
  const TOGGLE_WIDTH = 120;
  const KNOB_SIZE = 46;
  const KNOB_PADDING = 4;
  const KNOB_TRAVEL = TOGGLE_WIDTH - KNOB_SIZE - KNOB_PADDING * 2;

  // pan value (0..KNOB_TRAVEL)
  const pan = useRef(new Animated.Value(themeKey === "night" ? KNOB_TRAVEL : 0)).current;

  // hidden pin input reference
  const hiddenInputRef = useRef(null);

  useEffect(() => {
    // intentionally do NOT prefill username from storage (per your request)
  }, []);

  const animateButton = (toValue = 0.97) =>
    Animated.sequence([
      Animated.timing(btnScale, { toValue, duration: 120, useNativeDriver: true }),
      Animated.timing(btnScale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();

  const onPinChange = (text) => {
    const digits = text.replace(/\D/g, "").slice(0, 6);
    setRawPin(digits);
  };

  const focusPinInput = () => hiddenInputRef.current?.focus();

  const handleRegister = async () => {
    if (!username.trim()) {
      Alert.alert("Username required", "Please enter a username.");
      return;
    }
    if (rawPin.length !== 6 || isNaN(Number(rawPin))) {
      Alert.alert("Invalid PIN", "PIN must be a 6-digit number.");
      return;
    }
    if (rawPin === "000000") {
      Alert.alert("Invalid PIN", "000000 is reserved. Please choose another PIN.");
      return;
    }

    try {
      // Persist PIN and registration flag but NOT username
      await AsyncStorage.multiSet([
        ["userPin", rawPin],
        ["isRegistered", "true"],
      ]);
      Alert.alert("✅ Success", "Account created!", [
        { text: "OK", onPress: () => router.replace("/calculator") },
      ]);
    } catch (error) {
      console.error("Error saving data:", error);
      Alert.alert("❌ Error", "Failed to save details. Try again.");
    }
  };

  const renderPinBoxes = () => {
    const boxes = [];
    const chars = rawPin.split("");
    for (let i = 0; i < 6; i++) {
      const char = chars[i];
      boxes.push(
        <View
          key={i}
          style={[
            styles.pinBox,
            {
              borderColor: chars.length > i ? colors.primary : colors.border,
              backgroundColor: themeKey === "night" ? "rgba(255,255,255,0.02)" : colors.surface,
            },
          ]}
        >
          <Text style={[styles.pinChar, { color: colors.text }]}>{char ? (showPin ? char : "•") : ""}</Text>
        </View>
      );
    }
    return boxes;
  };

  /* ---------- PanResponder for draggable knob ---------- */
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // keep current value as offset so setValue works with dx
        pan.setOffset(pan.__getValue());
        pan.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        // compute clamped absolute position: offset + dx
        const offset = pan._offset ?? pan.__getValue();
        const attempted = offset + gestureState.dx;
        const clamped = Math.max(0, Math.min(KNOB_TRAVEL, attempted));
        // setValue expects delta from offset, so pass clamped - offset
        pan.setValue(clamped - offset);
      },
      onPanResponderRelease: () => {
        pan.flattenOffset();
        const final = pan.__getValue();
        const toNight = final >= KNOB_TRAVEL / 2;
        Animated.timing(pan, { toValue: toNight ? KNOB_TRAVEL : 0, duration: 220, useNativeDriver: false }).start(() => {
          setThemeKey(toNight ? "night" : "day");
        });
      },
    })
  ).current;

  // helper to switch by tapping icons
  const switchTo = (toNight) => {
    Animated.timing(pan, { toValue: toNight ? KNOB_TRAVEL : 0, duration: 260, useNativeDriver: false }).start();
    setThemeKey(toNight ? "night" : "day");
  };

  // knob left position = KNOB_PADDING + pan
  const knobLeft = pan.interpolate({
    inputRange: [0, KNOB_TRAVEL],
    outputRange: [KNOB_PADDING, KNOB_PADDING + KNOB_TRAVEL],
    extrapolate: "clamp",
  });

  const sunOpacity = pan.interpolate({ inputRange: [0, KNOB_TRAVEL], outputRange: [1, 0], extrapolate: "clamp" });
  const moonOpacity = pan.interpolate({ inputRange: [0, KNOB_TRAVEL], outputRange: [0, 1], extrapolate: "clamp" });
  const toggleBg = pan.interpolate({
    inputRange: [0, KNOB_TRAVEL],
    outputRange: ["rgba(6,8,11,0.04)", "rgba(167,139,250,0.14)"],
  });

  return (
    <LinearGradient colors={theme.gradient} style={styles.outer}>
      <View style={styles.container}>
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: themeKey === "day" ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.14)" }]}>
          <View style={styles.headerRow}>
            <Icon name="shield-checkmark-outline" size={28} color={colors.accent} />
            <Text style={[styles.title, { color: colors.text }]}>
              {"  "}Register <Text style={styles.emoji}></Text>
            </Text>
          </View>

          <Text style={[styles.fancyNote, { color: colors.muted }]}>
            Your account, your rules — choose a PIN you want
          </Text>

          {/* Sliding toggle with tappable icons */}
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.label, { color: colors.muted, marginBottom: 8 }]}>Theme</Text>

            <Animated.View style={[styles.toggleTrack, { width: TOGGLE_WIDTH, backgroundColor: toggleBg }]}>
              {/* tappable sun (left) */}
              <Pressable onPress={() => switchTo(false)} style={[styles.iconTouchLeft, { left: 8 }]} hitSlop={8}>
                <Animated.View style={{ opacity: sunOpacity }}>
                  <Icon name="sunny-outline" size={18} color="#FFD166" />
                </Animated.View>
              </Pressable>

              {/* tappable moon (right) */}
              <Pressable onPress={() => switchTo(true)} style={[styles.iconTouchRight, { right: 8 }]} hitSlop={8}>
                <Animated.View style={{ opacity: moonOpacity }}>
                  <Icon name="moon-outline" size={18} color="#6B21A8" />
                </Animated.View>
              </Pressable>

              {/* draggable knob */}
              <Animated.View
                {...panResponder.panHandlers}
                style={[
                  styles.knob,
                  {
                    left: knobLeft,
                    width: KNOB_SIZE,
                    height: KNOB_SIZE,
                    borderRadius: KNOB_SIZE / 2,
                    backgroundColor: themeKey === "day" ? "#FFF" : "#fff",
                    shadowColor: "#000",
                    shadowOpacity: 0.12,
                    shadowRadius: 8,
                    elevation: 6,
                    alignItems: "center",
                    justifyContent: "center",
                  },
                ]}
              >
                <Animated.View style={{ position: "absolute", opacity: sunOpacity }}>
                  <Icon name="sunny" size={20} color="#FFB703" />
                </Animated.View>
                <Animated.View style={{ position: "absolute", opacity: moonOpacity }}>
                  <Icon name="moon" size={18} color="#6B21A8" />
                </Animated.View>
              </Animated.View>
            </Animated.View>
          </View>

          {/* Username */}
          <Text style={[styles.label, { color: colors.muted }]}>Username</Text>
          <View style={[styles.inputRow, { backgroundColor: themeKey === "day" ? "rgba(0,0,0,0.02)" : "transparent" }]}>
            <Icon name="person-outline" size={18} color={colors.accent} style={{ marginRight: 8 }} />
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="pick a username"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.text }]}
              autoCapitalize="none"
              returnKeyType="next"
            />
          </View>

          {/* PIN boxes */}
          <Text style={[styles.label, { color: colors.muted }]}>6-digit PIN</Text>
          <Pressable onPress={focusPinInput} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            {renderPinBoxes()}
          </Pressable>

          {/* Hidden input */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
            <TextInput
              ref={hiddenInputRef}
              value={rawPin}
              onChangeText={onPinChange}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={6}
              style={{
                height: 44,
                color: "transparent",
                position: "absolute",
                left: -9999,
                width: 1,
              }}
              caretHidden
              importantForAccessibility="no"
              accessible={false}
            />

            <TouchableOpacity onPress={() => setShowPin((s) => !s)} style={{ marginLeft: "auto", paddingHorizontal: 6, paddingVertical: 6 }}>
              <Icon name={showPin ? "eye-off-outline" : "eye-outline"} size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Exact Pro tip requested */}
          <Text style={[styles.note, { color: themeKey === "night" ? "#FCE7F3" : "#0F1724" }]}>
            Do not set your PIN as 000000. It is reserved for resetting and reopening registration.
          </Text>

          {/* Register button */}
          <Animated.View style={{ transform: [{ scale: btnScale }] }}>
            <Pressable
              onPress={() => {
                animateButton(0.97);
                handleRegister();
              }}
              style={({ pressed }) => [
                styles.btn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.95 : 1,
                },
              ]}
            >
              <Icon name="person-add-outline" size={18} color={theme.colors.buttonText || "#fff"} style={{ marginRight: 8 }} />
              <Text style={[styles.btnText, { color: theme.colors.buttonText || "#fff" }]}>Create Account</Text>
            </Pressable>
          </Animated.View>
        </View>

        {/* (Demo fill removed as requested) */}
      </View>
    </LinearGradient>
  );
}

/* ------------------ styles ------------------ */
const baseFont = Platform.select({
  ios: "AvenirNext-Regular",
  android: "Roboto",
  default: "System",
});

const styles = StyleSheet.create({
  outer: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    borderRadius: 16,
    padding: 18,
    // backgroundColor is set dynamically to match day/night
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
    borderWidth: 1,
  },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  title: {
    fontSize: 26,
    fontWeight: "800",
    fontFamily: baseFont,
    letterSpacing: 0.2,
  },
  emoji: { fontSize: 20 },
  fancyNote: {
    fontSize: 13,
    marginBottom: 10,
    fontFamily: baseFont,
  },
  toggleTrack: {
    height: 56,
    borderRadius: 999,
    padding: 4,
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  iconTouchLeft: {
    position: "absolute",
    top: 0,
    bottom: 0,
    justifyContent: "center",
    width: 44,
  },
  iconTouchRight: {
    position: "absolute",
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "flex-end",
    width: 44,
  },
  knob: {
    position: "absolute",
    top: 4,
  },
  label: { fontSize: 13, marginBottom: 6, marginTop: 6 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    height: 44,
    fontSize: 16,
    paddingHorizontal: 6,
    fontFamily: baseFont,
  },
  pinBox: {
    width: 44,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    marginHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  pinChar: {
    fontSize: 20,
    fontWeight: "800",
    fontFamily: baseFont,
  },
  note: {
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
    fontWeight: "600",
  },
  btn: {
    marginTop: 6,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  btnText: { fontSize: 16, fontWeight: "800", fontFamily: baseFont },
});

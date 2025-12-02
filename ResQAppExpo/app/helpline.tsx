// app/helpline.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Linking,
  Alert,
  Platform,
  Modal,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

type Item = { id: string; name: string; number: string };

const HELPLINES: Item[] = [
  { id: "1", name: "Women Helpline", number: "1091" },
  { id: "2", name: "Police Emergency", number: "100" },
  { id: "3", name: "National Emergency Number", number: "112" },
  { id: "4", name: "Child Helpline", number: "1098" },
  { id: "5", name: "Mental Health Helpline", number: "08046110007" },
  { id: "6", name: "Cyber Crime Helpline", number: "155260" },
  { id: "7", name: "Senior Citizen Helpline", number: "1291" },
  { id: "8", name: "Domestic Abuse (NGO)", number: "181" },
];

export default function HelplineScreen() {
  const [search, setSearch] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [modalNumber, setModalNumber] = useState<Item | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return HELPLINES;
    return HELPLINES.filter(
      (h) =>
        h.name.toLowerCase().includes(q) || h.number.toLowerCase().includes(q)
    );
  }, [search]);

  const tryHaptic = () => {
    try {
      Haptics.selectionAsync();
    } catch {}
  };

  // Attempt to call directly. If it fails (or device is web), show fallback modal.
  const initiateCall = async (item: Item) => {
    tryHaptic();

    const url = `tel:${item.number}`;

    // On web, don't try tel: — show fallback immediately
    if (Platform.OS === "web") {
      setModalNumber(item);
      setModalVisible(true);
      return;
    }

    // Try to open the tel: link. Some emulators/devices will reject this.
    // We'll attempt and fallback on any failure or if it doesn't resolve in time.
    let opened = false;
    try {
      // race openURL with timeout — some platforms hang, so fallback reliably
      const openPromise = Linking.openURL(url).then(() => (opened = true));
      const timeout = new Promise((res) => setTimeout(res, 1500)); // 1.5s
      await Promise.race([openPromise, timeout]);
    } catch (err) {
      // explicit catch
      console.warn("openURL error", err);
    }

    // If not opened, show fallback modal (copy/sms/whatsapp)
    if (!opened) {
      setModalNumber(item);
      setModalVisible(true);
    }
  };

  const onCallConfirm = (item: Item) =>
    Alert.alert(`Call ${item.name}`, `This will call ${item.number}. Proceed?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Call", style: "destructive", onPress: () => initiateCall(item) },
    ]);

  const sendSms = async (number: string, body?: string) => {
    tryHaptic();
    const sep = Platform.OS === "ios" ? "&" : "?";
    const encoded = body ? encodeURIComponent(body) : "";
    const url = body ? `sms:${number}${sep}body=${encoded}` : `sms:${number}`;

    try {
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
      } else {
        Alert.alert("SMS not available", "This device doesn't support the SMS composer.");
      }
    } catch (e) {
      console.warn("SMS open error", e);
      Alert.alert("SMS not available", "Could not open SMS composer on this device.");
    }
  };

  const openWhatsApp = async (number: string) => {
    tryHaptic();
    // prefer international digits; attempt wa.me link
    const digits = number.replace(/\D/g, "");
    const waUrl = `https://wa.me/${digits}`;
    try {
      // open in app if possible, otherwise browser
      await Linking.openURL(waUrl);
    } catch (e) {
      console.warn("WhatsApp open error", e);
      Alert.alert("Unable to open WhatsApp", "Could not launch WhatsApp or browser.");
    }
  };

  const copyToClipboard = async (value: string) => {
    tryHaptic();
    await Clipboard.setStringAsync(value);
    Alert.alert("Copied", `${value} copied to clipboard`);
  };

  const onLongPress = (item: Item) => {
    tryHaptic();
    Alert.alert(item.name, undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Call", onPress: () => onCallConfirm(item) },
      {
        text: "Send SMS",
        onPress: () =>
          sendSms(item.number, `I need help. Please call ${item.name} (${item.number}).`),
      },
      { text: "Copy number", onPress: () => copyToClipboard(item.number) },
    ]);
  };

  const renderItem = ({ item }: { item: Item }) => {
    return (
      <Pressable
        onPress={() => onCallConfirm(item)}
        onLongPress={() => onLongPress(item)}
        android_ripple={{ color: "#e6eefc" }}
        style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
      >
        <View style={styles.left}>
          <Text style={styles.emoji}>{emojiForName(item.name)}</Text>
        </View>

        <View style={styles.mid}>
          <Text style={styles.title}>{item.name}</Text>
          <Text style={styles.subtitle}>{item.number}</Text>
        </View>

        <TouchableOpacity style={styles.callBtn} onPress={() => initiateCall(item)}>
          <Text style={styles.callTxt}>📞</Text>
        </TouchableOpacity>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Lowered header so notch/camera is not blocked */}
      <View style={styles.headerWrap}>
        <Text style={styles.header}>📞 Emergency Helplines</Text>
        <Text style={styles.headerSub}>Tap a number to call — long-press for options</Text>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search name or number..."
        value={search}
        onChangeText={setSearch}
        placeholderTextColor="#888"
      />

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 14, paddingBottom: 140 }}
        ListEmptyComponent={
          <View style={{ marginTop: 30, alignItems: "center" }}>
            <Text style={{ color: "#999" }}>No helplines found</Text>
          </View>
        }
      />

      {/* Fallback modal when device can't open tel: */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Cannot place call from this device</Text>
            <Text style={styles.modalNumber}>
              {modalNumber?.name} — {modalNumber?.number}
            </Text>

            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: "#eef2ff" }]}
                onPress={() => {
                  if (modalNumber) sendSms(modalNumber.number);
                  setModalVisible(false);
                }}
              >
                <Text style={{ color: "#1e3a8a", fontWeight: "700" }}>Send SMS</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: "#e6f7ee" }]}
                onPress={() => {
                  if (modalNumber) openWhatsApp(modalNumber.number);
                  setModalVisible(false);
                }}
              >
                <Text style={{ color: "#166534", fontWeight: "700" }}>WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: "#fff3f0" }]}
                onPress={() => {
                  if (modalNumber) copyToClipboard(modalNumber.number);
                  setModalVisible(false);
                }}
              >
                <Text style={{ color: "#9a3412", fontWeight: "700" }}>Copy</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.modalBtn, { marginTop: 12, backgroundColor: "#f3f4f6" }]}
              onPress={() => setModalVisible(false)}
            >
              <Text style={{ color: "#333" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// small emoji heuristics
function emojiForName(name = "") {
  const n = name.toLowerCase();
  if (n.includes("women")) return "♀️";
  if (n.includes("police")) return "👮";
  if (n.includes("fire")) return "🚒";
  if (n.includes("ambulance")) return "🚑";
  if (n.includes("child")) return "🧒";
  if (n.includes("mental")) return "🧠";
  return "📞";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7fbff" },

  headerWrap: {
    paddingHorizontal: 18,
    paddingTop: 40, // lowered so notch/camera safe
    paddingBottom: 12,
    backgroundColor: "#fff",
  },
  header: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    color: "#0b3d91",
  },
  headerSub: { textAlign: "center", color: "#666", marginTop: 6 },

  search: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e6eefc",
    marginBottom: 10,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 4,
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cardPressed: { opacity: 0.92 },

  left: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#f1f8ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  emoji: { fontSize: 26 },

  mid: { flex: 1 },
  title: { fontSize: 16, fontWeight: "700", color: "#111" },
  subtitle: { marginTop: 6, color: "#666" },

  callBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#0f9d58",
    alignItems: "center",
    justifyContent: "center",
  },
  callTxt: { color: "#fff", fontSize: 18 },

  // modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(8,10,20,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modal: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
  },
  modalTitle: { fontSize: 16, fontWeight: "800", marginBottom: 6 },
  modalNumber: { color: "#444", marginBottom: 12 },
  modalRow: { flexDirection: "row", justifyContent: "space-between", width: "100%" },
  modalBtn: {
    flex: 1,
    marginHorizontal: 6,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
});

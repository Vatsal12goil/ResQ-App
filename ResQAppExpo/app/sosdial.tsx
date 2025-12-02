// app/sosdial.tsx
import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  Alert,
  Platform,
  Pressable,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

type Contact = {
  id: string;
  name: string;
  number: string;
  builtIn?: boolean;
};

const STORAGE_KEY = "@sos_custom_contacts_v1";

const BUILT_IN: Contact[] = [
  { id: "builtin-112", name: "Emergency (All)", number: "112", builtIn: true },
  { id: "builtin-100", name: "Police", number: "100", builtIn: true },
  { id: "builtin-101", name: "Fire", number: "101", builtIn: true },
  { id: "builtin-102", name: "Ambulance (Alt)", number: "102", builtIn: true },
  { id: "builtin-1091", name: "Women Helpline", number: "1091", builtIn: true },
];

function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 9);
}
function sanitizeNumber(n = "") {
  return n.trim();
}
function isValidPhone(n = "") {
  const digits = n.replace(/\D/g, "");
  return digits.length >= 5;
}
function emojiForName(name?: string) {
  const n = (name || "").toLowerCase();
  if (n.includes("police")) return "👮";
  if (n.includes("ambulance") || n.includes("ambul")) return "🚑";
  if (n.includes("fire")) return "🚒";
  if (n.includes("women")) return "♀️";
  if (n.includes("emergency")) return "⚠️";
  if (n.includes("hospital")) return "🏥";
  return "📞";
}

export default function SOSDial() {
  const [custom, setCustom] = useState<Contact[]>([]);
  const [all, setAll] = useState<Contact[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editMode, setEditMode] = useState<{ editId?: string } | null>(null);
  const [formName, setFormName] = useState("");
  const [formNumber, setFormNumber] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed: Contact[] = raw ? JSON.parse(raw) : [];
        setCustom(parsed);
      } catch (e) {
        console.warn("Failed to load saved SOS numbers", e);
      }
    })();
  }, []);

  useEffect(() => {
    setAll([...BUILT_IN, ...custom]);
  }, [custom]);

  const persist = async (next: Contact[]) => {
    try {
      setCustom(next);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn("Failed to save custom contacts", e);
    }
  };

  const openCallConfirm = (contact: Contact) => {
    Haptics.selectionAsync();
    Alert.alert(
      `Call ${contact.name}`,
      `This will call ${contact.number}. Proceed?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Call",
          style: "destructive",
          onPress: () => {
            const tel = `tel:${contact.number}`;
            Linking.openURL(tel).catch((err) =>
              Alert.alert("Error", "Unable to initiate call: " + String(err))
            );
          },
        },
      ]
    );
  };

  const onAddPress = () => {
    setEditMode(null);
    setFormName("");
    setFormNumber("");
    setModalVisible(true);
  };

  const onSubmitForm = async () => {
    const name = formName.trim();
    const number = sanitizeNumber(formNumber);

    if (!name) {
      Alert.alert("Validation", "Please enter a name for the contact.");
      return;
    }
    if (!isValidPhone(number)) {
      Alert.alert("Validation", "Please enter a valid phone number (at least 5 digits).");
      return;
    }

    if (editMode?.editId) {
      const next = custom.map((c) => (c.id === editMode.editId ? { ...c, name, number } : c));
      await persist(next);
      setModalVisible(false);
      setEditMode(null);
      return;
    }

    const newC: Contact = { id: uid("c-"), name, number };
    await persist([newC, ...custom]);
    setModalVisible(false);
  };

  const onLongPressCard = (contact: Contact) => {
    Haptics.selectionAsync();
    if (contact.builtIn) {
      Alert.alert(contact.name, undefined, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Copy number",
          onPress: async () => {
            await Clipboard.setStringAsync(contact.number);
            Alert.alert("Copied", contact.number + " copied to clipboard");
          },
        },
        {
          text: "Call",
          onPress: () => openCallConfirm(contact),
        },
      ]);
      return;
    }

    Alert.alert(contact.name, undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Edit",
        onPress: () => {
          setEditMode({ editId: contact.id });
          setFormName(contact.name);
          setFormNumber(contact.number);
          setModalVisible(true);
        },
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          Alert.alert(
            "Delete contact",
            `Delete ${contact.name}?`,
            [
              { text: "No", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                  const next = custom.filter((c) => c.id !== contact.id);
                  await persist(next);
                },
              },
            ],
            { cancelable: true }
          ),
      },
      {
        text: "Copy number",
        onPress: async () => {
          await Clipboard.setStringAsync(contact.number);
          Alert.alert("Copied", contact.number + " copied to clipboard");
        },
      },
      {
        text: "Call",
        onPress: () => openCallConfirm(contact),
      },
    ]);
  };

  // --- SMS composer with location using Linking (works widely)
  const sendSmsWithLocation = async (contact: Contact) => {
    try {
      Haptics.selectionAsync();

      let coordsText = "";
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({});
          coordsText = `\nLocation: https://www.google.com/maps/search/?api=1&query=${loc.coords.latitude},${loc.coords.longitude}`;
        } else {
          coordsText = "\n(Location permission not granted)";
        }
      } catch (e) {
        console.warn("Location read failed", e);
        coordsText = "\n(Location unavailable)";
      }

      const message = `I need help — calling ${contact.name} (${contact.number}).${coordsText}\nPlease respond.`;

      // Construct platform-specific sms URL:
      // Android: sms:12345?body=...
      // iOS: sms:12345&body=...
      const separator = Platform.OS === "ios" ? "&" : "?";
      const encoded = encodeURIComponent(message);
      const url = `sms:${contact.number}${separator}body=${encoded}`;

      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("SMS not available", "This device cannot open the SMS composer.");
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      console.warn("sms fallback error", err);
      Alert.alert("Error", "Unable to open SMS composer: " + String(err));
    }
  };

  const renderCard = ({ item }: { item: Contact }) => {
    return (
      <Pressable
        onPress={() => openCallConfirm(item)}
        onLongPress={() => onLongPressCard(item)}
        android_ripple={{ color: "#eee" }}
        style={({ pressed }) => [
          styles.card,
          pressed ? styles.cardPressed : null,
          item.builtIn ? styles.cardBuiltIn : null,
        ]}
      >
        <View style={styles.cardLeft}>
          <Text style={styles.emoji}>{emojiForName(item.name)}</Text>
        </View>
        <View style={styles.cardMiddle}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <Text style={styles.cardNumber}>{item.number}</Text>
        </View>
        <View style={styles.cardRight}>
          <TouchableOpacity style={styles.smallCircle} onPress={() => sendSmsWithLocation(item)}>
            <Text style={{ fontSize: 16 }}>✉️</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.callCircle} onPress={() => openCallConfirm(item)}>
            <Text style={styles.callIcon}>📞</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SOS & Emergency</Text>
        <Text style={styles.sub}>Tap to call — SMS with location available</Text>
      </View>

      <FlatList
        data={all}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={renderCard}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />

      <View style={styles.bottomRow}>
        <TouchableOpacity style={styles.addBtn} onPress={onAddPress}>
          <Text style={styles.addText}>＋ Add Number</Text>
        </TouchableOpacity>
      </View>

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editMode?.editId ? "Edit Contact" : "Add Emergency Contact"}</Text>

            <TextInput placeholder="Name (e.g. Neighbour, Relative)" placeholderTextColor="#999" value={formName} onChangeText={setFormName} style={styles.input} />
            <TextInput placeholder="Phone number (digits, + allowed)" placeholderTextColor="#999" value={formNumber} onChangeText={setFormNumber} keyboardType="phone-pad" style={styles.input} />

            <View style={styles.modalRow}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: "#eee" }]} onPress={() => { setModalVisible(false); setEditMode(null); }}>
                <Text style={{ color: "#333" }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: "#ff3b30" }]} onPress={onSubmitForm}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{editMode?.editId ? "Save" : "Add"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  header: {
    paddingHorizontal: 18,
    paddingTop: 28, // lowered heading so notch safe
    paddingBottom: 8,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ececec",
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#111" },
  sub: { color: "#666", marginTop: 4 },

  list: { padding: 16, paddingBottom: 110 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardPressed: { opacity: 0.95 },
  cardBuiltIn: { borderLeftWidth: 4, borderLeftColor: "#ff6b4a" },

  cardLeft: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#f7f7f7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  emoji: { fontSize: 26 },

  cardMiddle: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  cardNumber: { marginTop: 4, color: "#666", fontSize: 14 },

  cardRight: { flexDirection: "row", alignItems: "center" },
  smallCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f1f1f1",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  callCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  callIcon: { color: "#fff", fontSize: 18 },

  bottomRow: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 22,
    alignItems: "center",
  },
  addBtn: {
    width: "100%",
    backgroundColor: "#1e88e5",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  addText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  modal: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    elevation: 6,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 12 },

  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    marginBottom: 12,
    color: "#111",
  },

  modalRow: { flexDirection: "row", justifyContent: "space-between" },
  modalBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    minWidth: 100,
    alignItems: "center",
  },
});

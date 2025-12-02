// app/calculator.tsx
import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableWithoutFeedback,
  TextInput,
  StyleSheet,
  Alert,
  SafeAreaView,
  Animated,
  Easing,
  GestureResponderEvent,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

export default function Calculator() {
  const [input, setInput] = useState("");
  const [expression, setExpression] = useState("");
  const router = useRouter();

  const evaluateExpression = () => {
    try {
      let expr = expression;
      expr = expr.replace(/÷/g, "/").replace(/×/g, "*").replace(/−/g, "-");
      expr = expr.replace(/[\+\-\*\/]+$/, "");

      const result = eval(expr).toString();
      setExpression(result);
      setInput(result);
    } catch {
      Alert.alert("Invalid Expression");
      setExpression("");
      setInput("");
    }
  };

  const handlePress = async (val: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    if (val === "=") return evaluateExpression();

    if (val === "C") {
      const newExp = expression.slice(0, -1);
      setExpression(newExp);
      setInput(newExp);
      return;
    }

    const operators = ["÷", "×", "−", "/", "*", "-", "+"];

    const last = expression.slice(-1);
    let newExp = expression + val;

    if (operators.includes(val) && operators.includes(last)) {
      newExp = expression.slice(0, -1) + val;
    }

    setExpression(newExp);
    setInput(newExp);

    const onlyDigits = newExp.replace(/\D/g, "");
    if (onlyDigits.length === 6) {
      if (onlyDigits === "000000") {
        await AsyncStorage.removeItem("userPin");
        Alert.alert("PIN Reset", "Register new PIN");
        router.replace("/register");
        return;
      }

      const stored = await AsyncStorage.getItem("userPin");
      if (stored && onlyDigits === stored) {
        router.replace("/home");
      }
    }
  };

  const handleClearAll = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}
    setExpression("");
    setInput("");
  };

  const buttons = [
    ["7", "8", "9", "÷"],
    ["4", "5", "6", "×"],
    ["1", "2", "3", "−"],
    ["0", "C", "=", "+"],
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.displayWrap}>
        <Text style={styles.expressionText}>{expression}</Text>
        <TextInput
          style={styles.input}
          value={input}
          editable={false}
          placeholder="0"
          placeholderTextColor="#999"
        />
      </View>

      <View style={styles.pad}>
        {buttons.map((row, idx) => (
          <View key={idx} style={styles.row}>
            {row.map((val) => (
              <CalcButton
                key={val}
                val={val}
                onPress={handlePress}
                onLongPress={val === "C" ? handleClearAll : undefined}
                isZero={val === "0"}
              />
            ))}
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

function CalcButton({
  val,
  onPress,
  onLongPress,
  isZero,
}: {
  val: string;
  onPress: (v: string) => void;
  onLongPress?: () => void;
  isZero?: boolean;
}) {
  const ops = ["÷", "×", "−", "/", "*", "-", "+", "="];
  const isOperator = ops.includes(val);
  const isClear = val === "C";
  const isEqual = val === "=";

  const scale = useRef(new Animated.Value(1)).current;

  const animate = (to: number) =>
    Animated.timing(scale, {
      toValue: to,
      duration: 80,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <TouchableWithoutFeedback
      onPress={() => {
        animate(0.95);
        setTimeout(() => animate(1), 120);
        onPress(val);
      }}
      onLongPress={onLongPress}
      delayLongPress={500}
      onPressIn={() => animate(0.95)}
      onPressOut={() => animate(1)}
    >
      <Animated.View
        style={[
          styles.button,
          isZero && styles.zeroButton,
          isOperator && styles.operatorButton,
          isClear && styles.clearButton,
          isEqual && styles.equalButton,
          { transform: [{ scale }] },
        ]}
      >
        <Text
          style={[
            styles.buttonText,
            isOperator && styles.operatorText,
            isClear && styles.clearText,
            isEqual && styles.equalText,
          ]}
        >
          {val}
        </Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  displayWrap: {
    width: "100%",
    paddingHorizontal: 18,
    paddingTop: 40,
    paddingBottom: 26,
  },

  expressionText: {
    textAlign: "right",
    color: "#777",
    fontSize: 18,
    marginBottom: 2,
  },

  input: {
    fontSize: 48,
    height: 90,
    textAlign: "right",
    color: "#000",
  },

  pad: {
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 40,
    paddingHorizontal: 12,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  button: {
    flex: 1,
    height: 80,
    marginHorizontal: 6,
    borderRadius: 40,
    backgroundColor: "#f2f2f2",
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
  },

  zeroButton: {
    flex: 2,
    alignItems: "flex-start",
    paddingLeft: 28,
  },

  operatorButton: {
    backgroundColor: "#ff9800",
    elevation: 6,
  },

  clearButton: {
    backgroundColor: "#d9d9d9",
  },

  equalButton: {
    backgroundColor: "#ff8f00",
    elevation: 6,
  },

  buttonText: {
    fontSize: 28,
    color: "#222",
    fontWeight: "600",
  },

  operatorText: { color: "#fff" },
  clearText: { color: "#222", fontWeight: "700" },
  equalText: { color: "#fff", fontWeight: "800" },
});

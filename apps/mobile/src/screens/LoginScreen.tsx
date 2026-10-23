import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../auth/AuthContext.tsx";
import { Brand } from "../components/Brand.tsx";
import { AppText } from "../components/ui/AppText.tsx";
import { MobileApiError } from "../lib/api.ts";
import { fontFamily, radius, spacing } from "../theme/tokens.ts";
import { useTheme } from "../theme/useTheme.ts";

export function LoginScreen() {
  const { colors } = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (caught) {
      setError(
        caught instanceof MobileApiError
          ? caught.message
          : "ورود انجام نشد. لطفاً دوباره تلاش کنید.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Brand />

          <View style={styles.heading}>
            <AppText
              weight="extraBold"
              style={[styles.title, { color: colors.foreground }]}
            >
              ورود به حساب
            </AppText>
            <AppText style={[styles.subtitle, { color: colors.mutedForeground }]}>
              برای دیدن وضعیت مالی خود وارد شوید.
            </AppText>
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.field}>
              <AppText
                weight="medium"
                style={[styles.label, { color: colors.foreground }]}
              >
                ایمیل
              </AppText>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                inputMode="email"
                placeholder="name@example.com"
                placeholderTextColor={colors.mutedForeground}
                editable={!submitting}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surfaceMuted,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
              />
            </View>

            <View style={styles.field}>
              <AppText
                weight="medium"
                style={[styles.label, { color: colors.foreground }]}
              >
                گذرواژه
              </AppText>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                editable={!submitting}
                onSubmitEditing={() => void handleSubmit()}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surfaceMuted,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
              />
            </View>

            {error && (
              <View
                style={[
                  styles.error,
                  {
                    backgroundColor: colors.dangerSubtle,
                    borderColor: colors.danger,
                  },
                ]}
              >
                <AppText style={[styles.errorText, { color: colors.danger }]}>
                  {error}
                </AppText>
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit, busy: submitting }}
              disabled={!canSubmit}
              onPress={() => void handleSubmit()}
              style={({ pressed }) => [
                styles.button,
                {
                  backgroundColor: canSubmit ? colors.primary : colors.disabled,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <AppText
                  weight="bold"
                  style={[
                    styles.buttonText,
                    {
                      color: canSubmit
                        ? colors.primaryForeground
                        : colors.disabledForeground,
                    },
                  ]}
                >
                  ورود
                </AppText>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: radius.md,
    height: 48,
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 14,
    lineHeight: 22,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  content: {
    flexGrow: 1,
    gap: spacing.xl,
    justifyContent: "center",
    padding: spacing.xl,
  },
  error: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 20,
  },
  field: {
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  heading: {
    gap: spacing.xs,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    height: 48,
    paddingHorizontal: spacing.md,
    textAlign: "right",
    writingDirection: "rtl",
  },
  label: {
    fontSize: 12,
    lineHeight: 20,
  },
  safeArea: {
    flex: 1,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 20,
  },
  title: {
    fontSize: 24,
    lineHeight: 34,
  },
});

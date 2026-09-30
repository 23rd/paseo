import { useCallback, useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import { create } from "zustand";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { settingsStyles } from "@/styles/settings";
import { setHostTrustConfirmer, type HostTrustRequest } from "@/runtime/host-trust";

interface PendingTrustPrompt {
  id: number;
  request: HostTrustRequest;
  resolve: (trusted: boolean) => void;
}

interface HostTrustPromptState {
  pending: PendingTrustPrompt | null;
  open: (input: Omit<PendingTrustPrompt, "id">) => void;
  settle: (trusted: boolean) => void;
}

let nextPromptId = 1;

const useHostTrustPromptStore = create<HostTrustPromptState>((set, get) => ({
  pending: null,
  open: (input) => {
    // A newer prompt supersedes an unanswered one; decline the old request so
    // its caller unwinds rather than hangs.
    const previous = get().pending;
    if (previous) previous.resolve(false);
    set({ pending: { ...input, id: nextPromptId++ } });
  },
  settle: (trusted) => {
    const current = get().pending;
    if (!current) return;
    set({ pending: null });
    current.resolve(trusted);
  },
}));

/**
 * Mount once at the app root. While mounted, pairing links ask for
 * confirmation through this sheet; unmounted, the runtime declines them.
 */
export function HostTrustPromptModal() {
  const { t } = useTranslation();
  const pending = useHostTrustPromptStore((state) => state.pending);
  const open = useHostTrustPromptStore((state) => state.open);
  const settle = useHostTrustPromptStore((state) => state.settle);

  useEffect(() => {
    setHostTrustConfirmer(
      (request) =>
        new Promise<boolean>((resolve) => {
          open({ request, resolve });
        }),
    );
    return () => setHostTrustConfirmer(null);
  }, [open]);

  const cancel = useCallback(() => settle(false), [settle]);
  const connect = useCallback(() => settle(true), [settle]);
  const header = useMemo<SheetHeader>(() => ({ title: t("pairing.trust.title") }), [t]);

  if (!pending) return null;

  const { request } = pending;
  return (
    <AdaptiveModalSheet header={header} visible onClose={cancel} testID="host-trust">
      <Text style={styles.confirmText}>
        {request.isKnown ? t("pairing.trust.descriptionKnown") : t("pairing.trust.description")}
      </Text>
      <View style={settingsStyles.card}>
        <DetailRow
          label={t("pairing.trust.hostLabel")}
          value={request.serverId}
          testID="host-trust-server-id"
        />
        <DetailRow
          label={t("pairing.trust.fingerprintLabel")}
          value={request.keyFingerprint}
          testID="host-trust-fingerprint"
          showBorder
        />
        <DetailRow label={t("pairing.trust.endpointLabel")} value={request.endpoint} showBorder />
      </View>
      <View style={styles.confirmActions}>
        <Button
          variant="secondary"
          size="sm"
          style={FLEX_1_STYLE}
          onPress={cancel}
          testID="host-trust-cancel"
        >
          {t("common.actions.cancel")}
        </Button>
        <Button
          variant="default"
          size="sm"
          style={FLEX_1_STYLE}
          onPress={connect}
          testID="host-trust-connect"
        >
          {t("pairing.trust.connect")}
        </Button>
      </View>
    </AdaptiveModalSheet>
  );
}

function DetailRow({
  label,
  value,
  showBorder = false,
  testID,
}: {
  label: string;
  value: string;
  showBorder?: boolean;
  testID?: string;
}) {
  return (
    <View style={[settingsStyles.row, showBorder && settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{label}</Text>
        <Text style={settingsStyles.rowHint} selectable testID={testID}>
          {value}
        </Text>
      </View>
    </View>
  );
}

// Same shape as the remove-host and remove-connection confirm sheets in
// screens/settings/host-page.tsx.
const styles = StyleSheet.create((theme) => ({
  confirmText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  confirmActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
}));

const FLEX_1_STYLE = { flex: 1 };

import { useState, useEffect, useCallback } from "react";

export interface NotificationPreferences {
  submissions: boolean;
  approvals: boolean;
  rejections: boolean;
}

const STORAGE_KEY = "notification-preferences";

const defaults: NotificationPreferences = {
  submissions: true,
  approvals: true,
  rejections: true,
};

export function useNotificationPreferences() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
    } catch {
      return defaults;
    }
  });

  const update = useCallback((key: keyof NotificationPreferences, value: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { prefs, update };
}

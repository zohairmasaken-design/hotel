"use client";

import { useEffect, useState } from "react";

export type AppLanguage = "ar" | "en";

const STORAGE_KEY = "app_language";
const EVENT_NAME = "app-language-change";

const readCookie = (name: string) => {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const parts = document.cookie.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
};

const writeCookie = (name: string, value: string) => {
  if (typeof document === "undefined") return;
  const maxAgeSeconds = 60 * 60 * 24 * 365;
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
};

const normalizeLanguage = (value: unknown): AppLanguage => {
  return value === "en" ? "en" : "ar";
};

export function useAppLanguage() {
  const [language, setLanguageState] = useState<AppLanguage>("ar");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const cookie = readCookie(STORAGE_KEY);
    setLanguageState(normalizeLanguage(stored ?? cookie));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setLanguageState(normalizeLanguage(e.newValue));
    };

    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setLanguageState(normalizeLanguage(detail));
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT_NAME, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVENT_NAME, onCustom);
    };
  }, []);

  const setLanguage = (next: AppLanguage) => {
    const normalized = normalizeLanguage(next);
    setLanguageState(normalized);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, normalized);
      writeCookie(STORAGE_KEY, normalized);
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: normalized }));
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === "ar" ? "en" : "ar");
  };

  return { language, setLanguage, toggleLanguage };
}

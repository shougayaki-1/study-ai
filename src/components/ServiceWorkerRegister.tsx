"use client";

import { useEffect } from "react";

// PWA用 Service Worker をクライアントマウント時に登録する。
// 未対応ブラウザ・登録失敗時は何もしない(アプリの動作自体は継続)。
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 登録失敗は無視(オフライン/Push機能が使えないだけ)
    });
  }, []);

  return null;
}

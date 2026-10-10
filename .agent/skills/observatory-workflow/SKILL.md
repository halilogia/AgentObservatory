---
name: observatory-workflow
description: Engineering standards, immutable state rules, safety boundaries, and definition of done for Agent Observatory.
---

# 🔭 Observatory Workflow & Standards

Bu beceri, Agent Observatory projesinde çalışan tüm yapay zekâ asistanlarının ve otonom süreçlerin uyması zorunlu mühendislik standartlarını, dokunulmaz sınırlarını ve kalite kontrollerini tanımlar.

---

## 🎯 1. Temel Misyon & Prensipler
- **Amaç:** Ajanları diske veya loglara bağımlı kılmadan, doğrudan olay akışları (native streams) ve kancalar üzerinden şeffaf, güvenli ve gerçek zamanlı izlemek ve yönetmek.
- **Epistemik Dürüstlük:** Kanıt yoksa iddia yok. Bir sürecin veya testin çalıştığı iddia ediliyorsa, mutlaka süreç çıkış kodu (`exit code 0`), gerçek olay akışı ve terminal çıktısıyla kanıtlanmalıdır.

---

## 🚫 2. Dokunulmaz Sınırlar ve Güvenlik
1. **Dokunulmaz Dosyalar:** `LICENSE` (GPL-3.0) ve `Desktop/GitHub/Archives/` altındaki dosyalar asla değiştirilemez veya silinemez.
2. **Kural Şişirme Yasağı (Anti-Bloat):** Proje dışı genel kurallar `~/.gemini/config/rules/` içine yazılamaz; her şey modüler beceriler (`skills`) olarak yönetilir.
3. **Cerrahi Düzenleme:** Var olan dosyalarda tam dosya üstüne yazma (`overwrite`) yerine tek blokluk cerrahi araçlar (`replace_file_content`) kullanılmalıdır.
4. **Güvenli Varsayılanlar:** Tüm adaptörlerde `dangerouslySkipPermissions` varsayılan olarak `false` kalmalıdır. Codex sandbox modu varsayılan olarak `workspace-write` kalmalıdır.

---

## 🏛️ 3. Mimari ve Durum Kuralları
1. **Değiştirilemez Terminal Durumu:** `completed`, `failed` veya `cancelled` durumuna geçmiş bir görev asla sonradan başka bir duruma dönüştürülemez.
2. **Oturum İzolasyonu:** Adaptörlerde global oturum değişkeni tutulamaz; her görev izole `taskId` ile eşleşen oturum durumunu taşır.
3. **Süreç Ağacı Sonlandırma:** Görev iptal edildiğinde Windows'ta `taskkill /pid <PID> /T /F` senkron olarak çalıştırılmalı ve alt süreçlerin yetim kalması önlenmelidir.

---

## 🛠️ 4. Tanımlı Tamamlanma Kriteri (Definition of Done)
1. **Tip Güvenliği:** `npm run typecheck` (`tsc --noEmit`) 0 hatayla geçmelidir.
2. **Test Paketi:** `npm run test` (in-memory SQLite ve adaptör testleri) eksiksiz yeşil olmalıdır.
3. **Bütünleşik Doğrulama:** `npm run check` komutu hatasız tamamlanmalıdır.

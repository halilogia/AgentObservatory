# 🤖 Ajan Anayasası & Sınırları (AGENTS)

Bu dosya, projede çalışan yapay zekâ asistanlarının (Antigravity, Claude, Codex vb.) uyması zorunlu kuralları belirler.

---

## 🎯 Nihai Amaç & Vibe
* **Amaç:** Ajanları diske veya loglara bağımlı kılmadan, doğrudan olay akışları ve kancalar üzerinden şeffaf, güvenli ve gerçek zamanlı izlemek ve yönetmek.
* **Vibe:** Yüksek mühendislik kalitesi, sıfır laf kalabalığı, kanıtlı ve test edilmiş kodlama.

---

## 🚫 Katı Sınırlar ve Yasaklar
1. **Dokunulmaz Dosyalar:** `LICENSE` (GPL-3.0) ve `Desktop/GitHub/Archives/` altındaki dosyalar asla değiştirilemez veya silinemez.
2. **Kural Şişirme Yasağı (Anti-Bloat):** Proje dışı genel kurallar `~/.gemini/config/rules/` içine yazılamaz.
3. **Cerrahi Düzenleme:** Var olan dosyalarda tam dosya üstüne yazma (`overwrite`) yerine tek blokluk cerrahi araçlar (`replace_file_content`) kullanılmalıdır.
4. **Tahminsel Başarı Yasağı:** Bir ajanın çalıştığı iddia ediliyorsa, mutlaka süreç çıkış kodu, gerçek olay akışı ve terminal çıktısıyla kanıtlanmalıdır.

---

## 🛠️ Tanımlı Tamamlanma Kriteri (Definition of Done)
1. Kod hatasız çalışmalı ve sözdizimi doğrulanmalıdır.
2. Antigravity MCP üzerinden uçtan uca çağrılabilmelidir.
3. Masaüstü Terminal UI üzerinde canlı olaylar akmalıdır.

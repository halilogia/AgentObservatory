# 🧠 Kalıcı Mühendislik Hafızası (KNOWLEDGE)

Bu dosya, projenin oturumlar arası kalıcı hafızasıdır. Karşılaşılan teknik engeller, çözümleri ve mimari kararlar (ADR) burada kanıtlarıyla listelenir.

---

## 📌 Mimari Karar Kayıtları (ADR)

### ADR-001: JSONL Dosya İzlemeden Event-First Akışa Geçiş
* **Tarih:** 2026-10-10
* **Bağlam:** Eski `agent-watch` programı diske yazılan `.jsonl` dosyalarını tarayarak çalışıyordu. Bu yöntem çift yönlü süreç yönetimi (iptal, duraklatma), gerçek zamanlılık ve token doğruluğunda gecikmelere sebep oluyordu.
* **Karar:** Ana omurga olarak CLI'ların standart akışları (`stream-json`, stdio) üzerinden doğrudan olay yakalayan Event-First mimariye geçildi; dosya izleme yalnızca 3. kademe yedek (fallback) yapıldı.
* **Kanıt:** Claude Code `stream-json` ve Codex `exec --json` doğrudan stdio üzerinden sıfır disk gecikmesiyle JSON akışı sağlar.

### ADR-002: Windows Stdio Pipe Tamponlama ve stdin Çıkmazı (Deadlock)
* **Tarih:** 2026-10-10
* **Bağlam:** Windows ortamında CLI'lar (`claude.exe`, `codex.exe`) non-interactive çalıştırıldığında, standart girdi (`stdin`) açık bırakılırsa ek girdi bekleyerek (3s timeout veya askıda kalma) kilitleniyordu.
* **Çözüm:** Süreçler başlatılırken `stdin: 'ignore'` (veya `subprocess.DEVNULL`) olarak ayarlanmalı; böylece CLI ek stdin beklemeden derhal akışa başlar.

### ADR-003: Windows GUI & Console Masaüstü İzolasyonu (`WinSta0\Default`)
* **Tarih:** 2026-10-10
* **Bağlam:** Antigravity arka plan süreçleri izole bir oturumda çalıştığı için doğrudan `cmd.exe` veya terminal pencereleri açıldığında kullanıcının fiziksel ekranında görünmüyordu.
* **Çözüm:** Windows Win32 `OpenDesktop("WinSta0\\Default")` ve `CREATE_NEW_CONSOLE (0x10)` bayrağı kullanılarak pencereler fiziksel masaüstüne zorlanır.

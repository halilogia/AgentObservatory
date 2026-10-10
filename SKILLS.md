# 🛠️ Beceriler & İş Akışları Rehberi (SKILLS)

Bu doküman, Agent Observatory projesinde aktif olan Global Becerileri ve projeye özel Workspace Workflow Becerilerini listeler.

---

## 🌐 1. Global Beceriler (Antigravity Global Skills)

Tüm projelerde geçerli olan ve `~/.gemini/config/skills/` altında barındırılan sistem seviyesi beceriler:

| Beceri | Sorumluluk & Tetikleyici |
| :--- | :--- |
| **`safe-git`** | Yıkıcı olmayan, eklemeli Git komutları (`git add`, `git commit`, `git push`). Yıkıcı komutlar (`reset --hard`, `clean -fd`, `push --force`) kesinlikle yasaktır. |
| **`core-docs`** | Zorunlu 8 çekirdek doküman standardını (README, ARCHITECTURE, ROADMAP, CHANGELOG, KNOWLEDGE, TASKS, SKILLS, LICENSE) 200 satır anti-bloat sınırıyla yönetir. |
| **`verification-efficiency`** | Tek geçişli (single-pass) test çalıştırma, gereksiz yeniden ölçümleri önleme ve derin özyinelemeli disk taramalarını engelleme. |
| **`agy-customizations`** | Antigravity beceri, eklenti ve yapılandırma standartları kılavuzu. |

---

## 🎯 2. Projeye Özel Workspace Becerileri (Local Skills)

Bu deponun kökündeki `.agent/skills/` dizininde tanımlı olan ve Antigravity tarafından otomatik keşfedilen yerel beceriler:

### `observatory-workflow` (`.agent/skills/observatory-workflow/SKILL.md`)
- **Tetiklenme:** Projede kod yazma, hata ayıklama, görev yürütme ve test süreçlerinde.
- **Kapsam:**
  - Epistemik dürüstlük (kanıt yoksa iddia yok).
  - Değiştirilemez terminal durumu (immutable terminal state) kuralları.
  - Güvenli varsayılanlar (`dangerouslySkipPermissions=false`, `workspace-write` sandbox).
  - Senkron süreç ağacı sonlandırma (`taskkill /T /F`).
  - Tanımlı Tamamlanma Kriteri (`npm run check`).

---

## ⚡ 3. Doğrulama Kapısı (DoD)
Herhangi bir değişiklik tamamlanmadan önce şu komut çalıştırılmalıdır:
```bash
npm run check
```
*(Tip denetimi `tsc --noEmit` ve 6 aşamalı izole test paketi eksiksiz yeşil olmalıdır).*

# 📝 Değişiklik Günlüğü (CHANGELOG)

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenecektir.  
Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.0.0/) standardına dayanır ve [Semantic Versioning](https://semver.org/lang/tr/) kullanır.

---

## [Unreleased]

- **Orphan task reconciliation:** Running tasks with no event for five minutes or a confirmed exited PID now receive an atomic cancellation event. Ingest checks every 30 seconds and tree checks on startup; OpenCode groups user text parts by message and handles recorded assistant errors.
- **Tree rendering performance:** Animation runs every 200 ms without SQLite reads. An 800 ms revision check invalidates task/detail caches only on database changes; terminal output updates only changed or removed rows. In-memory lifecycle and line-diff regressions cover the behavior.

### Eklenenler
- **Web Düşünme Süreci (Thinking / CoT) Akordiyonu (2026-10-29):** Web arayüzüne (web/app.js, web/app.css, web/sessions.js) modelin iç akıl yürütme adımlarını katlanabilir bir kartta gösteren `<details class="thinking-box">` bileşeni eklendi. Antigravity ve akıl yürüten modellerin iç monoloğu (`o.thinking`) normal yanıttan ayrıldı; çoklu dil (`common.thinking`) eklendi.
- **Dinamik Oturum Başlığı Seçimi (2026-10-29):** `src/commands/web_sessions.ts` içine `pickSessionTitle` ve `scorePrompt` mimarisi eklendi. Önemsiz selamlaşma, dolgu ("selam", "say hello in 2 words", "...") ve XML etiketleri filtrelenerek oturumdaki en bilgilendirici ve eylem odaklı kullanıcı istemi dinamik olarak başlık seçildi; 1. tur kör kilidi kaldırıldı.

- **TUI Takılma & Model Doğrulama Benchmark Testi (2026-10-29):** `test/tui_lag_benchmark.test.ts` eklendi. İlk çerçeve render süresi (<100ms), ingest tick süresi, `monitorEventLoopDelay` gecikme profili ve Antigravity model tespiti sürekli test doğrulamasına bağlandı.
- **TUI canlı ingest (2026-10-28):** `src/ui/tree.ts` içindeki canlı ağaç görünümü açılırken `startIngest` arka planda otomatik başlatılıyor (Claude, Codex, OpenCode, Antigravity; son 60 dakika + `backfill: false` + follow). Eski tüm geçmiş başlangıçta yeniden yazılmıyor; yalnızca canlı oturumlar takip ediliyor. `q`, `Esc` ve süreç çıkışında ingest durduruluyor.
- **Ağaç kaydırma çubuğunu fareyle sürükleme (2026-10-28):** `src/ui/tree.ts` içine `treeGeom` (üst satır / görünür satır / toplam satır) eklendi ve `renderTree` her çizimde güncelliyor. Ağaç modunda sağ kenardaki çubuğa sol tık veya basılı sürükleme (`b === 0 || b === 32`) imleç satırını seçime çeviriyor; detay modundaki `scrollFromBarRow` davranışı korunuyor.
- **Ağaç görünümünde kaydırma çubuğu:** Gövde terminal yüksekliğini aştığında başlık sabit kalacak şekilde `scrollOffset` pencerelemesi eklendi; sağ kenarda `│` iz ve `█` tutamaçlı dikey kaydırma çubuğu çiziliyor. Seçili görev pencere içinde ortalanıyor; ok tuşları ve fare tekerleği görünümü pürüzsüz kaydırıyor.
- **Proje kuralı:** `AgentObservatory_Tum_Dosyalar_Mimari_Rehberi.pdf` belgesinin her dosya/mimari değişikliğinde güncel tutulması kuralı `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/guncel-pdf-rehberi.mdc` ve `.gemini/rules/guncel-pdf-rehberi.md` dosyalarına eklendi.
- **Ajan Operasyon Panosu HUD (2026-10-28):** Ofis panelinin alt yarısındaki beş statik kart, gerçek `/tasks` ve `/events` verisine bağlı dört sekmeli HUD'a dönüştürüldü: canlı kanca akışı (`PreToolUse` / `PostToolUse` / `TaskStarted`), seçili ajanın istemi + çalışma dizini + son araç girdisi/çıktısı, okunan/düzenlenen dosya hareketleri ve görev listesi. Yeni `#agentPills` durum hapları, sekme sayaçları, tıklanabilir/kopyalanabilir yollar ve Pixel Agents tarzı canvas konuşma balonları eklendi. Eski panelin camelCase/snake_case uyuşmazlığı (`toolsUsed` / `tools_json`) giderildi.
- **Antigravity (agy) Tier 3 ingest:** `src/ingest/antigravity.ts` eklendi. `~/.gemini/antigravity/brain/*/.system_generated/logs/transcript.jsonl` dosyalarındaki `USER_INPUT`, `PLANNER_RESPONSE` ve `GENERIC` satırları `task.started`, `tool.invoked`, `usage.updated`, `message.delta` ve `tool.completed` olaylarına çevriliyor. `agy` varsayılan ingest kaynaklarına eklendi.
- **Sunucu açıkken otomatik ingest:** `observatory serve` / `observatory web` başlarken `startIngest` arka planda çalışıyor (Claude, Codex, OpenCode, Antigravity; son 24 saat + backfill + follow) ve sunucu kapanışında durduruluyor.

### Düzeltilenler
- **TUI / ingest / SQLite performans turu (2026-10-29):** Gerçek veritabanında (198K olay, 958 turluk tek agy oturumu) ölçülen darboğazlar giderildi.
  - `src/ui/tree.ts`: Ayrıntı sayfası her karede (200 ms) tüm sohbeti baştan çiziyordu (kare ~2,1 sn). Yeni `TranscriptView` olayları bir kez işliyor, tamamlanan satırları genişlik başına bir kez sarıyor; `loadDetail`/`refreshDetail` en yeni 5000 olayı yüklüyor ve revizyon değişince yalnızca son `seq` sonrası olayları ekliyor. Açılış 6,6 sn + 2,1 sn → ~87 ms, kare → ~0,04 ms, yenileme ~250 ms → ~8 ms (oturum tur yapısı hafif `getSessionTaskIndex` ile). `clipAnsi`/`wrapAnsi` O(n²) `slice` yerine yapışkan regex kullanıyor; asistan metni temizliği görev başına önbellekte.
  - `src/ingest`: Periyodik disk taraması (15 sn'de bir ~226 ms takılma) canlı modda `fs.promises` ile asenkron (`asyncDiscover`, ilk tarama senkron kalır); OpenCode `part` sorgusu (indekssiz, her saniye ~40 ms) `PRAGMA data_version` değişmedikçe atlanıyor. Kararlı tick ~40 ms → ~0,7 ms. Canlı modda dosya başına tick'te en fazla 2 MB okunuyor ve parça son satır sonunda kesiliyor (çok baytlı UTF-8 karakter bölünmüyor). `makeManagedCheck` ifadesi bir kez hazırlanıyor.
  - `src/core/sqlite_store.ts`: Tüm sorgular hazır ifade önbelleğinde (`prep`). `idx_events_session` ve `idx_events_task_ts` indeksleri eklendi. `recordEventTx` her olayda yüzlerce KB'lık `tools_json`'u parse/stringify etmiyor; yalnızca `tool.invoked`'da metnin sonuna ekliyor. `mapTaskSummary` değişmeyen araç listesini yeniden parse etmiyor. Yeni: `getEventsTail`, `countEvents`, `getSessionTaskIndex`.
  - `src/ui/tui.ts`: Canlı akıştaki `seenEventIds` kümesi 20.000 kayıtla sınırlandı. Regresyon testi: `test/perf_paths.test.ts`.
- **Antigravity Model Tespiti Düzeltildi (2026-10-29):** `src/ingest/antigravity.ts` içinde eski prototipten kalan `model: 'gemini-2.5-pro'` sabit değeri kaldırıldı; `extractAntigravityModel` ile `<USER_SETTINGS_CHANGE>` içinden aktif model dinamik olarak çıkarılıyor (örn. `gemini-3.8-flash`, `gemini-3.1-pro`, `gemini-3.6-flash`), varsayılan olarak `gemini-3.8-flash` kullanılıyor. SQLite veritabanındaki eski Antigravity kayıtları güncellendi.
- **TUI İlk Açılış Takılması / Donması Giderildi (2026-10-29):** `src/ui/tree.ts` içindeki otomatik ingest süresi 1440 dakikadan (24 saat - 22.000 olay) 60 dakikaya çekildi; `src/ingest/index.ts` dosya başına toplu yazıma geçirildi ve `src/core/sqlite_store.ts` içinde `recordEventTx` SQL sorguları önceden derlenmiş (prepared statement) önbelleğe alındı. Açılış sırasındaki 5.9 saniyelik event loop donması sıfırlandı; ilk çerçeve ~59 ms'de çiziliyor.
- **Oturum satırında eksik başlangıç saati (2026-10-28):** `src/ui/tree.ts` içindeki `sessionLine` artık ilk turun `startTime` değerinden `başladı HH:MM:SS · ` ekliyor; çok turlu oturum satırları da tekil görev satırlarıyla aynı zaman bilgisini gösteriyor.
- **Ağaç yukarı kilitlenmesi / aşağı kaymama (2026-10-28):** `renderTree` içinde seçili satır artık `body.findIndex(l => l.includes('▸'))` ile tahmin edilmiyor; katlanmış oturumların `▸` ikonu her zaman `body[0]`'a denk geldiği için `scrollOffset` daima 0 kalıyordu. Seçili satır, `body`/`lineToId` dizilerine ekleme yapılırken `selectedLine` olarak doğrudan kaydediliyor; ağaç gövdesi artık seçimi ortalayarak sorunsuz kayıyor.
- **Ağaç satırına fareyle tıklayarak seçim (2026-10-28):** `export let treeLineMap` (satır -> görev kimliği) ve `treeScroll` eklendi; gövdede `x < cols - 2` tıklaması tıklanan satırdaki görevi seçiyor.
- **Ajan spinner'ı kare atlaması (2026-10-28):** `spinFrame` 80 ms'ye, `animTimer` 250 ms'den 80 ms'ye çekildi; Braille spinner artık kare atlamadan akıcı dönüyor.
- **Sayfa yukarı/aşağı tuşları (2026-10-28):** `runTree` ağaç modunda `PgUp` (`\x1b[5~`) ile `move(-10)`, `PgDn` (`\x1b[6~`) ile `move(10)` destekliyor.
- **TUI fare/sürükleme kasması (2026-10-28):** `process.stdin.on('data')` başındaki zorunlu `refreshTasks(true)` kaldırıldı; fare paketleri artık senkron SQLite sorgusu tetiklemiyor, veriler 800 ms'lik `timer` ve `[R]` tuşuyla tazeleniyor. `draw()` içine `lastDrawn` kirli kontrolü eklendi (içerik değişmediyse terminale yazılmıyor) ve animasyon aralığı 150 ms'den 250 ms'ye çıkarıldı.
- **Toplu SQLite yazımı:** `src/core/sqlite_store.ts` içine `recordEvents(events, pid?)` eklendi; tüm olaylar tek `BEGIN IMMEDIATE ... COMMIT` işlemi altında yazılıyor. `src/ingest/index.ts` `write()` artık `store.recordEvents(evs.map(toTaskEvent))` kullanıyor (olay başına işlem açma kaldırıldı).
- **TUI periyodik donma (2026-10-28):** `src/ingest/index.ts` içindeki `walkJsonl` artık `IGNORE_DIRS` (`node_modules`, `.git`, `scratch`, `.user_uploaded`, `dist`, `build`, `temp`, `tmp`, `cache`, `.cache`, `Pods`, `.gradle`, `.idea`, `.vscode`) klasörlerine girmiyor. `agy` kaynağı için özyinelemeli tarama yerine doğrudan `<root>/<konuşma>/.system_generated/logs/transcript.jsonl` kontrol ediliyor (7.1 sn -> ~18 ms). `discover()` artık normalde 15 saniyede bir, bekleyen alt ajan varsa en sık 5 saniyede bir çalışıyor; event loop kilitlenmesi giderildi.
- **Ağaç görünümünde SQLite yükü ve başlık sarması:** `src/ui/tree.ts` içine 800 ms TTL'li `cachedTasks` önbelleği eklendi; 150 ms'lik animasyon zamanlayıcısı artık `getRecentTasks` çağırmıyor (tuş basımında zorla tazeleniyor). Başlık satırı 130 sütunun altında kısa kısayol metni kullanıyor ve `clipAnsi` ile kesiliyor; dar terminallerde alt satıra sarılmıyor.
- **OpenCode read-only izin sızıntısı:** `src/adapters/opencode_adapter.ts` ana süreçten miras alınan `OPENCODE_CONFIG_CONTENT` değişkenini temizliyor; read-only (`plan` ajanı) çalıştırmalarda edit izni taşınmıyor.
- **Ağaç görünümünde görev kapsamı ve sıralama:** Varsayılan görünüm artık yalnızca bugünün görevlerini (bitiş/başlangıç zamanı bugüne ait olanlar) ve şu an çalışanları gösteriyor (`todayOrLatest`). Bugün hiç görev yoksa en yeni görevler (TASK_LIMIT'e kadar) listeleniyor. Sıralama en güncel etkinlik üstte olacak şekilde (`lastActive(b) - lastActive(a) || b.startTime - a.startTime`) korunuyor ve imleç her zaman ilk görevde başlıyor. `[A]` "sadece çalışanlar" ile bugünün görevleri arasında geçiş yapıyor.

## [1.0.0-rc.1] - 2026-10-28

### Eklenenler & Tamamlanan Fazlar (Feature Freeze)
- **Faz 1 (Domain Modelleri & SQLite):** `Mission`, `MissionContract`, `TaskNode`, `AgentRun` ve SQLite tabloları.
- **Faz 2 (Capability Discovery):** 6 CLI adaptörü yetenek matrisi, 1ms önbellekli `probe()`.
- **Faz 3 (State Machine & Crash Recovery):** Atomik görev geçişleri, task lease fencing, `completeRun` kilit koruması.
- **Faz 4 (Direct Runner & Execution Contract):** Kota odaklı doğrudan ajan yürütücü, cooldown yönetimi.
- **Faz 5 (DAG Scheduler):** Kahn algoritmalı topolojik paralel dalga yürütücü.
- **Faz 6 (Mission Control Web Arayüzü):** Mission Composer, DAG View, Fleet View, Diff Viewer, 2D Ofis simülasyonu.
- **Faz 7 (Worktree Acceptance Gate):** İzole Git worktree kabul kapısı, stale base/SHA koruması.
- **Faz 8 (Telemetri & Metrikler):** p50/p95 gecikmeler, başarı yüzdeleri ve yönlendirme skoru.
- **Test Kapsamı:** 40 test paketinin tamamı %100 başarıyla geçiyor.


- **Yürütme Sözleşmesi, Direct Mod, Mission Control UI ve Telemetri (Faz 4/6/8):** `src/core/mission_contract.ts` (varsayılanlar + doğrulama), `src/runtime/direct_runner.ts` (yetenek ve kota tabanlı tek ajan seçimi, tek deneme, SQLite kaydı), `src/telemetry/metrics.ts` (p50/p95, başarı oranı, token, yönlendirme skoru), `web/mission_composer.js`, `web/dag_view.js`, `web/fleet_view.js`, `web/diff_viewer.js` ve `web/mission.css` eklendi. Testler: mission_contract, direct_runner, metrics, web_mission. Web modülleri henüz index.html/app.js'e bağlanmadı.

- **AgentAdapter Standardizasyonu & Capability Discovery (Faz 2):** ChatGPT Red Team ve OpenCode DeepSeek analizleriyle BaseAdapter uzerine getCapabilities(), supports() ve onbellekli asenkron probe(): Promise<AgentDescriptor> metotlari eklendi. Tum 6 CLI adaptorunun (claude, codex, agy, opencode, commandcode, freebuff) yetenek matrisi, diff denetimi, duraklatma ve onay kontrolleri standartlastirildi; asilsiz onay ve kontrol varsayimlari engellendi. test/adapter_capabilities.test.ts eklendi (toplam 32 test paketi %100 basariyla geciyor).


- **Dokümantasyon Sadeleştirmesi:** ROADMAP.md makro kilometre taşlarına ve uzun vadeli vizyona indirgendi; aktif sprint ve görev takibi tasks.md'ye devredildi.

- **Mission Control Domain & SQLite Persistence (Faz 1):** Added core domain types (src/core/mission_types.ts) for Mission, MissionContract, TaskNode, AgentRun, and AgentCapability. Extended SQLite store (src/core/sqlite_store.ts) with missions, mission_contracts, mission_tasks, and gent_runs tables and persistence methods. Added unit test suite 	est/mission_domain.test.ts (31 test suites passing 100%).

- Add Command Code (`commandcode`) to the Black Team, runner, doctor, MCP tools, and web engine picker. Parse native NDJSON events, preserve exit failures and sessions, and launch Windows npm shims without shell interpolation. The web picker uses read-only plan mode and the CLI-configured model; CLI/MCP callers can explicitly opt into `--yolo` via `dangerouslySkipPermissions` outside read-only mode.

- **Canlı AI Ofis Simülasyonu (2026-10-27):** `web/office_sim.js` (saf Canvas 2D, CSP uyumlu) Ajan Operasyon Panosu çekmecesine eklendi. SSE olayları animasyona eşlenir: yazma/komut araçları → masada klavye, okuma/arama → kitaplık, `permission.requested` → ünlem rozeti, `task.completed` → yeşil onay + beyaz tahta sayacı, boşta → kahve/su alanı. Ajana tıklayınca kartı vurgulanır. Test: `test/web_office_sim.test.ts`.
- **Nexus AI 2D & 3D Ofis Entegrasyonu ve Stabilizasyonu (2026-10-26):**
  - **TUI [O] Tuşu Çökme Onarımı (`office_opener.ts`):** Windows `cmd.exe start` argüman ayrıştırmasındaki emoji uyumsuzlukları temiz ASCII başlık (`Nexus AI 2D Office`) ve `/D` çalışma dizini parametresi ile giderildi. ESM modülünde `fileURLToPath(import.meta.url)` üzerinden güvenli yol çözümlemesi ve `child.on('error')` ile tam hata yakalama garantisi sağlandı.
  - **Web Paneli 3D Ofis Entegrasyonu (`index.html`, `app.js`, `app.css`, `web.ts`):** 3D Ofis ayrı sekme yerine ana SPA içerik alanına `#officeView` iframe konteyneri ile entegre edildi. Üst bardaki `#officeBtn` ve kapatma butonu ile kesintisiz görünüm geçişi sağlandı; CSP `frame-src 'self'` ve `frame-ancestors 'self'` ile güvenli gömme yapılandırıldı.
- **Dinamik Effort & Model Kontrolü (Claude, Codex, Agy Eşitliği):**
  - Claude adaptörüne `--effort` ve `--model` eklendi (varsayılan `medium`).
  - OpenAI Codex adaptörüne `--model`, `-c model_reasoning_effort="..."` ve `--dangerously-bypass-approvals-and-sandbox` parametreleri eklendi.
  - Antigravity Agy adaptörüne `--model` parametresi eklendi.
- **Multi-Agent Fleet & Git Worktree Orchestrator (Ajan Ordusu Mimarisi):**
  - `WorktreeManager`: Ajanların birbirlerinin dosyalarını ezmesini önleyen Git Worktree yaşam döngüsü (`createWorktree`, `removeWorktree`, `listWorktrees`, `mergeBranch`).
  - `ResourceBroker`: Donanım ve API kaynaklarını denetleyen eşzamanlılık semaforu (`acquireSlot`), tekil entegrasyon yazıcı mutex kilidi (`acquireIntegrationLock`) ve bayat işçi koruması (`lease fencing`).
  - `FleetOrchestrator`: Kahn algoritmasıyla döngü korumalı DAG görev ağacı planlayıcı, paralel worktree yürütme ve otomatik candidate branch (`fleet/integration/*`) hakemlik motoru.
  - MCP Araçları: `run_fleet`, `list_worktrees`, `cleanup_worktree` eklendi.
- **Demo Modülü:** `src/demo_obligation.ts` ve ilişkili `test/demo_obligation.test.ts` eklendi (`calculateMetrics`, `divideMetrics`).



## [1.0.0-alpha] - 2026-10-10


### Eklendi
- **Mimari:** Event-First Hybrid Agent Observatory mimari tasarımı oluşturuldu.
- **Tip Güvenliği:** %100 saf TypeScript mimarisi kuruldu (`npx tsc --noEmit` sıfır hata).
- **Resmi MCP SDK:** `@modelcontextprotocol/sdk` (StdioServerTransport + zod) entegrasyonu tamamlandı.
- **Kalıcı Depolama:** Node 24 yerel `node:sqlite` WAL modunda çapraz süreç (`cross-process`) olay ve görev havuzu eklendi.
- **Süreç Yönetimi:** Windows PID takibi ve `taskkill /pid <PID> /T /F` süreç ağacı sonlandırma altyapısı kuruldu.
- **CLI Doğrulama:** Claude Code ve OpenAI Codex gerçek canlı oturum akışı ve token telemetrisi doğrulandı.
- **Dokümantasyon:** 8 Çekirdek Doküman (README, ARCHITECTURE, ROADMAP, CHANGELOG, KNOWLEDGE, TASKS, AGENTS, LICENSE) kuruldu.
- **Lisans:** GNU General Public License v3.0 (GPL-3.0) eklendi.
### Güvenlik & Doğruluk İyileştirmeleri (Hardening)
- **P0 Güvenlik Varsayılanları:** `dangerouslySkipPermissions` tüm adaptörlerde varsayılan olarak `false` yapıldı. Codex varsayılan sandbox'ı `workspace-write` olarak kısıtlandı.
- **P0 CWD Doğrulaması:** `validateCwd` eklenerek geçersiz ve sistem kök dizinleri (`C:\Windows` vb.) engellendi.
- **P0 Oturum İzolasyonu:** `CodexAdapter` içindeki paylaşılan `currentSessionId` durumu kaldırıldı; görev bazlı `taskSessions` Map yapısına geçilerek paralel oturum çakışması önlendi.
- **P0 İptal Durum Makinesi:** İptal edilen görevlerin süreç kapandıktan sonra `handleExit` tarafından `failed` olarak ezilmesini engelleyen değiştirilemez terminal durum koruması (`isCancelled` & immutable terminal state) eklendi.
- **Süreç Ağacı Sonlandırma:** `taskkill /pid <PID> /T /F` senkron (`execFileSync`) çalıştırılarak alt süreçlerin yetim kalması önlendi.
- **Veri Tutarlılığı & Olay Sıralaması:** SQLite olayları yerleşik `rowid` üzerinden kesin monotonik artan sıra (`getEventsSinceSeq`) ile dinleniyor. Ardışık aynı içerikli `message.delta` parçaları artık yutulmuyor.
- **İzole Test Paketi:** `test/verify_core.ts` in-memory SQLite (`:memory:`) kullanarak kullanıcı veritabanını kirletmeden 6 aşamalı kapsamlı test icra ediyor.
- **Taşınabilirlik:** Sabit Windows yolları yerine dinamik `resolveBinary` ve çevre değişkeni desteği eklendi. README GitHub repo linki `halilogia` olarak düzeltildi.

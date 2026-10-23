# 8. 3D ofis ve izleme bağlantısı

## Sorun
Olaylar bir SQLite dosyasında. Tarayıcıdaki Three.js sahnesi dosya okuyamaz. İki parça gerekir:

1. **Köprü**: SQLite'tan olayları HTTP/SSE ile dışarı veren küçük sunucu (öneri 1, `observatory serve`).
2. **Eşleme**: Olay türünü robot davranışına çeviren kod.

```
Observatory SQLite  ->  serve (SSE /events)  ->  tarayıcı EventSource  ->  robot davranışı
```

## Eşleme tablosu (örnek: SpatialAIOrchestration3D `AgentControl` arayüzü)

| Observatory olayı | 3D çağrısı | Robot ne yapar |
|---|---|---|
| `task.started` | `recall(agentId)` | Masaya oturur |
| `message.delta` | `setActivity(id, 'coding')` | Yazıyor |
| `tool.invoked` Read / Grep | `setActivity(id, 'reading')` | Kitap okuyor |
| `tool.invoked` Bash (test komutu) | `setActivity(id, 'testing')` | Test istasyonuna gider |
| `task.completed` | `setExecution(id, 'completed')` | Bitti işareti |
| `task.failed` | `setExecution(id, 'failed')` | Hata işareti |
| kota hatası (öneri 6) | `rateLimit(id, ms)` | Dinlenme odasına yürür |
| onay bekleme | `requestApproval(id, komut)` | Onay baloncuğu |

`agentId`: görev kimliği değil, **motor adı + masa** olmalı (ör. `codex`, `agy`). Aynı motor birden çok görevdeyse en yenisi robotu yönetir.

Not: SpatialAIOrchestration3D projesine dokunulmayacaksa aynı eşleme yeni bir projede (3D_Archive modelleriyle) yapılır. Bu projenin runtime tipleri (`Activity`, `Execution`, `Availability`) iyi bir sözleşme örneğidir.

## Claude Code içinde izleme: eklenti (mod) mü, site mi?

2026-10-23 tarihli Claude Code 2.1.309 mod API'sine bakıldı.

| Yüzey | Panelde çizilebilenler | Three.js 3D olur mu? |
|---|---|---|
| Masaüstü uygulaması | `Box`, `Text`, `Button`, `Input`, `Select`, `Svg`, `Link`, `Code`, `Markdown`, `Client` | **Hayır.** `Client` modülü de aynı eleman ağacını döner; canvas / WebGL yok |
| Terminal | yukarıdakiler + `Image`, `Raster` (piksel kare) | Piksel kareleri gösterilebilir ama sahne dışarıda çizilmeli |
| VS Code | masaüstü tablosu, `Client` hariç | Hayır |

Sonuç: iki katmanlı çözüm.

1. **Mod (sohbetin yanında panel)**: motor durumu, çalışan görevler, son olay, token sayısı; `Svg` ile 2D izometrik ofis çizimi de mümkün (SVG kaynağı en çok 131.072 karakter). Veri, `observatory serve` ucundan alınır.
2. **Harici site (localhost)**: gerçek 3D ofis. Claude uygulamasının yerleşik tarayıcı panelinde sohbetin yanında açılabilir.

Mod yazmak için `plugin-authoring` becerisi kullanılır (`.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`; `$.ui.open` ile panel). Modun veriyi nasıl okuyacağı (`$.process` / `$.fs` / `$.mcp`) bu wiki yazılırken denenmedi.

## Adım adım uygulama sırası
1. `observatory serve` (SSE) yaz.
2. Mod: 2D durum paneli.
3. Ayrı 3D proje: modelleri `Desktop\3D_Archive\01_Spatial_AI_Office_ThreeJS` ve `08_RobotTechBase_Subnautica_ve_SpaceStation_3D` klasörlerinden al.
4. SSE olaylarını eşleme tablosuyla robotlara bağla.

# Agent Observatory Wiki

Agent Observatory, yerel yapay zekâ CLI ajanlarını (Claude Code, Codex, Antigravity `agy`, OpenCode, Aider, Freebuff) **başlatır, izler ve kaydeder**.

Benzetme: şantiyedeki kamera ve kayıt cihazı. Ustalar (ajanlar) işini yapar; kamera (Observatory) kimin ne zaman ne yaptığını kaydeder ve canlı gösterir.

## Sayfalar

| # | Sayfa | Ne öğrenirsin |
|---|---|---|
| 1 | [Nasıl çalışır](01-nasil-calisir.md) | Veri akışı, benzetme, gerçek örnek |
| 2 | [Kurulum ve kullanım](02-kurulum-ve-kullanim.md) | Komutlar, ilk görev, canlı izleme |
| 3 | [MCP araçları](03-mcp-araclari.md) | Claude Code / Antigravity'den çağırma |
| 4 | [Motorlar ve adaptörler](04-motorlar-ve-adaptorler.md) | Her ajanın bayrakları, modeller, izinler |
| 5 | [Olay modeli ve veritabanı](05-olay-modeli-ve-veritabani.md) | `TaskEvent`, SQLite tabloları, sorgu örnekleri |
| 6 | [Sorun giderme](06-sorun-giderme.md) | Bilinen hatalar ve çözümleri |
| 7 | [Geliştirme önerileri](07-gelistirme-onerileri.md) | Öncelikli yol haritası önerisi |
| 8 | [3D ofis ve izleme bağlantısı](08-3d-ve-izleme-baglantisi.md) | Olayları 3D sahneye ve Claude Code paneline taşıma |
| 9 | [Öğrenme kaynakları](09-ogrenme-kaynaklari.md) | Benzer GitHub projeleri |
| 10 | [HTTP + SSE API](10-http-sse-api.md) | `observatory serve` uç noktaları, güvenlik, örnekler |

## Tek cümlede
Bir ajanı başlat → çıktısını satır satır oku → ortak "olay" biçimine çevir → SQLite dosyasına yaz → ekran, MCP ve 3D aynı dosyadan oku.

> Not: Bu wiki 2026-10-23 tarihli kod durumuna göre yazıldı. Örnekler gerçek çalıştırmalardan alındı.

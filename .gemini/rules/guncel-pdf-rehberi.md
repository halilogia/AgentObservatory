# Güncel PDF Rehberi

`AgentObservatory_Tum_Dosyalar_Mimari_Rehberi.pdf` belgesi, projedeki her dosya veya mimari değişikliğinde (yeni dosya ekleme, çıkarma veya işlev güncellemesinde) sürekli olarak güncel tutulmalıdır.

## Uygulama Kuralları

- Yeni bir kaynak dosya, test, komut, adaptör veya modül eklendiğinde PDF'e ilgili bölüm eklenir.
- Bir dosya kaldırıldığında veya yeniden adlandırıldığında PDF'teki kaydı da güncellenir.
- Bir dosyanın sorumluluğu, arayüzü veya veri akışı değiştiğinde PDF'teki açıklama güncellenir.
- Mimari kararlar (yeni katman, süreç, SQLite şeması, ajan adaptörü) PDF'e yansıtılmadan değişiklik tamamlanmış sayılmaz.
- PDF, kodla aynı commit kapsamında güncellenir; güncelliğini yitirmiş PDF teslim edilmez.

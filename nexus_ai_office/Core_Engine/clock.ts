// Simülasyon saati: gerçek zamana ek bir kaydırma uygulanabilir (testlerde zamanı hızlı ilerletmek için). Üretimde ofset 0'dır.
let offset = 0;
export function simNow(): number { return performance.now() + offset; }
export function advanceClock(ms: number): void { offset += ms; }

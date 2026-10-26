/**
 * Legacy AI Core Sunucu demo verileri ve sahte eylemleri.
 * AI Core Sunucu odası artık doğrudan gerçek canlı kota telemetrisine bağlandığı için,
 * önceki sahte mock script ve butonlar aktif kod tabanından buraya arşivlenmiştir.
 */

export const LEGACY_SERVER_SCRIPT = {
  task: 'AI Core: model kuyruğu ve ısınma',
  phases: ['Boşta', 'Isın', 'Sun', 'Soğut'],
  steps: [
    [0, 'info', 'gpu0 41°C · gpu1 39°C'],
    [1, 'cmd', '$ nexus-core warmup --models 3'],
    [1, 'ok', 'modeller belleğe alındı'],
    [2, 'info', 'istek/sn: 14 · p95 gecikme 620ms'],
    [2, 'warn', 'kuyruk %80 doldu, ek çalışan açılıyor'],
    [3, 'ok', 'çalışan sayısı 4 → 3']
  ]
};

export const LEGACY_SERVER_ACTIONS = [
  {
    labelKey: 'inspector.actions.serverRestart',
    icon: 'restart',
    log: [
      ['warn', 'servisler yeniden başlatılıyor: gateway, kuyruk, model çalışanları'],
      ['ok', '3/3 servis sağlıklı']
    ]
  },
  {
    labelKey: 'inspector.actions.serverGc',
    icon: 'broom',
    log: [
      ['cmd', '$ nexus-core gc --models'],
      ['ok', 'bellek 6,2 GB → 2,4 GB']
    ]
  },
  {
    labelKey: 'inspector.actions.serverMetrics',
    icon: 'chart',
    log: [
      ['info', 'istek/sn: 14 · p95 gecikme: 620ms · kuyruk: 3'],
      ['info', 'gpu0 41°C %63 · gpu1 39°C %58 · bellek 6,2/16 GB']
    ]
  }
];

import i18next from 'i18next';

export type SupportedLanguage = 'tr' | 'en';

export const resources = {
  tr: {
    translation: {
      app: {
        title: 'NEXUS AI Ofis',
        errorCdn: 'Three.js yüklenemedi. İnternet bağlantısı gerekli.',
      },
      common: {
        close: 'Kapat',
        closeEsc: 'Kapat (Esc)',
        copy: 'Kopyala',
        copied: 'Kopyalandı',
        cancel: 'Vazgeç',
        send: 'Gönder',
        search: 'Ara',
        add: 'Ekle',
        delete: 'Sil',
        save: 'Kaydet',
        loading: 'Yükleniyor…',
        backToOffice: 'NEXUS 3D Ofise dön',
        all: 'Tümü',
        language: 'Dil',
        tr: 'Türkçe',
        en: 'English',
      },
      toolbar: {
        langSwitchAria: 'Dili değiştir / Switch language',
        langName: 'TR',
        daynightBtnAria: 'Gündüz/Gece ayarları',
        liveIstanbul: 'Canlı (İstanbul Saati)',
        selectHour: 'Saat seçimi',
        manualHourAria: 'Manuel saat',
        istanbulSuffix: 'İstanbul',
        manualSuffix: 'Manuel',
        testMode: 'Test Modu',
        testModeShortcut: 'Test Modu (Kısayol: Ctrl+Shift+T veya Alt+T)',
        on: 'Açık',
        off: 'Kapalı',
        phases: {
          night: 'Gece',
          dawn: 'Şafak',
          day: 'Gündüz',
          sunset: 'Günbatımı',
          twilight: 'Alacakaranlık',
        },
      },
      tasks: {
        title: 'Görevler',
        boardTitle: 'GÖREVLER',
        boardSubtitle: 'NEXUS AI 3D Canlı Sprint Takibi · Pano üzerine tıklayarak tüm görevleri yönetin',
        boardInspectTitle: 'Görevler Panosu',
        boardInspectSubtitle: 'Canlı Sprint & İş Takibi',
        completedPct: '%{{pct}} Tamamlandı',
        completedWithCount: '%{{pct}} Tamamlandı ({{completed}}/{{total}})',
        stats: {
          total: 'Toplam: {{count}}',
          inProgress: 'Yürütülüyor: {{count}}',
          pending: 'Bekleyen: {{count}}',
          completed: 'Tamamlandı: {{count}}',
        },
        filters: {
          ariaLabel: 'Görev filtreleri',
          all: 'Tümü',
          inProgress: 'Yürütülenler',
          pending: 'Bekleyenler',
          completed: 'Tamamlananlar',
        },
        searchPlaceholder: 'Görev ara…',
        searchAria: 'Görevlerde ara',
        addPlaceholder: '+ Yeni bir sprint görevi ekle…',
        addAria: 'Yeni görev',
        addBtn: 'Ekle',
        emptyFilter: 'Bu filtrede görev bulunmuyor.',
        deleteTooltip: 'Görevi Sil',
        moreTasks: '+ {{count}} görev daha · Pano üzerine tıkla',
        status: {
          pending: 'Bekleyen',
          in_progress: 'Yürütülüyor',
          completed: 'Tamamlandı',
        },
        loadingMessage: 'Görevler yükleniyor…',
        liveSyncActive: 'Canlı görev eşitlemesi etkin.',
      },
      inspector: {
        currentTask: 'Şu anki görev',
        roster: { title: 'Masadaki ajanlar', openCli: 'CLI aç', selectHint: 'Satıra bas: seç · CLI aç: terminali görüntüle', approval: 'onay bekliyor' },
        backToDesk: 'Proje masası',
        eventLog: 'Olay günlüğü',
        cliSession: 'CLI Oturumu',
        cliActive: 'CLI Aktif',
        copy: 'Kopyala',
        liveStream: 'canlı',
        paused: 'duraklatıldı',
        chatPlaceholder: 'Ajana talimat yaz… (Enter: gönder, Shift+Enter: yeni satır)',
        send: 'Gönder',
        youPrefix: 'sen> ',
        agentPrefix: 'ajan> ',
        chips: {
          quota: 'Kota',
          execution: 'Yürütme',
          activity: 'Faaliyet',
          location: 'Konum',
          source: 'Kaynak',
          cooldown: 'Cooldown',
          cooldownSec: '{{sec}} sn',
          connection: 'Bağlantı',
          connectionLost: 'Koptu',
        },
        states: {
          available: 'Uygun',
          rate_limited: 'Kota dolu',
          offline: 'Çevrimdışı',
          unknown: 'Belirsiz',
          idle: 'Boşta',
          running: 'Çalışıyor',
          awaiting_approval: 'Onay bekliyor',
          completed: 'Tamamlandı',
          failed: 'Hata',
          reading: 'Okuyor',
          obsidian: 'Obsidian kasası',
          web_chatgpt: 'ChatGPT Web',
          coding: 'Kod yazıyor',
          reasoning: 'Düşünüyor',
          testing: 'Test ediyor',
          ops: 'Sunucu işlemi',
          planning: 'Planlıyor',
          writing: 'Yazıyor',
          none: 'Faaliyet yok',
          seated: 'Masada',
          standing: 'Ayakta',
          walking: 'Yürüyor',
          resting: 'Dinleniyor',
        },
        deskProject: 'Proje',
        waitingTask: 'Görev bekleniyor',
        phases: {
          thinking: 'Düşünüyor',
          reading: 'Okuyor / İnceliyor',
          coding: 'Kodluyor',
          testing: 'Test ediyor',
        },
        approval: {
          title: 'CLI onayı bekleniyor',
          command: 'İşlem / komut',
          approve: 'Onayla (Y)',
          reject: 'Reddet (N)',
          notePlaceholder: 'İsteğe bağlı yanıt / geri bildirim…',
        },
        controls: {
          requestApproval: 'Onay İste (demo)',
          dropConnection: 'Bağlantıyı Kopar',
          restoreConnection: 'Bağlantıyı Geri Getir',
          fail: 'Hata Ver',
          complete: 'Tamamla',
          limitBreak: 'Limiti Doldur (Molaya Gönder)',
          recallDesk: 'Masaya Çağır',
          startTask: 'Göreve Başla',
          think: 'Düşünüyor',
          read: 'Okuyor / İnceliyor',
          code: 'Kodluyor',
          test: 'Test ediyor',
          obsidian: 'Obsidian (MCP)',
          webChatgpt: 'ChatGPT Web (MCP)',
          plan: 'Plan Odası',
        },
        actions: {
          newProject: '+ Yeni Proje Ekle',
          pause: 'Durdur',
          resume: 'Devam Et',
          statusSummary: 'Durum Özeti',
          inspectDiff: 'Diff İncele',
          backToLog: 'Günlüğe Dön',
          closeDesk: 'Masayı Kapat (Projeyi Kaldır)',
          addAgent: 'Ajan Ekle',
          removeAgent: 'Seçili Ajanı Çıkar',
          selectModel: 'Model Seçin',
          agentNamePrompt: 'Yeni Codex ajanının adı',
          serverQuotas: 'Kotalar & Limitler',
          serverRestart: 'Servisleri Yeniden Başlat',
          serverGc: 'Bellek Temizle',
          serverMetrics: 'Metrikler',
        },
        placeholders: {
          roomNote: 'Oda notu veya filtre...',
          serverCommand: 'Sunucu komutu veya log filtresi...',
          agentInstruction: 'Ajana talimat yaz… (Enter: gönder)',
        },
      },
      projectDialog: {
        picker: { default: 'varsayılan', engine: 'Sağlayıcı / motor', models: 'Güncel modeller' },
        title: 'Yeni Proje Masası',
        projectName: 'Proje adı',
        projectPlaceholder: 'örn. Global Web Ağı, Kripto Botu, Mobil App',
        icon: 'İkon',
        icons: {
          globe: 'Global Ağ',
          gamepad: 'Strateji / Oyun',
          book: 'Tez / Araştırma',
          heart: 'LifeOS / Yaşam',
          phone: 'Mobil',
          doc: 'Doküman',
          cube: '3D / Donanım',
        },
        accentColor: 'Vurgu rengi',
        colors: {
          cyan: 'Camgöbeği',
          purple: 'Mor',
          orange: 'Turuncu',
          green: 'Yeşil',
          pink: 'Pembe',
          yellow: 'Sarı',
        },
        agent: 'Ajan',
        agentPlaceholder: 'Ajan adı (boşsa model adı)',
        agentsCount: 'Ajanlar & Koltuk Sayısı',
        addAgent: 'Ajan / Koltuk Ekle',
        removeAgent: 'Ajan / Koltuk Çıkar',
        agentName: 'Ajan adı',
        model: 'Model',
        cancel: 'Vazgeç',
        deploy: 'Masayı Kur',
      },
      quota: {
        pageTitle: 'Kotalar & Limitler · NEXUS AI Ofis',
        headerTitle: 'Kotalar & Limitler',
        headerSubtitle: 'Antigravity · ChatGPT · Claude: tek yerden canlı kullanım',
        available: 'Uygun',
        limitExceeded: 'Limit doldu',
        remaining: 'kalan',
        used: 'kullanılmış',
        resetsIn: 'yenilenir: {{time}}',
        noResetReported: 'Yenilenme zamanı bildirilmedi',
        windowReset: 'Süre sıfırlandı',
        telemetryActive: 'Canlı CLI/IDE Telemetrisi Aktif',
        telemetryWaiting: 'Canlı telemetri bekleniyor',
        telemetryLimited: 'Canlı Telemetri: Oturum Sınırı Tespit Edildi',
        telemetryCdp: 'Canlı Chrome CDP (ChatGPT Web Aktif)',
        telemetryObservatory: 'Canlı Observatory (Claude CLI Aktif)',
        telemetryIde: 'Canlı Antigravity IDE (Gemini Aktif)',
        syncJustNow: 'Senkron: Az önce',
        syncAgo: 'Senkron: {{time}} önce',
        syncWaiting: 'Senkron: Bekleniyor',
        walkNote: "Kota doldu: bu sağlayıcının ajanları NEXUS ofisinde Dinlenme Odası'na yürür.",
        footerNote: 'Canlı Telemetri: Veriler Claude Code CLI/Observatory, Chrome CDP ve Antigravity süreçlerinden doğrulanır.',
        backButton: 'NEXUS 3D Ofise dön',
      },
      rooms: {
        lounge: {
          sign: 'DİNLENME ODASI',
          tag: 'DİNLEN & KAHVE',
          name: 'Dinlenme Odası',
          role: 'Rate-limit, cooldown, standby',
          metric: 'Boş oturak: {{free}}/{{total}} · Dinlenen: {{resting}} · demo',
        },
        library: {
          sign: 'KÜTÜPHANE',
          tag: 'ARAŞTIRMA & DOKÜMAN',
          name: 'Kütüphane / Araştırma Odası',
          role: 'Dokümanlar, web araştırması, bellek ve kaynaklar',
          metric: 'Araştırma masası hazır · demo',
        },
        testlab: {
          sign: 'TEST LABORATUVARI',
          tag: 'TEST & KALİTE',
          name: 'Test Laboratuvarı',
          role: 'Test koşuları, lint, derleme ve doğrulama',
          metric: 'Test istasyonu hazır · demo',
        },
        war: {
          sign: 'PLAN ODASI',
          tag: 'GÖREV MERKEZİ',
          name: 'Plan Odası',
          role: 'Görev planları, mimari denetim, delegasyon',
          metric: 'Bekleyen onay: {{count}} · demo',
        },
        server: {
          sign: 'SUNUCU ODASI',
          tag: 'YAPAY ZEKA ÇEKİRDEĞİ',
          name: 'Sunucu Odası',
          role: 'IPC, process sağlığı, bağlantılar',
          metric: 'Servis: 3/3 sağlıklı',
        },
        librarian: {
          name: 'Kütüphaneci',
          subtitle: 'ChatGPT Web · Obsidian Bilgi Kasası',
          role: 'ChatGPT Web · Obsidian',
          metric: 'Kasa: 412 not · ChatGPT Web oturumu hazır · demo',
          placeholder: 'Kütüphaneciye sor...',
          scan: 'Kasayı Tara',
          graph: 'Bilgi Ağını Aç',
          ask: 'ChatGPT Web ile Sor',
        },
        gravityguard: {
          name: 'GravityGuard',
          subtitle: 'Anayasal Güvenlik & Mimari Koruyucu',
          role: 'Güvenlik Robotu',
          metric: 'İhlal: 0 · Korumalar: Aktif (Emoji / Pop-up / SRP)',
          placeholder: 'Güvenlik birimine talimat ilet...',
          audit: 'Anayasal Denetim',
          scan: 'Güvenlik Taraması',
          shield: 'Kalkanı Yenile',
          guard: 'Stop Guard Doğrula',
        },
        corridor: {
          name: 'Koridor',
        },
        workspace: {
          name: 'Açık Çalışma Alanı',
        },
        manager: {
          name: 'Planning Manager AI',
          subtitle: 'Plan odası · yönetici',
          role: 'Orkestratör',
        },
        aiCore: {
          name: 'AI Core Sunucu',
          subtitle: 'Sunucu köşesi',
          role: 'Model sunucusu',
        },
      },
      demoProjects: {
        thesis: {
          name: 'Tez',
          agent0: 'Literatür taraması ve bölüm 3 taslağı',
          agent1: 'Kaynakça ve atıf denetimi',
        },
        strategy: {
          name: 'Strateji Oyunu',
          agent0: 'Birim hareket sistemi',
          agent1: 'Harita üretici refaktörü',
        },
        lifeos: {
          name: 'LifeOS',
          agent0: 'Günlük plan ekranı',
        },
      },
    },
  },
  en: {
    translation: {
      app: {
        title: 'NEXUS AI Office',
        errorCdn: 'Failed to load Three.js. Internet connection required.',
      },
      common: {
        close: 'Close',
        closeEsc: 'Close (Esc)',
        copy: 'Copy',
        copied: 'Copied',
        cancel: 'Cancel',
        send: 'Send',
        search: 'Search',
        add: 'Add',
        delete: 'Delete',
        save: 'Save',
        loading: 'Loading…',
        backToOffice: 'Back to NEXUS 3D Office',
        all: 'All',
        language: 'Language',
        tr: 'Türkçe',
        en: 'English',
      },
      toolbar: {
        langSwitchAria: 'Switch language / Dili değiştir',
        langName: 'EN',
        daynightBtnAria: 'Day/Night settings',
        liveIstanbul: 'Live (Istanbul Time)',
        selectHour: 'Select hour',
        manualHourAria: 'Manual hour',
        istanbulSuffix: 'Istanbul',
        manualSuffix: 'Manual',
        testMode: 'Test Mode',
        testModeShortcut: 'Test Mode (Shortcut: Ctrl+Shift+T or Alt+T)',
        on: 'On',
        off: 'Off',
        phases: {
          night: 'Night',
          dawn: 'Dawn',
          day: 'Day',
          sunset: 'Sunset',
          twilight: 'Twilight',
        },
      },
      tasks: {
        title: 'Tasks',
        boardTitle: 'TASKS',
        boardSubtitle: 'NEXUS AI 3D Live Sprint Tracking · Click on the board to manage all tasks',
        boardInspectTitle: 'Tasks Board',
        boardInspectSubtitle: 'Live Sprint & Task Tracking',
        completedPct: '{{pct}}% Completed',
        completedWithCount: '{{pct}}% Completed ({{completed}}/{{total}})',
        stats: {
          total: 'Total: {{count}}',
          inProgress: 'In Progress: {{count}}',
          pending: 'Pending: {{count}}',
          completed: 'Completed: {{count}}',
        },
        filters: {
          ariaLabel: 'Task filters',
          all: 'All',
          inProgress: 'In Progress',
          pending: 'Pending',
          completed: 'Completed',
        },
        searchPlaceholder: 'Search tasks…',
        searchAria: 'Search in tasks',
        addPlaceholder: '+ Add a new sprint task…',
        addAria: 'New task',
        addBtn: 'Add',
        emptyFilter: 'No tasks found in this filter.',
        deleteTooltip: 'Delete Task',
        moreTasks: '+ {{count}} more tasks · Click on board',
        status: {
          pending: 'Pending',
          in_progress: 'In Progress',
          completed: 'Completed',
        },
        loadingMessage: 'Loading tasks…',
        liveSyncActive: 'Live task synchronization active.',
      },
      inspector: {
        currentTask: 'Current Task',
        roster: { title: 'Agents at this desk', openCli: 'Open CLI', selectHint: 'Click a row to select · Open CLI: view the terminal', approval: 'awaiting approval' },
        backToDesk: 'Project desk',
        eventLog: 'Event Log',
        cliSession: 'CLI Session',
        cliActive: 'CLI Active',
        copy: 'Copy',
        liveStream: 'live',
        paused: 'paused',
        chatPlaceholder: 'Write instructions to agent… (Enter: send, Shift+Enter: newline)',
        send: 'Send',
        youPrefix: 'you> ',
        agentPrefix: 'agent> ',
        chips: {
          quota: 'Quota',
          execution: 'Execution',
          activity: 'Activity',
          location: 'Location',
          source: 'Source',
          cooldown: 'Cooldown',
          cooldownSec: '{{sec}} s',
          connection: 'Connection',
          connectionLost: 'Lost',
        },
        states: {
          available: 'Available',
          rate_limited: 'Rate limited',
          offline: 'Offline',
          unknown: 'Unknown',
          idle: 'Idle',
          running: 'Running',
          awaiting_approval: 'Awaiting approval',
          completed: 'Completed',
          failed: 'Failed',
          reading: 'Reading',
          obsidian: 'Obsidian vault',
          web_chatgpt: 'ChatGPT Web',
          coding: 'Coding',
          reasoning: 'Reasoning',
          testing: 'Testing',
          ops: 'Server ops',
          planning: 'Planning',
          writing: 'Writing',
          none: 'No activity',
          seated: 'Seated',
          standing: 'Standing',
          walking: 'Walking',
          resting: 'Resting',
        },
        deskProject: 'Project',
        waitingTask: 'Awaiting task',
        phases: {
          thinking: 'Thinking',
          reading: 'Reading / Analyzing',
          coding: 'Coding',
          testing: 'Testing',
        },
        approval: {
          title: 'CLI approval required',
          command: 'Operation / command',
          approve: 'Approve (Y)',
          reject: 'Reject (N)',
          notePlaceholder: 'Optional reply / feedback…',
        },
        controls: {
          requestApproval: 'Request approval (demo)',
          dropConnection: 'Drop connection',
          restoreConnection: 'Restore connection',
          fail: 'Fail task',
          complete: 'Complete',
          limitBreak: 'Exhaust Limit (Send to Break)',
          recallDesk: 'Recall to Desk',
          startTask: 'Start Task',
          think: 'Thinking',
          read: 'Reading / Analyzing',
          code: 'Coding',
          test: 'Testing',
          obsidian: 'Obsidian (MCP)',
          webChatgpt: 'ChatGPT Web (MCP)',
          plan: 'Planning Room',
        },
        actions: {
          newProject: '+ Add New Project',
          pause: 'Pause',
          resume: 'Resume',
          statusSummary: 'Status Summary',
          inspectDiff: 'Inspect Diff',
          backToLog: 'Back to Log',
          closeDesk: 'Close Desk (Remove Project)',
          addAgent: 'Add Agent',
          removeAgent: 'Remove Selected Agent',
          selectModel: 'Select Model',
          agentNamePrompt: 'New Codex agent name',
          serverQuotas: 'Quotas & Limits',
          serverRestart: 'Restart Services',
          serverGc: 'Clear Memory',
          serverMetrics: 'Metrics',
        },
        placeholders: {
          roomNote: 'Room note or filter...',
          serverCommand: 'Server command or log filter...',
          agentInstruction: 'Write instructions to agent… (Enter: send)',
        },
      },
      projectDialog: {
        picker: { default: 'default', engine: 'Provider / engine', models: 'Current models' },
        title: 'New Project Desk',
        projectName: 'Project name',
        projectPlaceholder: 'e.g. Global Web Network, Crypto Bot, Mobile App',
        icon: 'Icon',
        icons: {
          globe: 'Global Network',
          gamepad: 'Strategy / Game',
          book: 'Thesis / Research',
          heart: 'LifeOS / Life',
          phone: 'Mobile',
          doc: 'Document',
          cube: '3D / Hardware',
        },
        accentColor: 'Accent color',
        colors: {
          cyan: 'Cyan',
          purple: 'Purple',
          orange: 'Orange',
          green: 'Green',
          pink: 'Pink',
          yellow: 'Yellow',
        },
        agent: 'Agent',
        agentPlaceholder: 'Agent name (empty for model name)',
        agentsCount: 'Agents & Seat Count',
        addAgent: 'Add Agent / Seat',
        removeAgent: 'Remove Agent / Seat',
        agentName: 'Agent name',
        model: 'Model',
        cancel: 'Cancel',
        deploy: 'Deploy Desk',
      },
      quota: {
        pageTitle: 'Quotas & Limits · NEXUS AI Office',
        headerTitle: 'Quotas & Limits',
        headerSubtitle: 'Antigravity · ChatGPT · Claude: live usage in one place',
        available: 'Available',
        limitExceeded: 'Limit exceeded',
        remaining: 'remaining',
        used: 'used',
        resetsIn: 'resets in: {{time}}',
        noResetReported: 'Reset time not reported',
        windowReset: 'Window reset',
        telemetryActive: 'Live CLI/IDE Telemetry Active',
        telemetryWaiting: 'Awaiting live telemetry',
        telemetryLimited: 'Live Telemetry: Session Limit Detected',
        telemetryCdp: 'Live Chrome CDP (ChatGPT Web Active)',
        telemetryObservatory: 'Live Observatory (Claude CLI Active)',
        telemetryIde: 'Live Antigravity IDE (Gemini Active)',
        syncJustNow: 'Synced: Just now',
        syncAgo: 'Synced: {{time}} ago',
        syncWaiting: 'Synced: Awaiting',
        walkNote: 'Quota exhausted: agents of this provider walk to the Lounge in NEXUS office.',
        footerNote: 'Live Telemetry: Data verified from Claude Code CLI/Observatory, Chrome CDP, and Antigravity processes.',
        backButton: 'Back to NEXUS 3D Office',
      },
      rooms: {
        lounge: {
          sign: 'LOUNGE',
          tag: 'REST & COFFEE',
          name: 'Lounge',
          role: 'Rate-limit, cooldown, standby',
          metric: 'Free seats: {{free}}/{{total}} · Resting: {{resting}} · demo',
        },
        library: {
          sign: 'LIBRARY',
          tag: 'RESEARCH & DOCS',
          name: 'Library / Research Room',
          role: 'Docs, web research, memory and sources',
          metric: 'Research desk ready · demo',
        },
        testlab: {
          sign: 'QA LAB',
          tag: 'TEST & QA',
          name: 'Test Lab',
          role: 'Test runs, lint, builds and verification',
          metric: 'Test station ready · demo',
        },
        war: {
          sign: 'PLANNING ROOM',
          tag: 'MISSION CONTROL',
          name: 'Planning Room',
          role: 'Task plans, architecture review, delegation',
          metric: 'Pending approvals: {{count}} · demo',
        },
        server: {
          sign: 'SERVER ROOM',
          tag: 'AI CORE',
          name: 'Server Room',
          role: 'IPC, process health, connections',
          metric: 'Services: 3/3 healthy',
        },
        librarian: {
          name: 'Librarian',
          subtitle: 'ChatGPT Web · Obsidian Knowledge Vault',
          role: 'ChatGPT Web · Obsidian',
          metric: 'Vault: 412 notes · ChatGPT Web session ready · demo',
          placeholder: 'Ask the librarian...',
          scan: 'Scan Vault',
          graph: 'Open Graph View',
          ask: 'Ask ChatGPT Web',
        },
        gravityguard: {
          name: 'GravityGuard',
          subtitle: 'Constitutional Safety & Architecture Sentinel',
          role: 'Security Sentinel',
          metric: 'Violations: 0 · Guards: Active (Emoji / Pop-up / SRP)',
          placeholder: 'Dispatch security instruction...',
          audit: 'Constitutional Audit',
          scan: 'Security Scan',
          shield: 'Refresh Shield',
          guard: 'Verify Stop Guard',
        },
        corridor: {
          name: 'Corridor',
        },
        workspace: {
          name: 'Open Workspace',
        },
        manager: {
          name: 'Planning Manager AI',
          subtitle: 'Planning room · manager',
          role: 'Orchestrator',
        },
        aiCore: {
          name: 'AI Core Server',
          subtitle: 'Server corner',
          role: 'Model server',
        },
      },
      demoProjects: {
        thesis: {
          name: 'Thesis',
          agent0: 'Literature review & section 3 draft',
          agent1: 'Bibliography & citation audit',
        },
        strategy: {
          name: 'Strategy Game',
          agent0: 'Unit movement system',
          agent1: 'Map generator refactor',
        },
        lifeos: {
          name: 'LifeOS',
          agent0: 'Daily schedule view',
        },
      },
    },
  },
} as const;

export function getInitialLanguage(): SupportedLanguage {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('nexus_lang');
    if (saved === 'tr' || saved === 'en') return saved;
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    if (navigator.language.toLowerCase().startsWith('en')) return 'en';
  }
  return 'tr';
}

let initialized = false;

export function initI18n(lang: SupportedLanguage = getInitialLanguage()) {
  if (!initialized && !i18next.isInitialized) {
    i18next.init({
      lng: lang,
      fallbackLng: 'tr',
      resources: resources as any,
      interpolation: {
        escapeValue: false,
      },
    });
    initialized = true;
  } else if (i18next.language !== lang) {
    i18next.changeLanguage(lang);
  }
  return i18next;
}

const listeners = new Set<(lang: SupportedLanguage) => void>();

export function onLanguageChange(fn: (lang: SupportedLanguage) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setLanguage(lang: SupportedLanguage): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('nexus_lang', lang);
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
  i18next.changeLanguage(lang, () => {
    listeners.forEach((fn) => fn(lang));
  });
}

export function getLanguage(): SupportedLanguage {
  const current = (i18next.language as SupportedLanguage) || 'tr';
  return current.startsWith('en') ? 'en' : 'tr';
}

export function toggleLanguage(): SupportedLanguage {
  const next: SupportedLanguage = getLanguage() === 'tr' ? 'en' : 'tr';
  setLanguage(next);
  return next;
}

export const t = ((key: string, options?: Record<string, unknown>) => {
  if (!initialized && !i18next.isInitialized) {
    initI18n();
  }
  return i18next.t(key, options);
}) as typeof i18next.t;

export function mountLangSwitcher(container: HTMLElement): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tbtn lang-btn';
  btn.id = 'lang-btn';

  const render = () => {
    const lang = getLanguage();
    btn.setAttribute('aria-label', t('toolbar.langSwitchAria'));
    btn.innerHTML = `<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg><span style="font-weight: 800; font-size: 13px; letter-spacing: 0.5px;">${lang.toUpperCase()}</span>`;
  };

  btn.onclick = () => {
    toggleLanguage();
  };

  onLanguageChange(() => {
    render();
  });

  render();
  container.appendChild(btn);
  return btn;
}

export default i18next;

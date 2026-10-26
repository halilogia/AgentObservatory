const feed = document.querySelector('#feed');
const checked = document.querySelector('#checked');
const sourceStatus = document.querySelector('#source-status');
const search = document.querySelector('#search');
const refreshButton = document.querySelector('#refresh');
let records = [];
let currentFilter = 'all';
let currentOrigin = 'all';

function safeDate(value) {
  if (!value) return 'Tarih belirtilmemiş';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function render() {
  const term = search.value.trim().toLocaleLowerCase('tr-TR');
  const shown = records.filter((item) => {
    const matchesSource = currentFilter === 'all' || item.sourceId === currentFilter;
    const matchesOrigin = currentOrigin === 'all' || item.origin === currentOrigin;
    const haystack = `${item.title} ${item.summary} ${item.source}`.toLocaleLowerCase('tr-TR');
    return matchesSource && matchesOrigin && (!term || haystack.includes(term));
  });
  if (!shown.length) {
    feed.innerHTML = '<div class="empty">Bu filtreyle eşleşen güncelleme yok.</div>';
    return;
  }
  feed.replaceChildren(...shown.map((item) => {
    const card = document.createElement('article');
    card.className = 'card';
    const meta = document.createElement('div'); meta.className = 'card-meta';
    const source = document.createElement('span'); source.className = 'source-name'; source.textContent = `${item.source} · ${item.origin === 'github' ? 'GitHub' : 'Resmî site'}`;
    const date = document.createElement('time'); date.textContent = safeDate(item.date); if (item.date) date.dateTime = item.date;
    meta.append(source, date);
    const title = document.createElement('h2'); title.textContent = item.title;
    const summary = document.createElement('p'); summary.textContent = item.summary || 'Yayıncı sayfasında ayrıntıları aç.';
    const link = document.createElement('a'); link.className = 'card-link'; link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Duyuruyu aç ↗';
    card.append(meta, title, summary, link);
    return card;
  }));
}

async function load() {
  refreshButton.disabled = true;
  refreshButton.classList.add('loading');
  checked.textContent = 'Resmî yayın akışları kontrol ediliyor…';
  feed.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/updates', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Sunucu yanıtı: ${response.status}`);
    const data = await response.json();
    records = data.items;
    const failed = data.sources.filter((source) => !source.ok);
    checked.textContent = `${records.length} güncelleme · Son kontrol ${safeDate(data.checkedAt)}${failed.length ? ` · ${failed.length} kaynak yanıt vermedi` : ''}`;
    sourceStatus.replaceChildren(...data.sources.map((source) => {
      const pill = document.createElement('span');
      pill.className = `source-pill ${source.ok ? 'ok' : 'bad'}`;
      pill.textContent = source.ok ? `${source.name} · ${source.count}` : `${source.name} · erişilemedi`;
      if (!source.ok) pill.title = source.error || 'Akışa ulaşılamadı';
      return pill;
    }));
    render();
  } catch (error) {
    checked.textContent = `Güncellemeler alınamadı: ${error.message}`;
    sourceStatus.replaceChildren();
    feed.innerHTML = '<div class="empty">Panel yerel sunucudan açıldı, ancak yayın akışları getirilemedi. Yenile düğmesiyle tekrar deneyebilirsin.</div>';
  } finally {
    feed.setAttribute('aria-busy', 'false');
    refreshButton.disabled = false;
    refreshButton.classList.remove('loading');
  }
}

document.querySelector('#filters').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-filter]');
  if (!button) return;
  currentFilter = button.dataset.filter;
  document.querySelectorAll('#filters .filter').forEach((el) => el.classList.toggle('active', el === button));
  render();
});
document.querySelector('#origin-filters').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-origin]');
  if (!button) return;
  currentOrigin = button.dataset.origin;
  document.querySelectorAll('#origin-filters .filter').forEach((el) => el.classList.toggle('active', el === button));
  render();
});
search.addEventListener('input', render);
refreshButton.addEventListener('click', load);
load();
setInterval(load, 10 * 60 * 1000);

// Waypoint grafiği, A*, düğüm rezervasyonu ve hareket eden ajan (NavAgent). Saf mantık: Three.js bilmez, test edilebilir.
// Kural: bir robot bir düğüme girmeden önce o düğümü rezerve eder; böylece iki robot aynı noktada (ya da bitişik
// düğümlerde iç içe) bulunamaz. Düğümler arası mesafe >= 0.9 tutulur (robot başı ~0.88 geniş).

export interface NavNode {
  id: string;
  x: number;
  z: number;
  room: string;
  neighbors: string[];
  /** oturma noktası: bot orijininin y yüksekliği ve bakış açısı (rotation.y) */
  seat?: { y: number; ry: number };
  /** istasyon düğümünde robotun bakış yönü (rotation.y) */
  face?: number;
}

export type EdgeKind = 'walk' | 'seat';

const ekey = function (a: string, b: string): string { return a < b ? a + '|' + b : b + '|' + a; };

export class NavGraph {
  readonly nodes = new Map<string, NavNode>();
  private readonly kinds = new Map<string, EdgeKind>();
  version = 0;

  has(id: string): boolean { return this.nodes.has(id); }
  get(id: string): NavNode { const n = this.nodes.get(id); if (!n) throw new Error('Düğüm yok: ' + id); return n; }

  addNode(n: Omit<NavNode, 'neighbors'>): void {
    this.nodes.set(n.id, Object.assign({ neighbors: [] }, n));
    this.version++;
  }

  link(a: string, b: string, kind?: EdgeKind): void {
    const A = this.get(a), B = this.get(b);
    if (A.neighbors.indexOf(b) < 0) A.neighbors.push(b);
    if (B.neighbors.indexOf(a) < 0) B.neighbors.push(a);
    this.kinds.set(ekey(a, b), kind || 'walk');
    this.version++;
  }

  edgeKind(a: string, b: string): EdgeKind { return this.kinds.get(ekey(a, b)) || 'walk'; }

  removeNode(id: string): void {
    const n = this.nodes.get(id); if (!n) return;
    n.neighbors.forEach((nb) => {
      const m = this.nodes.get(nb);
      if (m) m.neighbors = m.neighbors.filter(function (x) { return x !== id; });
      this.kinds.delete(ekey(id, nb));
    });
    this.nodes.delete(id); this.version++;
  }

  removeByPrefix(prefix: string): void {
    const ids: string[] = [];
    this.nodes.forEach(function (_n, id) { if (id.indexOf(prefix) === 0) ids.push(id); });
    ids.forEach((id) => this.removeNode(id));
  }

  dist(a: string, b: string): number {
    const A = this.get(a), B = this.get(b); return Math.hypot(A.x - B.x, A.z - B.z);
  }

  /** A*: from → to düğüm kimlikleri listesi (baş ve son dahil); yoksa null. blocked kümesindeki düğümler (hedef hariç) geçilmez. */
  findPath(from: string, to: string, blocked?: Set<string>): string[] | null {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return null;
    if (from === to) return [from];
    const g = new Map<string, number>([[from, 0]]);
    const prev = new Map<string, string>();
    const open = new Set<string>([from]);
    const h = function (this: NavGraph, id: string): number { return this.dist(id, to); }.bind(this);
    while (open.size) {
      let cur = '', best = Infinity;
      open.forEach(function (id) { const f = (g.get(id) as number) + h(id); if (f < best) { best = f; cur = id; } });
      if (cur === to) {
        const out = [to]; let c = to;
        while (prev.has(c)) { c = prev.get(c) as string; out.push(c); }
        return out.reverse();
      }
      open.delete(cur);
      const cn = this.get(cur);
      for (let i = 0; i < cn.neighbors.length; i++) {
        const nb = cn.neighbors[i];
        if (blocked && blocked.has(nb) && nb !== to) continue;
        const ng = (g.get(cur) as number) + this.dist(cur, nb);
        if (ng < (g.has(nb) ? (g.get(nb) as number) : Infinity)) { g.set(nb, ng); prev.set(nb, cur); open.add(nb); }
      }
    }
    return null;
  }

  pathLength(path: string[]): number {
    let s = 0; for (let i = 1; i < path.length; i++) s += this.dist(path[i - 1], path[i]); return s;
  }
}

/** düğüm rezervasyonları: bir düğümü aynı anda tek robot tutabilir (kapı, koltuk, bekleme noktası) */
export class Traffic {
  private readonly holders = new Map<string, string>();

  holderOf(node: string): string | undefined { return this.holders.get(node); }
  isFreeFor(node: string, who: string): boolean { const h = this.holders.get(node); return h === undefined || h === who; }
  tryReserve(node: string, who: string): boolean {
    if (!this.isFreeFor(node, who)) return false;
    this.holders.set(node, who); return true;
  }
  release(node: string, who: string): void { if (this.holders.get(node) === who) this.holders.delete(node); }
  releaseAll(who: string): void {
    const mine: string[] = [];
    this.holders.forEach(function (h, n) { if (h === who) mine.push(n); });
    mine.forEach((n) => { this.holders.delete(n); });
  }
  /** başkalarının tuttuğu düğümler */
  occupiedBy(except: string): Set<string> {
    const s = new Set<string>();
    this.holders.forEach(function (h, n) { if (h !== except) s.add(n); });
    return s;
  }
}

export interface NavEvents {
  /** hedefe varıldı */
  onArrive?: (goal: string) => void;
}

export type NavState = 'idle' | 'moving' | 'waiting';

const WAIT_REPLAN_S = 2.5;
const WAIT_YIELD_S = 5;
const YIELD_PAUSE_S = 2.5;

/**
 * Grafik üzerinde yürüyen ajan. Kenar boyunca ilerler (a → b, u: 0..1); bir kenara girerken b'yi rezerve eder,
 * varınca a'yı bırakır. Hedef (koltuk, bekleme noktası) planlama anında rezerve edilir.
 */
export class NavAgent {
  x: number; z: number;
  heading = 0;
  state: NavState = 'idle';
  /** son ulaşılan düğüm (kenar ortasındaysa kenarın başlangıcı) */
  a: string;
  /** gidilen düğüm (kenar ortasında) */
  b: string | null = null;
  u = 0;
  speed = 1.3;
  goal: string | null = null;
  private path: string[] = [];
  private idx = 0;
  private waitT = 0;
  private yieldUntil = 0;
  private clockT = 0;
  private finalGoal: string | null = null;
  events: NavEvents = {};

  constructor(readonly id: string, private readonly graph: NavGraph, private readonly traffic: Traffic, start: string) {
    const n = graph.get(start);
    this.a = start; this.x = n.x; this.z = n.z;
    traffic.tryReserve(start, id);
  }

  /** kenar türü (oturma/kalkma geçişi için) */
  get edgeKind(): EdgeKind { return this.b ? this.graph.edgeKind(this.a, this.b) : 'walk'; }
  get atNode(): string | null { return this.b ? null : this.a; }

  /** hedefi (varsa rezerve ederek) planlar. Rezerve edilemezse false. */
  goTo(goal: string): boolean {
    if (!this.graph.has(goal)) return false;
    if (this.goal && this.goal !== goal && this.goal !== this.a && this.goal !== this.b) this.traffic.release(this.goal, this.id); // bulunduğu düğümün rezervasyonu asla bırakılmaz
    if (goal !== this.a && !this.traffic.tryReserve(goal, this.id)) return false;
    this.goal = goal; this.finalGoal = goal; this.waitT = 0;
    return this.plan();
  }

  /** hedefi bırakır, mevcut düğümde durur */
  stop(): void {
    if (this.goal && this.goal !== this.a && this.goal !== this.b) this.traffic.release(this.goal, this.id);
    this.goal = null; this.finalGoal = null; this.path = []; this.idx = 0;
    if (!this.b) this.state = 'idle';
  }

  /** ajan sahneden kaldırılırken tüm rezervasyonları bırakır */
  dispose(): void { this.traffic.releaseAll(this.id); this.goal = null; this.path = []; }

  private plan(avoid?: Set<string>): boolean {
    if (!this.goal) return false;
    if (this.b) { // kenar ortasında: ileri (b) ya da geri (a) yönünden daha kısa olanı seç
      const len = this.graph.dist(this.a, this.b);
      const viaB = this.graph.findPath(this.b, this.goal, avoid), viaA = this.graph.findPath(this.a, this.goal, avoid);
      const cb = viaB ? (1 - this.u) * len + this.graph.pathLength(viaB) : Infinity;
      const ca = viaA ? this.u * len + this.graph.pathLength(viaA) : Infinity;
      if (cb === Infinity && ca === Infinity) return false;
      if (ca < cb) { const t = this.a; this.a = this.b; this.b = t; this.u = 1 - this.u; this.path = [this.a].concat(viaA as string[]); this.idx = 0; }
      else { this.path = [this.a].concat(viaB as string[]); this.idx = 0; }
      // path[0] = geçerli kenarın başı, path[1] = b; varınca idx++ ile devam edilir
      this.state = 'moving';
      return true;
    }
    const p = this.graph.findPath(this.a, this.goal, avoid);
    if (!p) return false;
    this.path = p; this.idx = 0;
    if (p.length === 1) { this.finish(); return true; }
    this.state = 'moving';
    return true;
  }

  private finish(): void {
    this.state = 'idle'; const g = this.goal; this.path = []; this.idx = 0;
    if (g && this.events.onArrive) this.events.onArrive(g);
  }

  update(dt: number): void {
    this.clockT += dt;
    if (this.state === 'idle' || !this.goal) return;
    // grafikten düğüm silindiyse yeniden planla
    if (this.b && !this.graph.has(this.b)) { this.replanFromScratch(); return; }
    if (!this.graph.has(this.a)) { this.replanFromScratch(); return; }

    if (!this.b) {
      const nextId = this.path[this.idx + 1];
      if (nextId === undefined) { this.finish(); return; }
      if (!this.graph.has(nextId)) { this.plan(); return; }
      if (this.yieldUntil > this.clockT) return;
      if (!this.traffic.tryReserve(nextId, this.id)) {
        this.state = 'waiting'; this.waitT += dt;
        if (this.waitT > WAIT_REPLAN_S) {
          const avoid = this.traffic.occupiedBy(this.id);
          const alt = this.goal ? this.graph.findPath(this.a, this.goal, avoid) : null;
          if (alt && alt.length > 1 && alt[1] !== nextId) { this.path = alt; this.idx = 0; this.waitT = 0; return; }
        }
        if (this.waitT > WAIT_YIELD_S) this.yieldAside(nextId);
        return;
      }
      this.waitT = 0; this.state = 'moving';
      this.b = nextId; this.u = 0;
    }

    const A = this.graph.get(this.a), B = this.graph.get(this.b as string);
    const len = Math.max(0.0001, Math.hypot(B.x - A.x, B.z - A.z));
    this.u = Math.min(1, this.u + (this.speed * dt) / len);
    this.x = A.x + (B.x - A.x) * this.u; this.z = A.z + (B.z - A.z) * this.u;
    this.heading = Math.atan2(B.x - A.x, B.z - A.z);
    if (this.u >= 1) {
      const prev = this.a;
      this.a = this.b as string; this.b = null; this.u = 0; this.idx++;
      this.x = B.x; this.z = B.z;
      this.traffic.release(prev, this.id);
      if (this.a === this.goal || this.idx >= this.path.length - 1) this.finish();
    }
  }

  private replanFromScratch(): void {
    // düğüm kaybı: en yakın geçerli düğüme kadar bekle (basitçe mevcut konumdan hedefe)
    if (this.b && !this.graph.has(this.b)) { this.b = null; this.u = 0; }
    if (!this.graph.has(this.a)) { this.state = 'idle'; this.goal = null; return; }
    if (!this.plan()) { this.state = 'waiting'; }
  }

  /** uzun süre bloklanınca boş bir komşuya çekilip yol verir, sonra yeniden dener */
  private yieldAside(blockedBy: string): void {
    const n = this.graph.get(this.a);
    let best = '', bd = -1;
    for (let i = 0; i < n.neighbors.length; i++) {
      const nb = n.neighbors[i];
      if (nb === blockedBy || !this.traffic.isFreeFor(nb, this.id)) continue;
      const d = this.graph.dist(nb, blockedBy);
      if (d > bd) { bd = d; best = nb; }
    }
    this.waitT = 0;
    if (!best) return;
    this.traffic.tryReserve(best, this.id);
    this.path = [this.a, best]; this.idx = 0; this.state = 'moving';
    this.yieldUntil = this.clockT + 0.1;
    // geçici hedef: komşuya varınca asıl hedef yeniden planlanır
    const finalGoal = this.finalGoal;
    const prevArrive = this.events.onArrive;
    const self = this;
    this.events.onArrive = function () {
      self.events.onArrive = prevArrive;
      self.goal = finalGoal; self.yieldUntil = self.clockT + YIELD_PAUSE_S;
      if (finalGoal) { self.state = 'moving'; self.plan(); }
    };
    // asıl hedefi koruyarak, geçici hedefi dahili olarak işaretle
    this.goal = best;
  }
}

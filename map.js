// 世界大富翁：新地圖（27 格）與走位規則。瀏覽器與 Node 皆可使用。
// 座標 (x,y)：x 向右、y 向上，(0,0) 為起點。
(function () {
  const REGIONS = {
    africa:  { name: '非洲',   color: '#f3dfb5' },
    oceania: { name: '大洋洲', color: '#cde6fb' },
    asia:    { name: '亞洲',   color: '#f6c9c9' },
    america: { name: '美洲',   color: '#cfeccf' },
    europe:  { name: '歐洲',   color: '#e0d4f5' },
  };
  const GEMS = {
    ruby:     { name: '紅寶石', color: '#e0314b' },
    sapphire: { name: '藍寶石', color: '#2f5fd0' },
    emerald:  { name: '綠寶石', color: '#1fa971' },
    topaz:    { name: '黃寶石', color: '#f2c200' }, // 非地名，之後有用處
  };
  // 地價 ≤2000、末位 0 或 50、且每格不重複；過路費 = 地價的 10%
  const L = (name, x, y, region, price) => ({ name, x, y, type: 'land', region, price, toll: Math.round(price / 10) });
  const S = (x, y) => ({ name: '股市', x, y, type: 'stock' });
  const G = (gem, x, y, region) => ({ name: GEMS[gem].name, x, y, type: 'gem', gem, region: null }); // 所有寶石格的標籤一律顯示「特殊」
  const START = { name: '起點', x: 0, y: 0, type: 'start' };

  // 外圈 22 格，順時針（左上角開始）。首尾相接成環。
  const RING = [
    L('印度', -3, 3, 'asia', 1350), L('中國', -2, 3, 'asia', 1650), L('日本', -1, 3, 'asia', 1900),
    S(0, 3),
    L('澳洲', 1, 3, 'oceania', 1800), L('斐濟', 2, 3, 'oceania', 1100), L('帛琉', 3, 3, 'oceania', 700),
    G('topaz', 3, 2, null), L('紐西蘭', 3, 1, 'oceania', 1550),
    L('義大利', 3, -1, 'europe', 1500), G('emerald', 3, -2, 'europe'), L('德國', 3, -3, 'europe', 1750),
    L('法國', 2, -3, 'europe', 1600), L('英國', 1, -3, 'europe', 1850),
    S(0, -3),
    L('美國', -1, -3, 'america', 2000), L('墨西哥', -2, -3, 'america', 1150), L('巴西', -3, -3, 'america', 1300),
    G('sapphire', -3, -2, 'america'), L('加拿大', -3, -1, 'america', 1450),
    L('泰國', -3, 1, 'asia', 1000), G('ruby', -3, 2, 'asia'),
  ];
  // 中線 5 格，由左到右
  const CENTER = [
    L('南非', -2, 0, 'africa', 1250), L('奈及利亞', -1, 0, 'africa', 950),
    START,
    L('埃及', 1, 0, 'africa', 1400), L('肯亞', 2, 0, 'africa', 850),
  ];

  const TILES = [START, ...RING, ...CENTER.filter((t) => t !== START)].map((t, id) => ({ id, ...t }));
  const key = (x, y) => x + ',' + y;
  const BY = {};
  TILES.forEach((t) => (BY[key(t.x, t.y)] = t.id));
  const at = (x, y) => BY[key(x, y)];

  const ADJ = TILES.map(() => []);
  const link = (a, b) => {
    if (a === undefined || b === undefined || ADJ[a].includes(b)) return;
    ADJ[a].push(b); ADJ[b].push(a);
  };
  RING.forEach((t, i) => link(at(t.x, t.y), at(RING[(i + 1) % RING.length].x, RING[(i + 1) % RING.length].y)));
  CENTER.forEach((t, i) => i && link(at(CENTER[i - 1].x, CENTER[i - 1].y), at(t.x, t.y)));
  // 中線兩端各接到外圈的兩個岔路點
  [[-2, 0, -3, 1], [-2, 0, -3, -1], [2, 0, 3, 1], [2, 0, 3, -1]].forEach(([a, b, c, d]) => link(at(a, b), at(c, d)));

  // 兩個「三角岔路」：(南非,泰國,加拿大) 與 (肯亞,紐西蘭,義大利)。
  // 每個三角形的格子各有一條對外的「主幹」。
  //  - 從主幹進入某格：可選往另外兩格之一。
  //  - 從三角形內的另一格進入：視為已選定方向，只能走這格的主幹（不能再轉向第三格）。
  const nameId = (n) => TILES.find((t) => t.name === n).id;
  const TRIS = [['南非', '泰國', '加拿大'], ['肯亞', '紐西蘭', '義大利']].map((g) => g.map(nameId));

  // 從 pos 出發的可選方向。prev = 上一格（來向）。
  // atTurnStart 且在起點：左右皆可選；其餘情況不可回頭。
  function options(pos, prev, atTurnStart) {
    if (TILES[pos].type === 'start' && atTurnStart) return ADJ[pos].slice();
    const tri = TRIS.find((g) => g.includes(pos));
    if (tri) {
      const stem = ADJ[pos].find((n) => !tri.includes(n));
      return tri.includes(prev) ? [stem] : tri.filter((n) => n !== pos);
    }
    return ADJ[pos].filter((n) => n !== prev);
  }

  // ---- 經濟規則 ----
  const LEVELS = ['E', 'D', 'C', 'B', 'A', 'S'];
  const LEVEL_NAMES = ['平地', '樓房', '公寓', '大樓', '住宅區', '商業區'];
  const STOCK_REF = 225;                       // 股價基準（初始 150~300 的中間值）
  const TOLL_MULT = [3, 9, 30, 90, 150, 300]; // 各等級 E,D,C,B,A,S 的過路費倍率（標準股價下，A 級：最便宜的地 10500、最貴的地 30000）
  const UP_RATE = [0.30, 0.40, 0.55, 0.75, 1.00]; // 升到下一級的費用 = 地價 × 此比率
  const r10 = (n) => Math.max(10, Math.round(n / 10) * 10);
  // 過路費 = 地價 10% × 等級倍率 × (該區股價 / 基準)
  const tollOf = (t, lv, sp) => r10(t.price * 0.1 * TOLL_MULT[lv] * sp / STOCK_REF);
  // 升級費 = 地價 × 等級比率 × (該區股價 / 基準)
  const upCost = (t, lv, sp) => r10(t.price * UP_RATE[lv] * sp / STOCK_REF);
  const GEM_KEYS = Object.keys(GEMS);
  const gemBonus = (level) => 3000 * level;     // 集滿四寶石經過起點的獎金（玩家等級從 1 開始）
  const WIN_ASSETS = 200000;
  const BUYOUT_MULT = 5;                        // 強制併購 = 原始地價 × 5
  const BUYOUT_MAX_LV = 0;                      // 僅限等級 E(0) 的土地可被強制併購
  // 股價隨行為浮動的幅度（比例）
  const IMPACT = { buyLand: 0.02, upgrade: 0.015, sellLand: 0.05, buyout: 0.02, toll: 0.02, perShare: 0.0005 };

  const MAP = { REGIONS, GEMS, TILES, ADJ, TRIS, at, options, LEVELS, LEVEL_NAMES, STOCK_REF, tollOf, upCost, GEM_KEYS, gemBonus, WIN_ASSETS, BUYOUT_MULT, BUYOUT_MAX_LV, IMPACT };
  if (typeof module !== 'undefined') module.exports = MAP;
  else window.MAP = MAP;
})();

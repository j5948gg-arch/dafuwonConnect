// 世界大富翁：地圖（可選擇）與走位規則。瀏覽器與 Node 皆可使用。
// 座標 (x,y)：x 向右、y 向上。每張地圖定義在 DEFS：tiles（第一格必須是起點）、links（相鄰格子的座標配對）、tris（三角岔路，可省略）、
// bounds（格子座標的範圍，畫面用來置中）、panels（股價圖／持股表放哪：'center'＝地圖中間空白處、'below'＝棋盤下方）。
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
  const BL = (name, x, y, icon, sub) => ({ name, x, y, type: 'blank', icon, sub });   // 空格（之後再加特殊玩法）：目前踩到沒有任何效果
  const START = (x, y) => ({ name: '起點', x, y, type: 'start' });

  // ======== 地圖一：經典（27 格） ========
  const RING = [
    L('印度', -3, 3, 'asia', 1400), L('中國', -2, 3, 'asia', 1650), L('日本', -1, 3, 'asia', 1900),
    S(0, 3),
    L('澳洲', 1, 3, 'oceania', 1800), L('斐濟', 2, 3, 'oceania', 1550), L('帛琉', 3, 3, 'oceania', 1700),
    G('topaz', 3, 2, null), L('紐西蘭', 3, 1, 'oceania', 1550),
    L('義大利', 3, -1, 'europe', 1500), G('emerald', 3, -2, 'europe'), L('德國', 3, -3, 'europe', 1750),
    L('法國', 2, -3, 'europe', 1600), L('英國', 1, -3, 'europe', 1850),
    S(0, -3),
    L('美國', -1, -3, 'america', 2000), L('墨西哥', -2, -3, 'america', 1350), L('巴西', -3, -3, 'america', 1300),
    G('sapphire', -3, -2, 'america'), L('加拿大', -3, -1, 'america', 1450),
    L('泰國', -3, 1, 'asia', 1950), G('ruby', -3, 2, 'asia'),
  ];
  const CENTER = [
    L('南非', -2, 0, 'africa', 1250), L('奈及利亞', -1, 0, 'africa', 1400),
    START(0, 0),
    L('埃及', 1, 0, 'africa', 1800), L('肯亞', 2, 0, 'africa', 1450),
  ];
  const CLASSIC = {
    id: 'classic', name: '經典', desc: '27 格：外圈加一條中線，兩端是三角岔路', bounds: { x0: -3, x1: 3, y0: -3, y1: 3 }, panels: 'center',
    tiles: [CENTER[2], ...RING, ...CENTER.filter((t) => t.type !== 'start')],
    links: [
      ...RING.map((t, i) => [t.x, t.y, RING[(i + 1) % RING.length].x, RING[(i + 1) % RING.length].y]),
      ...CENTER.slice(1).map((t, i) => [CENTER[i].x, CENTER[i].y, t.x, t.y]),
      // 中線兩端各接到外圈的兩個岔路點
      [-2, 0, -3, 1], [-2, 0, -3, -1], [2, 0, 3, 1], [2, 0, 3, -1],
    ],
    // 兩個「三角岔路」：(南非,泰國,加拿大) 與 (肯亞,紐西蘭,義大利)。每個三角形的格子各有一條對外的「主幹」。
    //  - 從主幹進入某格：可選往另外兩格之一。
    //  - 從三角形內的另一格進入：視為已選定方向，只能走這格的主幹（不能再轉向第三格）。
    tris: [['南非', '泰國', '加拿大'], ['肯亞', '紐西蘭', '義大利']],
  };

  // ======== 地圖二：愛心（29 格） ========
  // 9×9 方格圖（欄 0~8、列 0~8，列 0 在最上面；程式內 y = 8 − 列）。
  //   外圈 24 格：沿愛心輪廓繞一圈（起點在上方凹口）；中線 5 格：由起點一路連到下方的股市。
  //   起點與股市各有三個方向（外圈兩側＋中線），走到那裡要選方向。樂透、休：目前是空格，之後再加玩法。
  const hy = (row) => 8 - row;
  const H_ = (col, row) => [col, hy(row)];
  const HEART_RING = [
    L('帛琉', 3, hy(1), 'oceania', 1700), L('紐西蘭', 2, hy(0), 'oceania', 1550), L('斐濟', 1, hy(1), 'oceania', 1550),
    G('ruby', 1, hy(2), null), L('澳洲', 0, hy(2), 'oceania', 1800),
    BL('樂透', 0, hy(3), '🎟️', '尚無效果'), L('埃及', 0, hy(4), 'africa', 1800),
    G('emerald', 1, hy(5), null), L('肯亞', 1, hy(6), 'africa', 1450),
    L('奈及利亞', 2, hy(7), 'africa', 1400), L('南非', 3, hy(8), 'africa', 1250),
    S(4, hy(8)),
    L('美國', 5, hy(8), 'america', 2000), L('墨西哥', 6, hy(7), 'america', 1350), L('加拿大', 7, hy(6), 'america', 1450),
    G('topaz', 7, hy(5), null), L('巴西', 8, hy(4), 'america', 1300),
    BL('樂透', 8, hy(3), '🎟️', '尚無效果'), L('泰國', 8, hy(2), 'asia', 1950),
    G('sapphire', 7, hy(2), null), L('印度', 7, hy(1), 'asia', 1400),
    L('日本', 6, hy(0), 'asia', 1900), L('中國', 5, hy(1), 'asia', 1650),
  ];
  const HEART_MID = [
    L('英國', 4, hy(3), 'europe', 1850), L('法國', 4, hy(4), 'europe', 1600), BL('休', 4, hy(5), '💤', '尚無效果'),
    L('德國', 4, hy(6), 'europe', 1750), L('義大利', 4, hy(7), 'europe', 1500),
  ];
  const HEART_START = START(4, hy(2));
  // 順序：起點 → 外圈（由帛琉起順時針…依上面列的順序，最後回到中國再接起點）→ 中線
  const HEART_LOOP = [HEART_START, ...HEART_RING];   // 外圈首尾相接成環：…中國 → 起點 → 帛琉 → 紐西蘭…
  const HEART = {
    id: 'heart', name: '愛心', desc: '29 格：愛心外圈＋中線；起點與股市各有三岔口；含樂透、休（暫無效果）', bounds: { x0: 0, x1: 8, y0: 0, y1: 8 }, panels: 'below',
    tiles: [HEART_START, ...HEART_RING, ...HEART_MID],
    links: [
      ...HEART_LOOP.map((t, i) => [t.x, t.y, HEART_LOOP[(i + 1) % HEART_LOOP.length].x, HEART_LOOP[(i + 1) % HEART_LOOP.length].y]),
      [4, hy(2), 4, hy(3)], ...HEART_MID.slice(1).map((t, i) => [HEART_MID[i].x, HEART_MID[i].y, t.x, t.y]), [4, hy(7), 4, hy(8)],   // 中線：起點 → 英國 → 法國 → 休 → 德國 → 義大利 → 股市
    ],
    tris: [],
  };
  const DEFS = { classic: CLASSIC, heart: HEART };

  // ---- 台灣地名版：就地改地區名稱與土地名稱（依各區土地在地圖定義中的順序對應）----
  const TW = {
    regions: { africa: '台北市', oceania: '新北市', asia: '台南市', america: '高雄市', europe: '台中市' },
    lands: {
      africa:  ['士林區', '大安區', '萬華區', '信義區'],
      america: ['左營區', '鼓山區', '苓雅區', '旗津區'],
      asia:    ['白河區', '安平區', '永康區', '玉井區'],
      europe:  ['北屯區', '西屯區', '沙鹿區', '清水區'],
      oceania: ['板橋區', '淡水區', '土城區', '新店區'],
    },
  };
  const TILES = [], ADJ = [], TRIS = [], BY = {};   // 換地圖時就地更新內容（引擎只保存這幾個陣列的參照）
  const ORIGR = Object.fromEntries(Object.keys(REGIONS).map((r) => [r, REGIONS[r].name]));
  let ORIG = { tiles: [] };
  function setLocale(tw) {
    Object.keys(REGIONS).forEach((r) => (REGIONS[r].name = tw ? TW.regions[r] : ORIGR[r]));
    const cnt = {};
    TILES.forEach((t) => { if (t.type === 'land') { const k = (cnt[t.region] = (cnt[t.region] || 0) + 1) - 1; t.name = tw ? TW.lands[t.region][k] : ORIG.tiles[t.id]; } });
  }
  const key = (x, y) => x + ',' + y;
  const at = (x, y) => BY[key(x, y)];
  const link = (a, b) => {
    if (a === undefined || b === undefined || a === b || ADJ[a].includes(b)) return;
    ADJ[a].push(b); ADJ[b].push(a);
  };
  const nameId = (n) => TILES.find((t) => t.name === n).id;
  function use(id) {
    const d = DEFS[id] || CLASSIC;
    TILES.length = 0; d.tiles.forEach((t, i) => TILES.push({ ...t, id: i }));
    Object.keys(BY).forEach((k) => delete BY[k]); TILES.forEach((t) => (BY[key(t.x, t.y)] = t.id));
    ADJ.length = 0; TILES.forEach(() => ADJ.push([]));
    d.links.forEach(([x1, y1, x2, y2]) => link(at(x1, y1), at(x2, y2)));
    TRIS.length = 0; (d.tris || []).forEach((g) => TRIS.push(g.map(nameId)));
    ORIG = { tiles: TILES.map((t) => t.name) };
    MAP.id = d.id; MAP.B = d.bounds; MAP.panels = d.panels;
  }

  // 從 pos 出發的可選方向。prev = 上一格（來向）。
  // atTurnStart 且在起點：所有方向皆可選；其餘情況不可回頭。三角岔路（若有）見上面的說明。
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
  const TOLL_MULT = [3, 9, 30, 80, 150, 250]; // 各等級 E,D,C,B,A,S 的過路費倍率（標準股價下，A 級：最便宜的地 10500、最貴的地 30000）
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
  const PIC_NAMES = ['翼龍', '血眼怪', '食人花', '鯊魚人', '雞蛇獸', '老鼠', '史萊姆', '紫蛇', '白狼', '風精靈', '法老守衛', '火焰精靈']; // 對應 img/p0.png ~ p11.png
  const PALETTE = [{ n: '紅', c: '#e74c3c' }, { n: '藍', c: '#3498db' }, { n: '綠', c: '#2ecc71' }, { n: '黃', c: '#e6a800' },
    { n: '紫', c: '#8e44ad' }, { n: '粉', c: '#ff7eb6' }, { n: '橘', c: '#f26d1b' }, { n: '棕', c: '#8d5524' }]; // 玩家代表色（房間內不可重複）
  const PIC_VER = 3;                            // 換圖時把這個數字加 1，瀏覽器就會重新下載
  const BUYOUT_MAX_LV = 0;                      // 僅限等級 E(0) 的土地可被強制併購
  // 股價隨行為浮動的幅度（比例）
  const IMPACT = { buyLand: 0.02, upgrade: 0.015, sellLand: 0.05, buyout: 0.02, toll: 0.02, perShare: 0.0005 };

  const MAP = { id: '', B: null, panels: 'center', LIST: Object.values(DEFS).map((d) => ({ id: d.id, name: d.name, desc: d.desc })), use, setLocale, TW, REGIONS, GEMS, TILES, ADJ, TRIS, at, options, LEVELS, LEVEL_NAMES, STOCK_REF, tollOf, upCost, GEM_KEYS, gemBonus, WIN_ASSETS, BUYOUT_MULT, BUYOUT_MAX_LV, IMPACT, PIC_NAMES, PIC_VER, PALETTE };
  use(typeof __MAPID === 'string' ? __MAPID : 'classic');   // 伺服器為每一局指定地圖（__MAPID）；瀏覽器預設經典，進房間後依房間設定切換
  if (typeof module !== 'undefined') module.exports = MAP;
  else window.MAP = MAP;
})();

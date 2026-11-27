// 世界大富翁：地圖（可選擇）與走位規則。瀏覽器與 Node 皆可使用。
// 座標 (x,y)：x 向右、y 向上。每張地圖定義在 DEFS：tiles（第一格必須是起點）、links（相鄰格子的座標配對）、tris（三角岔路，可省略）、
// bounds（格子座標的範圍，畫面用來置中）。（panels 欄位已不使用：股價圖與持有數改放在畫面右下角的資訊區，可切換。）
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
  const FATE = (x, y) => ({ name: '命運', x, y, type: 'fate', icon: '🔮', sub: '隨機發生牌效果' });   // 命運格：停下就從 49 張牌隨機發生一張的效果（不翻牌、可重複；規則見 engine.js 的 fate()）
  const START = (x, y) => ({ name: '起點', x, y, type: 'start' });
  const LOT = (x, y) => ({ name: '樂透', x, y, type: 'lotto', icon: '🎟️', sub: '每號 500 元' });   // 樂透格：停下可選號（規則見 engine.js 的樂透區）
  const REST = (x, y) => ({ name: '休', x, y, type: 'rest', icon: '💤', sub: '停留免收過路費' });  // 休息格：停在這格期間，自己的土地別人踩到免付過路費

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
  //   起點與股市各有三個方向（外圈兩側＋中線），走到那裡要選方向。樂透、休：見 engine.js 的規則說明。
  const hy = (row) => 8 - row;
  const H_ = (col, row) => [col, hy(row)];
  const HEART_RING = [
    L('帛琉', 3, hy(1), 'oceania', 1700), L('紐西蘭', 2, hy(0), 'oceania', 1550), L('斐濟', 1, hy(1), 'oceania', 1550),
    G('ruby', 1, hy(2), null), L('澳洲', 0, hy(2), 'oceania', 1800),
    LOT(0, hy(3)), L('埃及', 0, hy(4), 'africa', 1800),
    G('emerald', 1, hy(5), null), L('肯亞', 1, hy(6), 'africa', 1450),
    L('奈及利亞', 2, hy(7), 'africa', 1400), L('南非', 3, hy(8), 'africa', 1250),
    S(4, hy(8)),
    L('美國', 5, hy(8), 'america', 2000), L('墨西哥', 6, hy(7), 'america', 1350), L('加拿大', 7, hy(6), 'america', 1450),
    G('topaz', 7, hy(5), null), L('巴西', 8, hy(4), 'america', 1300),
    LOT(8, hy(3)), L('泰國', 8, hy(2), 'asia', 1950),
    G('sapphire', 7, hy(2), null), L('印度', 7, hy(1), 'asia', 1400),
    L('日本', 6, hy(0), 'asia', 1900), L('中國', 5, hy(1), 'asia', 1650),
  ];
  const HEART_MID = [
    L('英國', 4, hy(3), 'europe', 1850), L('法國', 4, hy(4), 'europe', 1600), REST(4, hy(5)),
    L('德國', 4, hy(6), 'europe', 1750), L('義大利', 4, hy(7), 'europe', 1500),
  ];
  const HEART_START = START(4, hy(2));
  // 順序：起點 → 外圈（由帛琉起順時針…依上面列的順序，最後回到中國再接起點）→ 中線
  const HEART_LOOP = [HEART_START, ...HEART_RING];   // 外圈首尾相接成環：…中國 → 起點 → 帛琉 → 紐西蘭…
  const HEART = {
    id: 'heart', name: '愛心', desc: '29 格：愛心外圈＋中線；起點與股市各有三岔口；含樂透（1–49 號共用、每 10 輪開獎）與休（停留時己地免過路費）', bounds: { x0: 0, x1: 8, y0: 0, y1: 8 }, panels: 'heart',
    tiles: [HEART_START, ...HEART_RING, ...HEART_MID],
    links: [
      ...HEART_LOOP.map((t, i) => [t.x, t.y, HEART_LOOP[(i + 1) % HEART_LOOP.length].x, HEART_LOOP[(i + 1) % HEART_LOOP.length].y]),
      [4, hy(2), 4, hy(3)], ...HEART_MID.slice(1).map((t, i) => [HEART_MID[i].x, HEART_MID[i].y, t.x, t.y]), [4, hy(7), 4, hy(8)],   // 中線：起點 → 英國 → 法國 → 休 → 德國 → 義大利 → 股市
    ],
    tris: [],
  };

  // ======== 地圖三：箭矢（29 格） ========
  // 8×7 方格圖（欄 0~7、列 0~6，列 0 在最上面；程式內 y = 6 − 列）。起點在中間，連出左右兩個迴圈：
  //   左邊是箭尾（12 格含起點、含休），右邊是箭頭（18 格含起點、含股市與兩個樂透）。起點有四個方向（走到那裡要選方向）。
  const ay = (row) => 6 - row;
  const AR_START = START(3, ay(3));
  const AR_TAIL = [   // 箭尾：起點 → 帛琉 → 紐西蘭 → 寶石 → 斐濟 → 澳洲 → 休（在第 1 欄） → 美國 → 墨西哥 → 寶石 → 巴西 → 加拿大 → 回起點
    L('帛琉', 2, ay(2), 'oceania', 1700), L('紐西蘭', 2, ay(1), 'oceania', 1550), G('ruby', 1, ay(1), null),
    L('斐濟', 0, ay(1), 'oceania', 1550), L('澳洲', 0, ay(2), 'oceania', 1800),
    REST(1, ay(3)),   // 休往右挪一格，與帛琉、澳洲、加拿大、美國相連（見下方 links）
    L('美國', 0, ay(4), 'america', 2000), L('墨西哥', 0, ay(5), 'america', 1350), G('sapphire', 1, ay(5), null),
    L('巴西', 2, ay(5), 'america', 1300), L('加拿大', 2, ay(4), 'america', 1450),
  ];
  const AR_HEAD = [   // 箭頭：起點 → 中國 → 日本 → 寶石 → 印度 → 泰國 → 樂透 → 英國 → 法國 → 股市 → 德國 → 義大利 → 樂透 → 南非 → 埃及 → 寶石 → 肯亞 → 奈及利亞 → 回起點
    L('中國', 4, ay(2), 'asia', 1650), L('日本', 4, ay(1), 'asia', 1900), G('emerald', 5, ay(1), null),
    L('印度', 5, ay(0), 'asia', 1400), L('泰國', 6, ay(0), 'asia', 1950), LOT(7, ay(0)),
    L('英國', 7, ay(1), 'europe', 1850), L('法國', 7, ay(2), 'europe', 1600),
    S(6, ay(3)),
    L('德國', 7, ay(4), 'europe', 1750), L('義大利', 7, ay(5), 'europe', 1500), LOT(7, ay(6)),
    L('南非', 6, ay(6), 'africa', 1250), L('埃及', 5, ay(6), 'africa', 1800), G('topaz', 5, ay(5), null),
    L('肯亞', 4, ay(5), 'africa', 1450), L('奈及利亞', 4, ay(4), 'africa', 1400),
  ];
  const loopLinks = (a) => a.map((t, i) => [t.x, t.y, a[(i + 1) % a.length].x, a[(i + 1) % a.length].y]);
  const ARROW = {
    id: 'arrow', name: '箭矢', desc: '29 格：起點在中間，左邊是箭尾、右邊是箭頭，兩個迴圈相連；起點有四個方向，含兩個樂透、休、股市', bounds: { x0: 0, x1: 7, y0: 0, y1: 6 }, panels: 'center',
    tiles: [AR_START, ...AR_TAIL, ...AR_HEAD],
    links: [...loopLinks([AR_START, ...AR_TAIL]), ...loopLinks([AR_START, ...AR_HEAD]),
      [1, ay(3), 2, ay(2)], [1, ay(3), 2, ay(4)],   // 休 ↔ 帛琉、加拿大（休 ↔ 澳洲、美國 已在外圈順序裡）
      [7, ay(2), 7, ay(4)],                          // 法國 ↔ 德國（另外保留各自與股市的連線）
    ],
    tris: [],
  };

  // ======== 地圖四：子彈（30 格） ========
  // 7×7 方格圖（欄 0~6、列 0~6，列 0 在最上面；程式內 y = 6 − 列）。上下對稱，有「上、下兩個起點」。
  //   左半：外弧（奈及利亞→肯亞→寶石→命運→寶石→中國→日本）＋中線（起點→美國→墨西哥→休→加拿大→巴西→起點）圍成左迴圈。
  //   上、下兩條橫線各貫穿到右邊角落：奈及利亞→起點→埃及→南非→斐濟→寶石（上）、日本→起點→印度→泰國→英國→寶石（下）。
  //   右半（彈頭）：上角寶石→紐西蘭→帛琉→澳洲→樂透（尖端），下角寶石→義大利→德國→法國→樂透；中間橫線：休→股市→樂透。
  //   命運格：停下時從 49 張牌隨機發生一張的效果（顯示圖卡、確認後執行；規則見 engine.js 的 fate()）。
  const uy = (row) => 6 - row;
  const BU_START = START(2, uy(0));            // 上方起點（編號 0：玩家出生點）
  const BU_TILES = [
    L('奈及利亞', 1, uy(0), 'africa', 1400), BU_START, L('埃及', 3, uy(0), 'africa', 1800), L('南非', 4, uy(0), 'africa', 1250), L('斐濟', 5, uy(0), 'oceania', 1550), G('ruby', 6, uy(0), null),
    L('肯亞', 0, uy(1), 'africa', 1450), L('美國', 2, uy(1), 'america', 2000), L('紐西蘭', 6, uy(1), 'oceania', 1550),
    G('emerald', 0, uy(2), null), L('墨西哥', 2, uy(2), 'america', 1350), L('澳洲', 5, uy(2), 'oceania', 1800), L('帛琉', 6, uy(2), 'oceania', 1700),
    FATE(0, uy(3)), REST(2, uy(3)), S(3, uy(3)), LOT(4, uy(3)),
    G('sapphire', 0, uy(4), null), L('加拿大', 2, uy(4), 'america', 1450), L('法國', 5, uy(4), 'europe', 1600), L('德國', 6, uy(4), 'europe', 1750),
    L('中國', 0, uy(5), 'asia', 1650), L('巴西', 2, uy(5), 'america', 1300), L('義大利', 6, uy(5), 'europe', 1500),
    L('日本', 1, uy(6), 'asia', 1900), START(2, uy(6)), L('印度', 3, uy(6), 'asia', 1400), L('泰國', 4, uy(6), 'asia', 1950), L('英國', 5, uy(6), 'europe', 1850), G('topaz', 6, uy(6), null),
  ];
  const BULLET = {
    id: 'bullet', name: '子彈', desc: '30 格：上下各一個起點，左邊是外弧加中線的迴圈，右邊是彈頭（尖端是樂透）；含樂透、休、股市與命運（隨機發生牌效果）', bounds: { x0: 0, x1: 6, y0: 0, y1: 6 }, panels: 'center',
    tiles: [BU_START, ...BU_TILES.filter((t) => t !== BU_START)],   // 第一格必須是起點
    links: [
      // 上、下兩條橫線（一路連到右邊的角落寶石）
      ...[1, 2, 3, 4, 5].map((x) => [x, uy(0), x + 1, uy(0)]),
      ...[1, 2, 3, 4, 5].map((x) => [x, uy(6), x + 1, uy(6)]),
      // 中線（第 2 欄）：上起點 → 美國 → 墨西哥 → 休 → 加拿大 → 巴西 → 下起點
      ...[0, 1, 2, 3, 4, 5].map((r) => [2, uy(r), 2, uy(r + 1)]),
      // 中間橫線：休 → 股市 → 樂透
      [2, uy(3), 3, uy(3)], [3, uy(3), 4, uy(3)],
      // 左外弧：奈及利亞 → 肯亞 → 寶石 → 命運 → 寶石 → 中國 → 日本
      [1, uy(0), 0, uy(1)], [0, uy(1), 0, uy(2)], [0, uy(2), 0, uy(3)], [0, uy(3), 0, uy(4)], [0, uy(4), 0, uy(5)], [0, uy(5), 1, uy(6)],
      // 右上彈頭：寶石 → 紐西蘭 → 帛琉 → 澳洲 → 樂透
      [6, uy(0), 6, uy(1)], [6, uy(1), 6, uy(2)], [6, uy(2), 5, uy(2)], [5, uy(2), 4, uy(3)],
      // 右下彈頭：寶石 → 義大利 → 德國 → 法國 → 樂透
      [6, uy(6), 6, uy(5)], [6, uy(5), 6, uy(4)], [6, uy(4), 5, uy(4)], [5, uy(4), 4, uy(3)],
    ],
    tris: [],
  };

  // ======== 地圖五：蝴蝶（29 格） ========
  // 7×9 方格圖（欄 0~6、列 0~8，列 0 在最上面；程式內 y = 8 − 列）。起點在正中央，四個翅膀各是一個 6 格的小迴圈：
  //   左上：寶石、南非、奈及利亞、股市、肯亞、埃及；右上：寶石、紐西蘭、澳洲、命運、斐濟、帛琉；
  //   左下：寶石、中國、日本、樂透、泰國、印度；右下：寶石、義大利、英國、休、法國、德國。
  //   身體：起點 ↔ 美國／加拿大／墨西哥／巴西（四個方向），再各連到相鄰翅膀的股市／命運／樂透／休。
  const fy = (row) => 8 - row;
  const BF_START = START(3, fy(4));
  const BF_WING_TL = [L('南非', 1, fy(0), 'africa', 1250), L('奈及利亞', 2, fy(1), 'africa', 1400), S(2, fy(2)), L('肯亞', 1, fy(2), 'africa', 1450), L('埃及', 0, fy(1), 'africa', 1800), G('ruby', 0, fy(0), null)];
  const BF_WING_TR = [L('紐西蘭', 5, fy(0), 'oceania', 1550), L('澳洲', 4, fy(1), 'oceania', 1800), FATE(4, fy(2)), L('斐濟', 5, fy(2), 'oceania', 1550), L('帛琉', 6, fy(1), 'oceania', 1700), G('emerald', 6, fy(0), null)];
  const BF_WING_BL = [L('中國', 1, fy(8), 'asia', 1650), L('日本', 2, fy(7), 'asia', 1900), LOT(2, fy(6)), L('泰國', 1, fy(6), 'asia', 1950), L('印度', 0, fy(7), 'asia', 1400), G('sapphire', 0, fy(8), null)];
  const BF_WING_BR = [L('義大利', 5, fy(8), 'europe', 1500), L('英國', 4, fy(7), 'europe', 1850), REST(4, fy(6)), L('法國', 5, fy(6), 'europe', 1600), L('德國', 6, fy(7), 'europe', 1750), G('topaz', 6, fy(8), null)];
  const BF_BODY = [L('美國', 2, fy(3), 'america', 2000), L('加拿大', 4, fy(3), 'america', 1450), L('墨西哥', 2, fy(5), 'america', 1350), L('巴西', 4, fy(5), 'america', 1300)];
  const BUTTERFLY = {
    id: 'butterfly', name: '蝴蝶', desc: '29 格：起點在正中央，四個翅膀各一個小迴圈（各含寶石），身體連起點與四個翅膀；含股市、命運、樂透、休各一', bounds: { x0: 0, x1: 6, y0: 0, y1: 8 }, panels: 'center',
    tiles: [BF_START, ...BF_WING_TL, ...BF_WING_TR, ...BF_WING_BL, ...BF_WING_BR, ...BF_BODY],
    links: [
      ...loopLinks(BF_WING_TL), ...loopLinks(BF_WING_TR), ...loopLinks(BF_WING_BL), ...loopLinks(BF_WING_BR),
      // 身體：翅膀中間的特殊格 ↔ 美國／加拿大／墨西哥／巴西 ↔ 起點
      [2, fy(2), 2, fy(3)], [2, fy(3), 3, fy(4)],   // 股市 ↔ 美國 ↔ 起點
      [4, fy(2), 4, fy(3)], [4, fy(3), 3, fy(4)],   // 命運 ↔ 加拿大 ↔ 起點
      [2, fy(6), 2, fy(5)], [2, fy(5), 3, fy(4)],   // 樂透 ↔ 墨西哥 ↔ 起點
      [4, fy(6), 4, fy(5)], [4, fy(5), 3, fy(4)],   // 休 ↔ 巴西 ↔ 起點
    ],
    tris: [],
  };
  const DEFS = { classic: CLASSIC, heart: HEART, arrow: ARROW, bullet: BULLET, butterfly: BUTTERFLY };

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

  const MAP = { id: '', B: null, panels: 'center', LIST: Object.values(DEFS).map((d) => ({ id: d.id, name: d.name, desc: d.desc, bounds: d.bounds, shape: d.tiles.map((t) => ({ x: t.x, y: t.y, type: t.type })) })), use, setLocale, TW, REGIONS, GEMS, TILES, ADJ, TRIS, at, options, LEVELS, LEVEL_NAMES, STOCK_REF, tollOf, upCost, GEM_KEYS, gemBonus, WIN_ASSETS, BUYOUT_MULT, BUYOUT_MAX_LV, IMPACT, PIC_NAMES, PIC_VER, PALETTE };
  use(typeof __MAPID === 'string' ? __MAPID : 'classic');   // 伺服器為每一局指定地圖（__MAPID）；瀏覽器預設經典，進房間後依房間設定切換
  if (typeof module !== 'undefined') module.exports = MAP;
  else window.MAP = MAP;
})();

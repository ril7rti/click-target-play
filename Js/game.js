(() => {
  // ====== DOM ======
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const nextCanvas = document.getElementById("next");
  const nctx = nextCanvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const linesEl = document.getElementById("lines");
  const stateEl = document.getElementById("state");

  const startBtn = document.getElementById("startBtn");
  const restartBtn = document.getElementById("restartBtn");

  const btnLeft = document.getElementById("btnLeft");
  const btnRight = document.getElementById("btnRight");
  const btnDown = document.getElementById("btnDown");
  const btnRotate = document.getElementById("btnRotate");
  const btnDrop = document.getElementById("btnDrop");
  const btnPause = document.getElementById("btnPause");
  const btnStart = document.getElementById("btnStart");

  // ====== 設定 ======
  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 30; // 1マス px

  const COLORS = [
    "#000000",
    "#7aa8ff", // I
    "#ffb86b", // O
    "#9cff6b", // T
    "#ff6a3d", // L
    "#c77dff", // J
    "#ffd36a", // S
    "#6bf0ff"  // Z
  ];

  const SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]]
  };
  const TYPES = ["I","O","T","L","J","S","Z"];
  const TYPE_ID = { I:1, O:2, T:3, L:4, J:5, S:6, Z:7 };

  // ====== 状態 ======
  let board;
  let score, lines, level;
  let running, paused, gameOver;
  let dropInterval, acc, lastTime;

  let current = null;
  let next = null;

  function newBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  function syncUI() {
    scoreEl.textContent = String(score);
    linesEl.textContent = String(lines);
    levelEl.textContent = String(level);

    if (gameOver) stateEl.textContent = "終了";
    else if (paused) stateEl.textContent = "一時停止";
    else if (running) stateEl.textContent = "プレイ中";
    else stateEl.textContent = "待機";
  }

  function randType() {
    return TYPES[Math.floor(Math.random() * TYPES.length)];
  }

  function makePiece(type) {
    const shape = SHAPES[type].map(row => row.slice());
    const id = TYPE_ID[type];
    // 出現位置（中央寄せ）
    const w = shape[0].length;
    const x = Math.floor(COLS / 2 - w / 2);
    const y = -1;
    return { type, id, shape, x, y };
  }

  function rotateMatrixCW(m) {
    const h = m.length;
    const w = m[0].length;
    const out = Array.from({ length: w }, () => Array(h).fill(0));
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[c][h - 1 - r] = m[r][c];
    return out;
  }

  function collide(piece, nx = piece.x, ny = piece.y, nshape = piece.shape) {
    for (let r = 0; r < nshape.length; r++) {
      for (let c = 0; c < nshape[r].length; c++) {
        if (!nshape[r][c]) continue;
        const x = nx + c;
        const y = ny + r;
        // 盤面外
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        // 上は許す（出現直後）
        if (y < 0) continue;
        if (board[y][x] !== 0) return true;
      }
    }
    return false;
  }

  function merge(piece) {
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (!piece.shape[r][c]) continue;
        const x = piece.x + c;
        const y = piece.y + r;
        if (y >= 0 && y < ROWS && x >= 0 && x < COLS) board[y][x] = piece.id;
      }
    }
  }

  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; ) {
      if (board[y].every(v => v !== 0)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(0));
        cleared++;
        continue;
      }
      y--;
    }
    if (cleared > 0) {
      // 点数（簡易）
      const table = [0, 100, 300, 500, 800];
      score += table[cleared] * level;
      lines += cleared;

      // レベルアップ（10ラインごと）
      const newLevel = Math.floor(lines / 10) + 1;
      if (newLevel !== level) {
        level = newLevel;
        dropInterval = Math.max(140, 800 - (level - 1) * 70);
      }
    }
  }

  function spawn() {
    current = next ?? makePiece(randType());
    next = makePiece(randType());

    // 置けなければ終了
    if (collide(current, current.x, current.y, current.shape)) {
      gameOver = true;
      running = false;
    }
  }

  function move(dx) {
    if (!running || paused || gameOver) return;
    const nx = current.x + dx;
    if (!collide(current, nx, current.y)) current.x = nx;
  }

  function softDrop() {
    if (!running || paused || gameOver) return;
    const ny = current.y + 1;
    if (!collide(current, current.x, ny)) {
      current.y = ny;
      score += 1; // ソフトドロップ分
    } else {
      // 固定
      merge(current);
      clearLines();
      spawn();
    }
  }

  function hardDrop() {
    if (!running || paused || gameOver) return;
    let dist = 0;
    while (!collide(current, current.x, current.y + 1)) {
      current.y += 1;
      dist++;
    }
    score += dist * 2; // ハードドロップ加点
    merge(current);
    clearLines();
    spawn();
  }

  function rotate() {
    if (!running || paused || gameOver) return;
    const rotated = rotateMatrixCW(current.shape);

    // 簡易ウォールキック（左右にずらして試す）
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      if (!collide(current, current.x + k, current.y, rotated)) {
        current.shape = rotated;
        current.x += k;
        return;
      }
    }
  }

  function togglePause() {
    if (!running || gameOver) return;
    paused = !paused;
  }

  function startOrResume() {
    if (gameOver) return;
    running = true;
    paused = false;
  }

  function restart() {
    board = newBoard();
    score = 0;
    lines = 0;
    level = 1;

    running = false;
    paused = false;
    gameOver = false;

    dropInterval = 800;
    acc = 0;
    lastTime = 0;

    current = null;
    next = null;

    spawn();
    syncUI();
  }

  // ====== 描画 ======
  function drawCell(g, x, y, color) {
    g.fillStyle = color;
    g.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
    g.strokeStyle = "rgba(255,255,255,.12)";
    g.strokeRect(x * BLOCK + 0.5, y * BLOCK + 0.5, BLOCK - 1, BLOCK - 1);
  }

  function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景グリッド
    ctx.globalAlpha = 0.15;
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * BLOCK);
      ctx.lineTo(COLS * BLOCK, y * BLOCK);
      ctx.stroke();
    }
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * BLOCK, 0);
      ctx.lineTo(x * BLOCK, ROWS * BLOCK);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 固定ブロック
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = board[y][x];
        if (v !== 0) drawCell(ctx, x, y, COLORS[v]);
      }
    }

    // 現在ミノ
    if (current) {
      for (let r = 0; r < current.shape.length; r++) {
        for (let c = 0; c < current.shape[r].length; c++) {
          if (!current.shape[r][c]) continue;
          const x = current.x + c;
          const y = current.y + r;
          if (y < 0) continue;
          drawCell(ctx, x, y, COLORS[current.id]);
        }
      }
    }

    // オーバーレイ文字
    if (!running && !gameOver) {
      overlayText("スタートで開始\n（SpaceでもOK）");
    } else if (paused) {
      overlayText("一時停止");
    } else if (gameOver) {
      overlayText("ゲームオーバー\nリスタートで再挑戦");
    }
  }

  function overlayText(text) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 22px system-ui, sans-serif";
    const lines = text.split("\n");
    lines.forEach((t, i) => ctx.fillText(t, canvas.width / 2, canvas.height / 2 + i * 28));
    ctx.restore();
  }

  function drawNext() {
    nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);

    // 背景
    nctx.globalAlpha = 0.15;
    for (let y = 0; y <= 5; y++) {
      nctx.beginPath();
      nctx.moveTo(0, y * 30);
      nctx.lineTo(160, y * 30);
      nctx.stroke();
    }
    for (let x = 0; x <= 5; x++) {
      nctx.beginPath();
      nctx.moveTo(x * 30, 0);
      nctx.lineTo(x * 30, 160);
      nctx.stroke();
    }
    nctx.globalAlpha = 1;

    if (!next) return;

    const cell = 30;
    const shape = next.shape;
    const h = shape.length;
    const w = shape[0].length;
    const offsetX = Math.floor((5 - w) / 2);
    const offsetY = Math.floor((5 - h) / 2);

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (!shape[r][c]) continue;
        nctx.fillStyle = COLORS[next.id];
        nctx.fillRect((offsetX + c) * cell, (offsetY + r) * cell, cell, cell);
        nctx.strokeStyle = "rgba(255,255,255,.12)";
        nctx.strokeRect((offsetX + c) * cell + 0.5, (offsetY + r) * cell + 0.5, cell - 1, cell - 1);
      }
    }
  }

  // ====== ループ ======
  function update(dt) {
    if (!running || paused || gameOver) return;

    acc += dt;
    // 速度調整：一定間隔で落下
    while (acc >= dropInterval) {
      acc -= dropInterval;
      softDrop();
      if (gameOver) break;
    }
  }

  function loop(t) {
    const dt = t - lastTime;
    lastTime = t;

    update(dt);
    drawBoard();
    drawNext();
    syncUI();

    requestAnimationFrame(loop);
  }

  // ====== 入力（PC） ======
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") move(-1);
    if (e.key === "ArrowRight") move(1);
    if (e.key === "ArrowDown") softDrop();
    if (e.key === "ArrowUp") rotate();

    if (e.code === "Space") {
      e.preventDefault();
      if (!running && !gameOver) startOrResume();
      else hardDrop();
    }
    if (e.key.toLowerCase() === "p") togglePause();
  });

  // ====== 入力（スマホボタン） ======
  btnLeft.addEventListener("click", () => move(-1));
  btnRight.addEventListener("click", () => move(1));
  btnDown.addEventListener("click", () => softDrop());
  btnRotate.addEventListener("click", () => rotate());
  btnDrop.addEventListener("click", () => hardDrop());
  btnPause.addEventListener("click", () => togglePause());
  btnStart.addEventListener("click", () => startOrResume());

  startBtn.addEventListener("click", () => startOrResume());
  restartBtn.addEventListener("click", () => restart());

  // スワイプ的に操作したい場合（任意）：キャンバス左右ドラッグで移動、下ドラッグで落下なども追加できる

  // ====== 初期化 ======
  // canvasサイズが「COLS*BLOCK」「ROWS*BLOCK」に合うようにする（HTMLのwidth/heightが違う場合の保険）
  canvas.width = COLS * BLOCK;
  canvas.height = ROWS * BLOCK;

  restart();
  requestAnimationFrame(loop);
})();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const GRID_SIZE = 20;
const TILE_COUNT = canvas.width / GRID_SIZE;
const INITIAL_SPEED = 150;
const MIN_SPEED = 50;
const SPEED_STEP = 10;
const FOODS_PER_LEVEL = 5;
const SPECIAL_SPAWN_INTERVAL = 5000;
const SPECIAL_LIFESPAN = 8000;
const BANANA_BOOST_DURATION = 5000;
const PINEAPPLE_SLOW_DURATION = 5000;

const SPECIAL_TYPES = [
    { type: 'cherry',    emoji: '🍒' },
    { type: 'pineapple', emoji: '🍍' },
    { type: 'banana',    emoji: '🍌' },
    { type: 'grape',     emoji: '🍇' },
];

let gameRunning = false;
let gamePaused = false;
let gameSpeed = INITIAL_SPEED;
let baseSpeed = INITIAL_SPEED;
let animationId = null;
let lastUpdateTime = 0;
let lastSpecialSpawn = 0;
let speedBoostEnd = 0;
let slowEnd = 0;
let flashEnd = 0;

let snake = [{ x: 10, y: 10 }];
let snakeDirection = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let foods = [];
let notifications = [];
let score = 0;
let level = 1;
let foodEaten = 0;
let highScore = parseInt(localStorage.getItem('snakeHighScore')) || 0;

const gridCanvas = document.createElement('canvas');
gridCanvas.width = canvas.width;
gridCanvas.height = canvas.height;
const gridCtx = gridCanvas.getContext('2d');

function initGrid() {
    gridCtx.fillStyle = '#1a1a1a';
    gridCtx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);
    gridCtx.strokeStyle = '#2a2a2a';
    gridCtx.lineWidth = 0.5;
    for (let i = 0; i <= TILE_COUNT; i++) {
        gridCtx.beginPath(); gridCtx.moveTo(i * GRID_SIZE, 0); gridCtx.lineTo(i * GRID_SIZE, gridCanvas.height); gridCtx.stroke();
        gridCtx.beginPath(); gridCtx.moveTo(0, i * GRID_SIZE); gridCtx.lineTo(gridCanvas.width, i * GRID_SIZE); gridCtx.stroke();
    }
}

function init() {
    initGrid();
    document.getElementById('highScore').textContent = highScore;
    foods = [spawnFood('apple', 0)];
    renderGame(0);
    setupEventListeners();
}

function setupEventListeners() {
    document.addEventListener('keydown', handleKeyPress);
    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('pauseBtn').addEventListener('click', togglePause);
    document.getElementById('resetBtn').addEventListener('click', resetGame);

    let touchStartX = 0, touchStartY = 0;
    canvas.addEventListener('touchstart', e => {
        touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
        if (!gameRunning || gamePaused) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dx) > Math.abs(dy)) { dx > 0 ? setDirection(1, 0) : setDirection(-1, 0); }
        else { dy > 0 ? setDirection(0, 1) : setDirection(0, -1); }
        e.preventDefault();
    }, { passive: false });

    [['upBtn', 0, -1], ['downBtn', 0, 1], ['leftBtn', -1, 0], ['rightBtn', 1, 0]].forEach(([id, dx, dy]) => {
        document.getElementById(id).addEventListener('pointerdown', e => { e.preventDefault(); setDirection(dx, dy); });
    });
}

function setDirection(dx, dy) {
    if (!gameRunning || gamePaused) return;
    if (dx !== 0 && snakeDirection.x === 0) nextDirection = { x: dx, y: 0 };
    if (dy !== 0 && snakeDirection.y === 0) nextDirection = { x: 0, y: dy };
}

function handleKeyPress(e) {
    if (e.key === ' ') { e.preventDefault(); if (gameRunning) togglePause(); return; }
    if (!gameRunning || gamePaused) return;
    switch (e.key) {
        case 'ArrowUp':  case 'w': case 'W': if (snakeDirection.y === 0) { nextDirection = { x: 0, y: -1 }; e.preventDefault(); } break;
        case 'ArrowDown': case 's': case 'S': if (snakeDirection.y === 0) { nextDirection = { x: 0, y:  1 }; e.preventDefault(); } break;
        case 'ArrowLeft': case 'a': case 'A': if (snakeDirection.x === 0) { nextDirection = { x: -1, y: 0 }; e.preventDefault(); } break;
        case 'ArrowRight': case 'd': case 'D': if (snakeDirection.x === 0) { nextDirection = { x: 1,  y: 0 }; e.preventDefault(); } break;
    }
}

function startGame() {
    if (gameRunning) return;
    gameRunning = true; gamePaused = false; lastUpdateTime = 0; lastSpecialSpawn = 0;
    document.getElementById('startBtn').disabled = true;
    document.getElementById('pauseBtn').disabled = false;
    document.getElementById('pauseBtn').textContent = 'Pause';
    document.getElementById('gameStatus').textContent = 'Game Running...';
    animationId = requestAnimationFrame(gameLoopTick);
}

function gameLoopTick(timestamp) {
    if (!gameRunning) return;
    if (speedBoostEnd > 0 && timestamp >= speedBoostEnd) { speedBoostEnd = 0; gameSpeed = baseSpeed; }
    if (slowEnd > 0 && timestamp >= slowEnd) { slowEnd = 0; gameSpeed = baseSpeed; }
    if (timestamp - lastUpdateTime >= gameSpeed) {
        lastUpdateTime = timestamp;
        update(timestamp);
        if (!gameRunning) return;
    }
    renderGame(timestamp);
    animationId = requestAnimationFrame(gameLoopTick);
}

function togglePause() {
    if (!gameRunning) return;
    gamePaused = !gamePaused;
    if (gamePaused) {
        cancelAnimationFrame(animationId); animationId = null;
        document.getElementById('pauseBtn').textContent = 'Resume';
        document.getElementById('gameStatus').textContent = 'Game Paused';
        drawPauseOverlay();
    } else {
        lastUpdateTime = 0;
        document.getElementById('pauseBtn').textContent = 'Pause';
        document.getElementById('gameStatus').textContent = 'Game Running...';
        animationId = requestAnimationFrame(gameLoopTick);
    }
}

function resetGame() {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null; gameRunning = false; gamePaused = false;
    gameSpeed = INITIAL_SPEED; baseSpeed = INITIAL_SPEED;
    speedBoostEnd = 0; slowEnd = 0; flashEnd = 0;
    snake = [{ x: 10, y: 10 }]; snakeDirection = { x: 1, y: 0 }; nextDirection = { x: 1, y: 0 };
    score = 0; level = 1; foodEaten = 0; notifications = [];
    foods = [spawnFood('apple', 0)];

    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    document.getElementById('pauseBtn').textContent = 'Pause';
    document.getElementById('score').textContent = 0;
    document.getElementById('level').textContent = 1;
    document.getElementById('gameStatus').textContent = 'Use Arrow Keys, WASD or D-pad to move';
    renderGame(0);
}

function update(timestamp) {
    // Expire special fruits
    foods = foods.filter(f => !f.lifespan || timestamp - f.spawnTime < f.lifespan);

    // Always keep one apple
    if (!foods.some(f => f.type === 'apple')) foods.push(spawnFood('apple', timestamp));

    // Spawn special fruit every interval (max 2 specials at once)
    if (lastSpecialSpawn === 0) lastSpecialSpawn = timestamp;
    if (timestamp - lastSpecialSpawn >= SPECIAL_SPAWN_INTERVAL) {
        lastSpecialSpawn = timestamp;
        if (foods.filter(f => f.type !== 'apple').length < 2) {
            const pick = SPECIAL_TYPES[Math.floor(Math.random() * SPECIAL_TYPES.length)];
            const f = spawnFood(pick.type, timestamp);
            if (f) foods.push(f);
        }
    }

    snakeDirection = nextDirection;
    const head = snake[0];
    const newHead = {
        x: (head.x + snakeDirection.x + TILE_COUNT) % TILE_COUNT,
        y: (head.y + snakeDirection.y + TILE_COUNT) % TILE_COUNT,
    };

    if (snake.some(s => s.x === newHead.x && s.y === newHead.y)) { endGame('撞到自己了!'); return; }

    snake.unshift(newHead);

    const eatenIdx = foods.findIndex(f => f.x === newHead.x && f.y === newHead.y);
    if (eatenIdx !== -1) {
        const eaten = foods.splice(eatenIdx, 1)[0];
        applyEffect(eaten, timestamp);
    } else {
        snake.pop();
    }
}

function applyEffect(food, timestamp) {
    const fx = food.x * GRID_SIZE + GRID_SIZE / 2;
    const fy = food.y * GRID_SIZE + GRID_SIZE / 2;

    switch (food.type) {
        case 'apple': {
            foodEaten++;
            const gained = 10 * level;
            score += gained;
            const newLevel = Math.floor(foodEaten / FOODS_PER_LEVEL) + 1;
            if (newLevel !== level) {
                level = newLevel;
                baseSpeed = Math.max(MIN_SPEED, INITIAL_SPEED - (level - 1) * SPEED_STEP);
                if (!speedBoostEnd) gameSpeed = baseSpeed;
                document.getElementById('level').textContent = level;
            }
            playSound('apple');
            addNotif(`+${gained}`, fx, fy, '#00ff88', timestamp);
            break;
        }
        case 'cherry': {
            snake.pop(); // undo natural growth, then cut 5
            const lost = Math.min(score, 30);
            score = Math.max(0, score - 30);
            const cut = Math.min(5, snake.length - 1);
            snake.splice(snake.length - cut, cut);
            flashEnd = timestamp + 500;
            playSound('cherry');
            addNotif(`💥 -${lost} 变短!`, fx, fy, '#ff4444', timestamp);
            break;
        }
        case 'pineapple': {
            snake.pop(); // no growth — speed only
            speedBoostEnd = 0;
            slowEnd = timestamp + PINEAPPLE_SLOW_DURATION;
            gameSpeed = Math.min(300, Math.floor(baseSpeed * 2));
            playSound('pineapple');
            addNotif('🍍 变慢了...', fx, fy, '#88ff44', timestamp);
            break;
        }
        case 'banana': {
            snake.pop(); // no growth — speed only
            slowEnd = 0;
            speedBoostEnd = timestamp + BANANA_BOOST_DURATION;
            gameSpeed = Math.max(MIN_SPEED, Math.floor(baseSpeed * 0.45));
            score += 20;
            playSound('banana');
            addNotif('🍌 加速! +20', fx, fy, '#ffaa00', timestamp);
            break;
        }
        case 'grape': {
            // natural +1 growth already happens; add 4 more = +5 total
            const tail = snake[snake.length - 1];
            for (let i = 0; i < 4; i++) snake.push({ ...tail });
            score += 30;
            playSound('grape');
            addNotif('🍇 变长 +30', fx, fy, '#cc44ff', timestamp);
            break;
        }
    }
    document.getElementById('score').textContent = score;
}

function addNotif(text, x, y, color, timestamp) {
    notifications.push({ text, x, y, color, startTime: timestamp });
}

function endGame(reason) {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null; gameRunning = false;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('snakeHighScore', highScore);
        document.getElementById('highScore').textContent = highScore;
        document.getElementById('gameStatus').textContent = `${reason} 新纪录: ${score}!`;
    } else {
        document.getElementById('gameStatus').textContent = `${reason} 得分: ${score}`;
    }
    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    drawGameOverOverlay();
}

function spawnFood(type, timestamp) {
    const emojis = { apple: '🍎', cherry: '🍒', pineapple: '🍍', banana: '🍌', grape: '🍇' };
    let pos, attempts = 0;
    do {
        pos = { x: Math.floor(Math.random() * TILE_COUNT), y: Math.floor(Math.random() * TILE_COUNT) };
        attempts++;
    } while (attempts < 100 && (
        snake.some(s => s.x === pos.x && s.y === pos.y) ||
        foods.some(f => f.x === pos.x && f.y === pos.y)
    ));
    if (attempts >= 100) return null;
    return { ...pos, type, emoji: emojis[type], spawnTime: timestamp, lifespan: type === 'apple' ? null : SPECIAL_LIFESPAN };
}

function renderGame(timestamp) {
    ctx.drawImage(gridCanvas, 0, 0);

    // Cherry flash
    if (flashEnd > 0 && timestamp < flashEnd) {
        const intensity = (flashEnd - timestamp) / 500;
        ctx.fillStyle = `rgba(255, 0, 0, ${0.4 * intensity})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Snake
    const len = snake.length;
    snake.forEach((seg, i) => {
        const isHead = i === 0;
        const fade = Math.max(0.35, 1 - i / (len + 8));
        ctx.shadowColor = isHead ? '#00ff88' : 'transparent';
        ctx.shadowBlur = isHead ? 12 : 0;
        ctx.fillStyle = isHead
            ? '#00ff88'
            : `rgb(0,${Math.floor(170 * fade + 30)},${Math.floor(70 * fade + 15)})`;
        ctx.fillRect(seg.x * GRID_SIZE + 1, seg.y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2);
    });
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

    if (snake.length > 0) drawSnakeEyes(snake[0], snakeDirection);

    // Foods
    ctx.font = '14px "Segoe UI Emoji", serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    foods.forEach(f => {
        // Expiry bar for specials
        if (f.lifespan && timestamp > 0) {
            const ratio = Math.max(0, 1 - (timestamp - f.spawnTime) / f.lifespan);
            ctx.fillStyle = '#333';
            ctx.fillRect(f.x * GRID_SIZE + 1, f.y * GRID_SIZE + GRID_SIZE - 3, GRID_SIZE - 2, 2);
            ctx.fillStyle = ratio > 0.4 ? '#44ff44' : '#ff4444';
            ctx.fillRect(f.x * GRID_SIZE + 1, f.y * GRID_SIZE + GRID_SIZE - 3, (GRID_SIZE - 2) * ratio, 2);
        }
        ctx.fillText(f.emoji, f.x * GRID_SIZE + 1, f.y * GRID_SIZE + 1);
    });

    // Pineapple slow bar + tint
    if (slowEnd > 0 && timestamp < slowEnd) {
        const ratio = (slowEnd - timestamp) / PINEAPPLE_SLOW_DURATION;
        ctx.fillStyle = 'rgba(100,220,100,0.07)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(100,220,100,0.7)';
        ctx.fillRect(0, 4, canvas.width * ratio, 4);
        ctx.fillStyle = '#88ff44';
        ctx.font = 'bold 11px Arial'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText(`🐢${Math.ceil((slowEnd - timestamp) / 1000)}s`, canvas.width - 4, 8);
    }

    // Banana speed boost bar + tint
    if (speedBoostEnd > 0 && timestamp < speedBoostEnd) {
        const ratio = (speedBoostEnd - timestamp) / BANANA_BOOST_DURATION;
        ctx.fillStyle = 'rgba(255,170,0,0.08)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255,170,0,0.7)';
        ctx.fillRect(0, 0, canvas.width * ratio, 4);
        ctx.fillStyle = '#ffaa00';
        ctx.font = 'bold 11px Arial'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText(`⚡${Math.ceil((speedBoostEnd - timestamp) / 1000)}s`, canvas.width - 4, 6);
    }

    // Floating notifications
    const NOTIF_DUR = 1200;
    notifications = notifications.filter(n => timestamp - n.startTime < NOTIF_DUR);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    notifications.forEach(n => {
        const t = (timestamp - n.startTime) / NOTIF_DUR;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = n.color;
        ctx.font = 'bold 13px Arial';
        ctx.fillText(n.text, n.x, n.y - t * 35);
    });
    ctx.globalAlpha = 1;
}

function drawSnakeEyes(head, dir) {
    const cx = head.x * GRID_SIZE + GRID_SIZE / 2;
    const cy = head.y * GRID_SIZE + GRID_SIZE / 2;
    const off = GRID_SIZE * 0.25;
    let e1, e2;
    if (dir.x === 1)       { e1 = { x: cx+off, y: cy-off }; e2 = { x: cx+off, y: cy+off }; }
    else if (dir.x === -1) { e1 = { x: cx-off, y: cy-off }; e2 = { x: cx-off, y: cy+off }; }
    else if (dir.y === -1) { e1 = { x: cx-off, y: cy-off }; e2 = { x: cx+off, y: cy-off }; }
    else                   { e1 = { x: cx-off, y: cy+off }; e2 = { x: cx+off, y: cy+off }; }
    ctx.fillStyle = 'white';
    [e1, e2].forEach(e => { ctx.beginPath(); ctx.arc(e.x, e.y, 2.5, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#111';
    [e1, e2].forEach(e => { ctx.beginPath(); ctx.arc(e.x, e.y, 1.2, 0, Math.PI * 2); ctx.fill(); });
}

function drawPauseOverlay() {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'white'; ctx.font = 'bold 36px Arial';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
    ctx.font = '14px Arial'; ctx.fillStyle = '#aaa';
    ctx.fillText('Press Space or Resume to continue', canvas.width / 2, canvas.height / 2 + 36);
}

function drawGameOverOverlay() {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff4444'; ctx.font = 'bold 40px Arial';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);
    ctx.fillStyle = 'white'; ctx.font = '20px Arial';
    ctx.fillText(`Score: ${score}  Level: ${level}`, canvas.width / 2, canvas.height / 2 + 20);
    ctx.font = '14px Arial'; ctx.fillStyle = '#aaa';
    ctx.fillText('Press Start to play again', canvas.width / 2, canvas.height / 2 + 52);
}

// ── Sound ────────────────────────────────────────────────
let audioCtx;

function getAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function playSound(type) {
    try {
        const ctx = getAudio();
        const t = ctx.currentTime;

        const osc = (freq, wave, start, end, vol = 0.25, dur = 0.3) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = wave;
            o.frequency.setValueAtTime(freq, t + start);
            if (end !== freq) o.frequency.exponentialRampToValueAtTime(end, t + start + dur);
            g.gain.setValueAtTime(vol, t + start);
            g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
            o.start(t + start); o.stop(t + start + dur);
        };

        switch (type) {
            case 'apple':     osc(523, 'sine',     0, 523, 0.25, 0.15); break;
            case 'cherry':    osc(300, 'sawtooth', 0,  80, 0.3,  0.4);  break;
            case 'pineapple': osc(400, 'sine',     0, 140, 0.25, 0.6);  break;
            case 'banana':    osc(200, 'sine',     0, 900, 0.25, 0.25); break;
            case 'grape':
                [0, 0.09, 0.18].forEach((delay, i) => {
                    osc([330, 415, 523][i], 'sine', delay, [330, 415, 523][i], 0.22, 0.2);
                });
                break;
        }
    } catch (_) {}
}
// ─────────────────────────────────────────────────────────

init();

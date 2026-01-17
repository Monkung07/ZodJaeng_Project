document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
document.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });

// --- Global State ---
let appData = { customCards: [], currentTheme: 'zod', customCardBack: null, cardImage: null };
let gameState = {
    mode: null, // 'party' หรือ 'standard'
    activeDeck: []
};
let isShuffling = false;

// --- Sound System ---
const SoundFX = {
    ctx: null, buffer: null,
    init: function () {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC && !this.ctx) this.ctx = new AC();
            if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        } catch (e) { }
    },
    play: function (freq, type = 'sine') {
        // ถ้าเป็นโหมด standard ให้เงียบกริบ
        if (gameState.mode === 'standard') return; 
        this.playOsc(freq, type, 0.3);
    },
    playSnap: function () { 
        if (gameState.mode === 'standard') return;
        this.playNoise(800); 
    },
    playSlide: function () { 
        if (gameState.mode === 'standard') return;
        this.playOsc(150, 'triangle', 0.2); 
    },
    playTone: function (freq, type = 'sine') { 
        if (gameState.mode === 'standard') return;
        this.playOsc(freq, type, 0.3); 
    },
    playNoise: function (freq) {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * 0.1;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) { data[i] = Math.random() * 2 - 1; }
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.8, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.04);
        src.connect(f); f.connect(g); g.connect(this.ctx.destination);
        src.start();
    },
    playOsc: function (freq, type, dur) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.1, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur);
        osc.connect(g); g.connect(this.ctx.destination);
        osc.start(); osc.stop(this.ctx.currentTime + dur);
    }
};

// --- Themes ---
const themes = {
    zod: { '--accent': '#FACC15', '--text-on-accent': '#000000' },
    red: { '--accent': '#EF4444', '--text-on-accent': '#FFFFFF' },
    blue: { '--accent': '#3B82F6', '--text-on-accent': '#FFFFFF' },
    purple: { '--accent': '#8B5CF6', '--text-on-accent': '#FFFFFF' }
};

function setTheme(themeName) {
    const theme = themes[themeName] || themes.zod;
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme)) { root.style.setProperty(key, value); }
    document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`theme-${themeName}`)?.classList.add('active');
    appData.currentTheme = themeName;
    saveData();
}

// --- DATA ---
const partyDeckData = [
    { text: "คนเปิดการ์ดโดน", type: "drink" }, { text: "คนซ้ายโดน", type: "drink" },
    { text: "คนขวาโดน", type: "drink" }, { text: "คนซ้ายและขวาโดน", type: "drink" },
    { text: "คนเปิดการ์ดโดน", type: "drink" }, { text: "คนซ้ายโดน", type: "drink" },
    { text: "คนขวาโดน", type: "drink" }, { text: "คนซ้ายและขวาโดน", type: "drink" },
    { text: "ใครแบตมือถือเหลือน้อยสุด โดน", type: "drink" }, { text: "ใครแบตมือถือเหลือเยอะสุด โดน", type: "drink" },
    { text: "คนใส่แว่นโดน", type: "drink" }, { text: "คนไม่ใส่แว่นโดน", type: "drink" },
    { text: "คนใส่เสื้อสีดำโดน", type: "drink" }, { text: "ใครมาสายวันนี้ โดน 1 แก้ว", type: "drink" },
    { text: "ใครใช้ iPhone โดน", type: "drink" }, { text: "วันเกิดใครใกล้ที่สุดโดน", type: "drink" },
    { text: "คนโสดโดน 1 แก้ว", type: "drink" }, { text: "ใครหน้าตาดีสุดโดน", type: "drink" },
    { text: "คนอายุมากที่สุดโดน", type: "drink" }, { text: "คนอายุน้อยที่สุดโดน", type: "drink" },
    { text: "ใครพกพาวเวอร์แบงค์มา โดน", type: "drink" }, { text: "คนสูงที่สุดโดน", type: "drink" },
    { text: "คนเตี้ยที่สุดโดน", type: "drink" }, { text: "ผู้ชายโดน", type: "drink" },
    { text: "บอกชื่อจริง-นามสกุล คนตรงข้าม ถ้าผิดโดน", type: "action" },
    { text: "มินิเกม ผลัดกันนับเลข 1-25 นับได้คนละ 1-3 เลข ใครนับเลข 25 โดน", type: "action" },
    { text: "มินิเกม บอกชื่อจังหวัดลงท้าย 'บุรี' ห้ามซ้ำ", type: "action" },
    { text: "มินิเกม บอกชื่อผลไม้สีแดง ห้ามซ้ำ", type: "action" },
    { text: "มินิเกม บอกยี่ห้อรถ ห้ามซ้ำ (ใครนึกไม่ออกโดน)", type: "action" },
    { text: "เป่ายิ้งฉุบคนขวา แพ้โดน", type: "action" }, { text: "เป่ายิ้งฉุบคนซ้าย แพ้โดน", type: "action" },
    { text: "ทายหัวก้อยกับคนทางขวา แพ้โดน", type: "action" }, { text: "ให้คนขวาดีดหน้าผาก 1 ที", type: "action" },
    { text: "มินิเกม ให้พูดคำในภาษาใดก็ได้ 1 คำ ถ้ามีคนในวงรู้ความหมาย โดน", type: "action" },
    { text: "ทำเสียงสัตว์อะไรก็ได้ ให้เพื่อนทางซ้ายทาย ทายผิดโดนคู่", type: "action" },
    { text: "ลงสตอรี่ตามคนในไอจีแบบสุ่ม", type: "action" }, { text: "อมน้ำแข็ง 1 ก้อน", type: "action" },
    { text: "พูดเสียงชิปมังค์จนกว่าจะถึงเทิร์นถัดไป", type: "action" }, { text: "ทายสีที่คนตรงข้ามชอบ ทายผิดโดน", type: "action" },
    { text: "ทุกคนยืนขึ้น ยืนคนสุดท้ายโดน", type: "action" }, { text: "แข่งกับคนด้านขวา พูดลากเสียงให้ยาวที่สุด คนแพ้โดน", type: "action" },
    { text: "ท้าแข่งงัดข้อกับ 1 คนในวง คนแพ้โดน", type: "action" }, { text: "เล่าความทรงจำที่แย่ที่สุด", type: "action" },
    { text: "สิ่งที่ไมได้ไปต่อในปี 2026", type: "action" }, { text: "สิ่งที่ได้ไปต่อในปี 2026", type: "action" },
    { text: "เล่าว่า ตอนเจอคนทางซ้ายครั้งแรกรู้สึกยังไง", type: "action" },
    { text: "ถ้าต้องสลับชีวิตกับเพื่อนคนหนึ่งในนี้ จะเลือกใคร?", type: "action" },
    { text: "เลียนแบบเพื่อนคนหนึ่งในวง แล้วให้คนอื่นทายว่าเป็นใคร ถ้าไม่มีใครทายถูกโดน", type: "action" },
    { text: "อ่านแชทแรกที่คุยกับเพื่อนทางขวา ให้ทุกคนฟัง(ไม่กล้าโดน)", type: "action" },
    { text: "อัดสตอรี่อธิบายอย่างจริงจังว่า ทำไมนกพิราบถึงวางแผนยึดครองโลก(ไม่กล้าโดน)", type: "action" },
    { text: "งับแขน 1 คนในวง (ไม่กล้าโดน)", type: "action" }, { text: "มินิเกม คำต้องเชื่อม", type: "action" },
    { text: "สุ่มรูปในอัลบั้มเปิดให้ทุกคนดู", type: "action" }, { text: "เลือกเพื่อนกินเพียว 1 ฝา", type: "hard" },
    { text: "กินเพียว 1 ฝา", type: "hard" }, { text: "ผสมอะไรก็ได้ให้คนซ้ายโดน", type: "hard" },
    { text: "ผสมอะไรก็ได้ให้คนขวาโดน", type: "hard" }, { text: "เปิดรูปเก่าสุดในอัลบั้ม (ไม่กล้าเปิดโดน)", type: "hard" },
    { text: "ค้นประวัติ Google (ไม่กล้าโดน)", type: "hard" }, { text: "บอกเหตุผลทำไมตัวเองถึงไม่ควรมีแฟน", type: "hard" },
    { text: "โพสต์รูปเท้าตัวเองลงสตอรี่พร้อมแคปชั่น Sexy?🫦(ไม่กล้าเปิดโดน)", type: "hard" },
    { text: "ให้คนในวงดู DM ใน Instagram ของคุณเป็นเวลา 30 วินาที (ไม่กล้าเปิดโดน)", type: "hard" },
    { text: "โชว์รูปตัวเองทีคิดว่า Sexy ที่สุด (ไม่กล้าเปิดโดน)", type: "hard" },
    { text: "Free Turn! รอดตัวไป", type: "lucky" }, { text: "Free Turn! รอดตัวไป", type: "lucky" },
    { text: "สั่งใครก็ได้โดน 1 แก้ว", type: "lucky" }, { text: "Free Turn! รอดตัวไป", type: "lucky" },
    { text: "Free Turn! รอดตัวไป", type: "lucky" }, { text: "สั่งใครก็ได้โดน 1 แก้ว", type: "lucky" },
    { text: "พักกินน้ำเปล่า", type: "lucky" }
];

function createStandardDeck() {
    const suits = [{ s: '♠', c: 'black' }, { s: '♥', c: 'red' }, { s: '♣', c: 'black' }, { s: '♦', c: 'red' }];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let deck = [];
    suits.forEach(suit => {
        ranks.forEach(rank => {
            // โหมด Standard ไม่ต้องใช้ type ในการเล่นเสียง
            deck.push({ text: rank, suit: suit.s, color: suit.c, isStandard: true });
        });
    });
    return deck;
}

const reactionMap = {
    hard: ["เรียบร้อยครับจารย์!", "สู่ขิต...", "ลาก่อยยยยย", "ไม่ไหวอย่าฝืน"],
    drink: ["คอแห้งพอดีเลย", "หวานเจี๊ยบบบ", "ชนแก้วครับผม", "เบาๆ กรุบกริบ"],
    action: ["อย่าเขินดิวะ!", "เอาให้สุด!", "กล้าป่าววว?", "ขอตึงๆ นะ"],
    lucky: ["ทำบุญด้วยอะไรมา?", "รอดเฉยยยย", "แต้มบุญสูงนะเรา", "งวดนี้หวยออกแน่"]
};
const waitingTexts = ["ตาใครเอ่ย?", "มือสั่นทำไม?", "ใบต่อไปโหดแน่", "หยิบสิ อย่าลีลา"];

const deckContainer = document.getElementById('deck');
const statusText = document.getElementById('status-text');
const countText = document.getElementById('card-count');
const modal = document.getElementById('custom-modal');
const confirmModal = document.getElementById('confirm-modal');

// --- INITIALIZATION ---
function loadData() {
    const saved = localStorage.getItem('party_game_data_zod');
    if (saved) { try { appData = { ...appData, ...JSON.parse(saved) }; } catch (e) { resetData(); } }
    setTheme(appData.currentTheme || 'zod');
    applyCardBack(appData.cardImage || appData.customCardBack);
    updateModalUI();
}
function saveData() { localStorage.setItem('party_game_data_zod', JSON.stringify(appData)); updateModalUI(); }
function resetData() { appData = { customCards: [], currentTheme: 'zod', customCardBack: null, cardImage: null }; saveData(); }

loadData();

// --- NAVIGATION LOGIC ---
function enterGameMenu() {
    SoundFX.init();
    SoundFX.playTone(600); // เสียงกดปุ่มเมนู
    document.getElementById('landing-screen').style.opacity = '0';
    document.getElementById('landing-screen').style.pointerEvents = 'none';
    document.getElementById('menu-screen').style.opacity = '1';
    document.getElementById('menu-screen').style.pointerEvents = 'auto';
}

function selectGame(mode) {
    // เล่นเสียงเฉพาะตอนกดเลือกเกม (SoundFX จัดการเรื่องใบ้เสียงให้แล้วถ้าเป็น standard)
    // แต่ตรงนี้เราอยากให้มีเสียง "ตื๊ด" ตอบรับการกดปุ่มเมนูเสมอ ก็ใช้ playOsc ตรงๆ ได้
    if(SoundFX.ctx) SoundFX.playOsc(600, 'sine', 0.1); 

    gameState.mode = mode;
    
    document.getElementById('menu-screen').style.opacity = '0';
    document.getElementById('menu-screen').style.pointerEvents = 'none';
    document.getElementById('game-screen').classList.add('active');
    
    if (mode === 'party') {
        document.getElementById('party-options').style.display = 'block';
        gameState.activeDeck = [...partyDeckData, ...appData.customCards].map((c, i) => ({ ...c, id: i }));
    } else {
        document.getElementById('party-options').style.display = 'none';
        gameState.activeDeck = createStandardDeck().map((c, i) => ({ ...c, id: i }));
    }
    deployRealDeck();
    updateStatus('waiting');
}

function backToMenu() {
    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('menu-screen').style.opacity = '1';
    document.getElementById('menu-screen').style.pointerEvents = 'auto';
    gameState.mode = null;
}

// --- GAME LOGIC ---
function deployRealDeck() {
    deckContainer.innerHTML = '';
    const shuffled = [...gameState.activeDeck].sort(() => Math.random() - 0.5);
    gameState.activeDeck = shuffled;

    gameState.activeDeck.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.zIndex = index + 1;
        card.dataset.id = item.id;
        if(item.type) card.dataset.type = item.type; // ใส่ type เฉพาะ Zod mode
        
        card.style.transform = `translate(0,0) rotate(${Math.random() * 2 - 1}deg)`;
        
        let frontContent = '';
        let cardClass = 'card-face card-front';
        
        if (item.isStandard) {
            if (item.color === 'red') cardClass += ' card-red';
            frontContent = `<div class="flex flex-col items-center"><span class="suit-icon">${item.suit}</span><span class="rank-text">${item.text}</span></div>`;
        } else {
            frontContent = `<div class="flex flex-col items-center px-4"><span class="text-3xl mb-4">🍻</span><span>${item.text}</span></div>`;
        }

        card.innerHTML = `<div class="card-face card-back"></div><div class="${cardClass}">${frontContent}</div>`;
        card.onclick = () => handleCardClick(card, item);
        deckContainer.appendChild(card);
    });
    countText.innerText = `เหลือ ${gameState.activeDeck.length} ใบ`;
}

function handleCardClick(card, item) {
    if (isShuffling || card.classList.contains('discarded')) return;
    SoundFX.init();

    const isStandard = gameState.mode === 'standard';

    if (card.classList.contains('active')) {
        // --- DISCARD ---
        SoundFX.playSlide(); // จะเงียบเองถ้าเป็น standard ตาม logic ใน SoundFX
        card.classList.remove('active');
        card.classList.add('discarded');
        gameState.activeDeck = gameState.activeDeck.filter(c => c.id !== item.id);
        countText.innerText = `เหลือ ${gameState.activeDeck.length} ใบ`;
        
        setTimeout(() => {
            card.remove();
            if (gameState.activeDeck.length === 0) {
                updateStatus('empty');
            } else {
                // ถ้าเป็น standard ไม่ต้องขึ้น status 'waiting' (ให้โล่งๆ)
                if(!isStandard) updateStatus('waiting');
                else document.getElementById('status-text').innerText = ""; 
            }
        }, 600);
    } else {
        // --- REVEAL ---
        const next = card.nextElementSibling;
        if (!next || next.classList.contains('discarded')) {
            card.classList.add('active');
            
            // รอ 300ms ให้การ์ดเริ่มพลิกก่อนค่อยโชว์ข้อความ
            setTimeout(() => {
                if (isStandard) {
                    // Standard Mode: เงียบ + ไม่มีข้อความ
                    document.getElementById('status-text').innerText = "";
                } else {
                    // Party Mode: มีเสียง + มีข้อความ
                    updateStatus('reaction', item);
                    if (item.type === 'hard') SoundFX.playTone(100, 'square');
                    else if (item.type === 'lucky') SoundFX.playTone(600);
                    else SoundFX.playTone(400);
                }
            }, 300);
        }
    }
}

function updateStatus(mode, item = null) {
    // ถ้าเป็นโหมด standard และไม่ใช่ตอนไพ่หมดกอง ให้เคลียร์ข้อความทิ้งทันที
    if (gameState.mode === 'standard' && mode !== 'empty') {
        statusText.innerText = "";
        return;
    }

    let text = "";
    // Reset Animation
    statusText.className = "text-3xl md:text-5xl font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] leading-tight text-pop";
    void statusText.offsetWidth; 
    statusText.classList.add('text-pop');

    if (mode === 'waiting') {
        text = gameState.activeDeck.length === 0 ? "หมดกองแล้ว!" : waitingTexts[Math.floor(Math.random() * waitingTexts.length)];
        statusText.style.color = gameState.activeDeck.length === 0 ? 'gray' : 'var(--accent)';
        document.getElementById('btn-shuffle').disabled = gameState.activeDeck.length === 0;
    } else if (mode === 'empty') {
        text = "หมดกองแล้ว!";
        statusText.style.color = "#999";
    } else if (mode === 'reaction') {
        if (item && item.isStandard) {
            // Standard: ไม่ควรเข้า case นี้แล้ว แต่เผื่อไว้
            text = ""; 
        } else {
            const category = item ? item.type : 'drink';
            const options = reactionMap[category] || reactionMap['drink'];
            text = options[Math.floor(Math.random() * options.length)];
            if (category === 'hard') statusText.style.color = '#EF4444';
            else if (category === 'lucky') statusText.style.color = '#10B981';
            else statusText.style.color = '#EC4899';
        }
    }
    statusText.innerText = text;
}

function instantRestart() {
    if (isShuffling) return;
    SoundFX.init(); SoundFX.playSlide(); // จะเงียบเองถ้าเป็น standard
    
    if (gameState.mode === 'party') {
        gameState.activeDeck = [...partyDeckData, ...appData.customCards].map((c, i) => ({ ...c, id: i }));
    } else {
        gameState.activeDeck = createStandardDeck().map((c, i) => ({ ...c, id: i }));
    }
    deployRealDeck();
    
    if (gameState.mode === 'party') updateStatus('waiting');
    else document.getElementById('status-text').innerText = "";
}

function startShuffleSequence() {
    if (isShuffling || gameState.activeDeck.length === 0) return;
    isShuffling = true; SoundFX.init();
    deckContainer.innerHTML = ''; 
    
    if(gameState.mode === 'party') updateStatus('waiting');
    else document.getElementById('status-text').innerText = "";

    const STUNT_COUNT = Math.min(8, gameState.activeDeck.length);
    const stuntCards = [];

    for (let i = 0; i < STUNT_COUNT; i++) {
        const c = document.createElement('div'); c.className = 'card';
        c.innerHTML = `<div class="card-face card-back"></div>`;
        deckContainer.appendChild(c); stuntCards.push(c);
    }

    stuntCards.forEach((c, i) => {
        setTimeout(() => {
            SoundFX.playSnap(); // จะเงียบเองถ้าเป็น standard
            c.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
            c.style.transform = `translate(${(i - STUNT_COUNT / 2) * 25}px, -110px) rotate(${(i - STUNT_COUNT / 2) * 5}deg)`;
        }, i * 30);

        setTimeout(() => {
            c.style.transition = 'transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            c.style.transform = `translate(0,0) rotate(${Math.random() * 2 - 1}deg)`;
        }, (STUNT_COUNT * 30) + 500 + (i * 50));
    });

    setTimeout(() => { deployRealDeck(); isShuffling = false; }, (STUNT_COUNT * 30) + 500 + (STUNT_COUNT * 50) + 800);
}

// --- Settings / Utils ---
function updateModalUI() {
    document.getElementById('custom-count-display').innerText = appData.customCards.length;
    document.getElementById('upload-text').innerText = (appData.cardImage || appData.customCardBack) ? "ใช้รูปภาพที่เลือกอยู่" : "อัปโหลดรูปใหม่";
}

function handleImageUpload(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return alert("ไฟล์ใหญ่ไป! ขอไม่เกิน 2MB");
    const reader = new FileReader();
    reader.onload = (e) => {
        appData.cardImage = e.target.result;
        appData.customCardBack = e.target.result; 
        applyCardBack(e.target.result);
        saveData();
    };
    reader.readAsDataURL(file);
}
function resetCardBack() { 
    appData.cardImage = null; 
    appData.customCardBack = null; 
    applyCardBack(null); 
    saveData(); 
}
function applyCardBack(imgUrl) {
    const style = document.getElementById('dynamic-card-style');
    if (imgUrl) style.innerHTML = `.card-back { background-image: url(${imgUrl}) !important; background-size: cover !important; background-position: center !important; border: 6px solid white !important; } .card-back::after { display: none !important; }`;
    else style.innerHTML = '';
}

function toggleModal(show) { modal.classList.toggle('hidden', !show); if (show) updateModalUI(); }
function openConfirm(action) {
    confirmModal.classList.remove('hidden');
    const btnYes = document.getElementById('confirm-yes-btn');
    const title = document.getElementById('confirm-title');
    const desc = document.getElementById('confirm-desc');

    if (action === 'clearCustom') {
        title.innerText = "ล้างการ์ดที่เพิ่ม?"; desc.innerText = "การ์ดที่คุณพิมพ์เพิ่มจะหายไป";
        btnYes.onclick = () => { appData.customCards = []; saveData(); closeConfirm(); };
    }
}
function closeConfirm() { confirmModal.classList.add('hidden'); }
function applyAndClose() { instantRestart(); toggleModal(false); }

function toggleCustomSelect() { document.getElementById('custom-options-list').classList.toggle('open'); }
function selectOption(value, text) {
    document.getElementById('inp-type').value = value;
    document.getElementById('selected-val-display').innerText = text;
    document.querySelectorAll('.custom-option').forEach(el => el.classList.remove('selected'));
    event.target.classList.add('selected');
    toggleCustomSelect();
}
window.onclick = (e) => {
    if (!e.target.matches('.custom-select-trigger') && !e.target.matches('.custom-select-trigger *')) {
        document.getElementById('custom-options-list').classList.remove('open');
    }
};

function addCustomCard() {
    const text = document.getElementById('inp-text').value.trim();
    const type = document.getElementById('inp-type').value;
    const count = parseInt(document.getElementById('inp-count').value);
    if (!text) return alert("ใส่ข้อความก่อนสิครับ!");
    for (let i = 0; i < count; i++) appData.customCards.push({ text, type });
    saveData();
    document.getElementById('inp-text').value = '';
    const btn = document.querySelector('button[onclick="addCustomCard()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = "<span class='material-icons-round'>check</span> เรียบร้อย";
    setTimeout(() => btn.innerHTML = originalText, 1000);
}
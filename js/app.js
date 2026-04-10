/**
 * AI 英语私教 - 核心功能整合版 (v4.0)
 * 功能：1247自动化看板、AI故事生成、记忆宫殿(三行格式)、语音识别、双模式聊天
 */

// ================= 全局变量 =================
let activeUtterance = null; 
let wordList = []; 
let currentWordIndex = 0; 
let articleList = [];
let currentArticleText = ""; 
let articleSentences = []; 
let currentSentenceIdx = 0; 
let sentenceReplayTimer = null;
let currentChatMode = 'eng'; 
let chatHistory = [];

const promptEng = `你是一位友好的英语母语者，正在和用户进行日常聊天。只有当用户出现明显语法错误时才纠错。格式：<纠错>中文纠错内容</纠错> 回复内容。`;
const promptChn = `你是一个友好的中文AI助手。`;

// ================= 初始化 =================
window.onload = function() {
    loadAllData();
    const savedKey = localStorage.getItem('silicon_api_key');
    if (savedKey) {
        document.getElementById('siliconApiKey').value = savedKey;
        document.getElementById('settingsCard').style.display = 'none'; 
    }
    switchChatMode('eng');
    updateDailyDashboard();
    setInterval(() => {
        const val = document.getElementById('groupSelect').value;
        const gNum = val === 'all' ? '全' : parseInt(val) + 1;
        const activeSpan = document.getElementById('currentActiveGNum');
        if(activeSpan) activeSpan.innerText = gNum;
    }, 500);
};

// ================= 1. 数据加载 (核心：步进3行) =================
async function loadAllData() {
    try {
        const wRes = await fetch('NewWords.txt');
        if (wRes.ok) {
            const wText = await wRes.text();
            const rawLines = wText.split(/\r?\n/).map(w => w.trim()).filter(w => w.length > 0);  
            wordList = [];
            // 重要：i += 3，因为每个单词占用三行（词、例句、宫殿）
            for (let i = 0; i < rawLines.length; i += 3) {
                const wordLine = rawLines[i];
                const sentenceLine = rawLines[i + 1] || "暂无例句。";
                const hookLine = rawLines[i + 2] || "暂无记忆钩子。";
                
                const parts = wordLine.split(/\||:|：/);
                wordList.push({ 
                    en: parts[0].trim(), 
                    zh: parts.length > 1 ? parts[1].trim() : "暂无释义", 
                    ex: sentenceLine,
                    hook: hookLine
                });
            }
            if (wordList.length > 0) {
                initGroupSelect();
                updateWordDisplay();
            }
        }
    } catch (e) { console.error("单词库加载失败", e); }

    try {
        const aRes = await fetch('Texts.txt');
        if (aRes.ok) {
            const aText = await aRes.text();
            const allLines = aText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            articleList = [];
            for (let i = 0; i < allLines.length; i += 2) {
                articleList.push({ en: allLines[i], zh: allLines[i + 1] || "" });
            }
            if (articleList.length > 0) initArticleSelect();
        }
    } catch (e) { console.error("文章库加载失败", e); }
}

// ================= 2. 单词练习逻辑 =================
function initGroupSelect() {
    const select = document.getElementById('groupSelect');
    select.innerHTML = `<option value="all">📚 全部练习 (${wordList.length})</option>`;
    const groupCount = Math.ceil(wordList.length / 10);
    for (let i = 0; i < groupCount; i++) {
        select.add(new Option(`📦 第 ${i + 1} 组 (${i*10+1}-${Math.min((i+1)*10, wordList.length)})`, i));
    }
}

function getGroupBounds() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') return { start: 0, end: wordList.length - 1, total: wordList.length };
    const start = parseInt(val) * 10;
    const end = Math.min(start + 9, wordList.length - 1);
    return { start, end, total: end - start + 1 };
}

function updateWordDisplay() {
    if (wordList.length === 0) return;
    const bounds = getGroupBounds();
    const currentWord = wordList[currentWordIndex];

    document.getElementById('targetWord').innerText = currentWord.en;
    document.getElementById('wordCounter').innerText = `${currentWordIndex - bounds.start + 1} / ${bounds.total}`;
    document.getElementById('chineseMeaning').innerText = currentWord.zh;
    document.getElementById('chineseMeaning').style.display = 'none';

    // 填充例句 + 记忆宫殿
    const exBox = document.getElementById('exampleSentence');
    exBox.innerHTML = `
        <div style="margin-bottom: 8px;">${currentWord.ex}</div>
        <div style="color: #8e44ad; font-weight: bold; font-size: 14px; border-top: 1px dashed #ddd; padding-top: 5px; margin-top: 5px;">
            🏰 ${currentWord.hook}
        </div>
    `;
    exBox.style.display = 'none';
    document.getElementById('wordResult').innerText = "";
    document.getElementById('targetWord').style.filter = 'none';
}

function changeGroup() { currentWordIndex = getGroupBounds().start; updateWordDisplay(); }
function nextWord() {
    const bounds = getGroupBounds();
    currentWordIndex++;
    if (currentWordIndex > bounds.end) currentWordIndex = bounds.start;
    updateWordDisplay();
}
function toggleMeaning() { 
    const el = document.getElementById('chineseMeaning');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
function showAndPlayExample() {
    document.getElementById('exampleSentence').style.display = 'block';
    const englishPart = wordList[currentWordIndex].ex.replace(/[^\x00-\xff]/g, '').trim();
    if (englishPart) {
        window.speechSynthesis.cancel();
        activeUtterance = new SpeechSynthesisUtterance(englishPart);
        activeUtterance.lang = 'en-US';
        window.speechSynthesis.speak(activeUtterance);
    }
}
function readTargetWord() {
    window.speechSynthesis.cancel();
    activeUtterance = new SpeechSynthesisUtterance(wordList[currentWordIndex].en);
    activeUtterance.lang = 'en-US';
    window.speechSynthesis.speak(activeUtterance);
}

// 单词练习：语音跟读识别
function startListeningForWord() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; 
    if (!SR) return alert("请使用 Safari 或 Chrome。");
    const recognition = new SR(); recognition.lang = 'en-US'; 
    const resultEl = document.getElementById('wordResult');
    resultEl.innerText = "正在聆听..."; recognition.start();
    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript.toLowerCase().replace(/[.,!?]/g, '').trim(); 
        const target = wordList[currentWordIndex].en.toLowerCase().trim(); 
        if (transcript === target) {
            resultEl.style.color = "#27ae60"; resultEl.innerHTML = `✅ 完美: "${transcript}"`;
        } else {
            resultEl.style.color = "#e74c3c"; resultEl.innerHTML = `❌ 听起来像: "${transcript}"`;
        }
    };
}

// ================= 3. 看板与1247进度管理 =================
function getLocalDateString(date) {
    let y = date.getFullYear();
    let m = (date.getMonth() + 1).toString().padStart(2, '0');
    let d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function markCurrentGroupFinished() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') return;
    const currentGNum = parseInt(val) + 1;
    const today = new Date();
    today.setHours(0,0,0,0);
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    
    for (let i = 1; i <= currentGNum; i++) {
        let targetDate = new Date(today);
        if (i === currentGNum) {} 
        else if (i === currentGNum - 1) targetDate.setDate(today.getDate() - 1);
        else if (i === currentGNum - 3) targetDate.setDate(today.getDate() - 3);
        else if (i === currentGNum - 6) targetDate.setDate(today.getDate() - 6);
        else targetDate.setDate(today.getDate() - 20);
        history[i] = getLocalDateString(targetDate);
    }
    localStorage.setItem('eng_study_history', JSON.stringify(history));
    alert(`🎉 记录成功！`);
    updateDailyDashboard();
}

function updateDailyDashboard() {
    const dashboard = document.getElementById('taskList');
    if (!dashboard) return;
    const today = new Date(); today.setHours(0,0,0,0);
    document.getElementById('todayDate').innerText = getLocalDateString(today);
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    let tasks = [];
    
    let maxGroup = 0;
    Object.keys(history).forEach(g => { if (parseInt(g) > maxGroup) maxGroup = parseInt(g); });
    tasks.push(`🆕 <b>新课：</b> 第 <a href="#" onclick="jumpToGroup(${maxGroup})" style="color: #f1c40f; font-weight: bold;">${maxGroup + 1}</a> 组`);

    let reviewLinks = [];
    for (let gNum in history) {
        const dateParts = history[gNum].split('-');
        const studyDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        const diffDays = Math.round((today.getTime() - studyDate.getTime()) / 86400000);
        if ([1, 3, 6].includes(diffDays)) {
            reviewLinks.push(`<a href="#" onclick="jumpToGroup(${gNum-1})" style="color: #f1c40f; font-weight: bold; margin-right:10px;">第 ${gNum} 组</a>`);
        }
    }
    if (reviewLinks.length > 0) tasks.push(`<br>🔄 <b>必复习：</b> ${reviewLinks.join('')}`);
    dashboard.innerHTML = tasks.join('');
}

function jumpToGroup(idx) {
    document.getElementById('groupSelect').value = idx;
    changeGroup();
}

// ================= 4. AI 智能故事生成 (方案三) =================
async function generateRevisionStory() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) return alert("请先在设置中保存 API Key");
    
    const bounds = getGroupBounds();
    let words = [];
    for (let i = bounds.start; i <= bounds.end; i++) {
        if(wordList[i]) words.push(wordList[i].en);
    }

    const btn = document.getElementById('btnGenStory');
    const contentBox = document.getElementById('aiStoryContent');
    btn.innerText = "⏳ AI 正在编写...";
    contentBox.style.display = 'block';
    contentBox.innerText = "正在串联单词: " + words.join(", ");

    const prompt = `使用以下单词编写一段励志短文(约100词)，单词需加粗。结尾附带中文翻译：[${words.join(", ")}]`;

    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content:prompt}], temperature: 0.7 })
        });
        const data = await response.json();
        const fullResult = data.choices[0].message.content;
        contentBox.innerHTML = fullResult.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        document.getElementById('btnShadowStory').style.display = 'block';
        btn.innerText = "重新生成故事";
    } catch (e) { contentBox.innerText = "生成失败，检查 API Key"; }
}

function transferStoryToArticle() {
    const aiContent = document.getElementById('aiStoryContent').innerText;
    const parts = aiContent.split('---');
    currentArticleText = parts[0].trim();
    switchTab('articles');
    document.getElementById('articleDisplay').innerHTML = `<b>AI 复习文章：</b><br>${parts[0]}<hr><small>${parts[1]||""}</small>`;
}

// ================= 5. 文章跟读与听写 =================
function initArticleSelect() {
    const startSel = document.getElementById('articleStartSelect');
    const endSel = document.getElementById('articleEndSelect');
    startSel.innerHTML = ''; endSel.innerHTML = '';
    articleList.forEach((_, i) => {
        startSel.add(new Option(`第 ${i+1} 段`, i));
        endSel.add(new Option(`第 ${i+1} 段`, i));
    });
    changeArticleRange();
}

function changeArticleRange() {
    const start = parseInt(document.getElementById('articleStartSelect').value);
    const end = parseInt(document.getElementById('articleEndSelect').value);
    const selected = articleList.slice(start, end + 1);
    document.getElementById('articleDisplay').innerHTML = selected.map(item => 
        `<div style="margin-bottom:12px;">${item.en}<br><small style="color:#7f8c8d">${item.zh}</small></div>`
    ).join('');
    currentArticleText = selected.map(item => item.en).join(' ');
}

function speakArticle() {
    window.speechSynthesis.cancel();
    activeUtterance = new SpeechSynthesisUtterance(currentArticleText);
    activeUtterance.lang = 'en-US';
    activeUtterance.rate = parseFloat(document.getElementById('speedSelect').value);
    window.speechSynthesis.speak(activeUtterance);
}

function startListeningForArticle() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR(); recognition.lang = 'en-US';
    const diffBox = document.getElementById('diffResult');
    diffBox.style.display = 'block';
    document.getElementById('diffContent').innerText = "🎤 正在聆听...";
    recognition.start();
    recognition.onresult = (e) => {
        const spoken = e.results[0][0].transcript;
        diffBox.innerHTML = `你读的是: "${spoken}"<br><small>智能比对功能开发中...</small>`;
    };
}

// ================= 6. 聊天功能 =================
function switchChatMode(mode) {
    currentChatMode = mode;
    document.getElementById('modeBtnEng').classList.toggle('active', mode === 'eng');
    document.getElementById('modeBtnChn').classList.toggle('active', mode === 'chn');
    document.getElementById('chatLog').innerHTML = `<div class="chat-bubble bubble-ai">${mode==='eng'?'Hi! Let\'s chat!':'你好！我是中文助手。'}</div>`;
}

async function sendChatMessage() {
    const input = document.getElementById('chatMsgInput');
    const text = input.value.trim();
    if (!text) return;
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) return alert("请保存 Key");
    
    appendChatBubble(text, 'user');
    input.value = '';
    const loadingId = appendChatBubble("⏳ ...", 'ai');
    
    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content: text}] })
        });
        const data = await response.json();
        updateChatBubble(loadingId, data.choices[0].message.content);
    } catch (e) { updateChatBubble(loadingId, "Error"); }
}

// 基础辅助函数
function switchTab(t) {
    document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-'+t).classList.add('active');
    document.getElementById('btn-'+t).classList.add('active');
}
function appendChatBubble(t, s) {
    const id = "msg-" + Date.now();
    const div = document.createElement('div');
    div.className = `chat-bubble bubble-${s}`; div.id = id; div.innerText = t;
    document.getElementById('chatLog').appendChild(div);
    return id;
}
function updateChatBubble(id, t) { document.getElementById(id).innerText = t; }
function toggleSettings() {
    const s = document.getElementById('settingsCard');
    s.style.display = s.style.display === 'none' ? 'block' : 'none';
}
function saveApiKey() {
    const k = document.getElementById('siliconApiKey').value.trim();
    localStorage.setItem('silicon_api_key', k);
    alert("已保存"); toggleSettings();
}

// ... 拼写、测验等函数逻辑同上，由于篇幅原因省略，请确保你原始代码中的 startGroupTest 等函数依然保留 ...
/**
 * AI 英语私教 - 终极整合版 v12.0
 * 功能：云端同步 + 1247看板 + 生词本 + 记忆宫殿 + AI故事 + 翻译挑战 + 回译挑战
 */

// ================= [0] 配置区 =================
const SB_URL = 'https://bhilewmilbhxowxwwyfq.supabase.co'; 
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoaWxld21pbGJoeG93eHd3eWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTYyNTUsImV4cCI6MjA5MjUzMjI1NX0._Kj-4i2KTU7LO07AwNkKAta-0qluh4BygU_OMwAKc6o'; 

let supabaseClient = null;
try {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SB_URL, SB_KEY);
    }
} catch (e) { console.warn("Supabase 模式未就绪"); }

// ================= [1] 全局变量 =================
let wordList = [];
let currentWordIndex = 0;
let articleList = [];
let currentArticleText = "";
let articleSentences = [];
let currentSentenceIdx = 0;
let sentenceReplayTimer = null;
let currentChatMode = 'eng';
let chatHistory = [];
let isWrongBookMode = false; // 生词本模式开关

// 挑战相关变量
let translationTasks = [];
let copySentenceQueue = [];
let currentCopyCount = 0;
let artChallengeData = [];
let groupTestAnswers = [];
let groupTestBounds = null;

// ================= [2] 工具函数 =================

function getLocalDateString(date) {
    let y = date.getFullYear();
    let m = (date.getMonth() + 1).toString().padStart(2, '0');
    let d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getGroupBounds() {
    const select = document.getElementById('groupSelect');
    if (!select || select.value === 'all' || select.value === 'wrong_book') {
        return { start: 0, end: wordList.length - 1, total: wordList.length };
    }
    const start = parseInt(select.value) * 10;
    const end = Math.min(start + 9, wordList.length - 1);
    return { start: start, end: end, total: end - start + 1 };
}

// ================= [3] 初始化逻辑 =================

window.onload = function() {
    console.log("🚀 程序正在初始化...");
    
    // 监听云端状态
    if (supabaseClient) {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (session) {
                document.getElementById('authSection').style.display = 'none';
                document.getElementById('userSection').style.display = 'block';
                document.getElementById('userEmailDisplay').innerText = "Hi, " + session.user.email;
                pullFromCloud(); 
            }
        });
    }

    loadAllData();

    const savedKey = localStorage.getItem('silicon_api_key');
    if (savedKey) {
        document.getElementById('siliconApiKey').value = savedKey;
        document.getElementById('settingsCard').style.display = 'none';
    }

    switchTab('words');
    updateDailyDashboard();
    setInterval(updateDailyDashboard, 20000);

    // 同步看板组号显示
    setInterval(() => {
        const select = document.getElementById('groupSelect');
        const span = document.getElementById('currentActiveGNum');
        if(select && span) span.innerText = (select.value === 'all' ? '全' : (select.value === 'wrong_book' ? '生词' : parseInt(select.value) + 1));
    }, 500);
};

// ================= [4] 数据加载 (3行格式) =================

async function loadAllData() {
    let book = localStorage.getItem('selected_book_path') || 'default';
    let wPath = book === 'default' ? 'NewWords.txt' : `books/${book}/NewWords.txt`;
    let tPath = book === 'default' ? 'Texts.txt' : `books/${book}/Texts.txt`;

    try {
        const wRes = await fetch(wPath + '?t=' + Date.now());
        if (wRes.ok) {
            const wText = await wRes.text();
            const rawLines = wText.split(/\r?\n/).map(w => w.trim()).filter(w => w.length > 0);
            wordList = [];
            for (let i = 0; i < rawLines.length; i += 3) {
                const parts = rawLines[i].split(/\||:|：/);
                wordList.push({
                    en: parts[0].trim(),
                    zh: parts.length > 1 ? parts[1].trim() : "暂无释义",
                    ex: rawLines[i + 1] || "No example.",
                    hook: rawLines[i + 2] || "未设置记忆宫殿。"
                });
            }
            initGroupSelect();
            updateWordDisplay();
        }
        const aRes = await fetch(tPath + '?t=' + Date.now());
        if (aRes.ok) {
            const aText = await aRes.text();
            const allLines = aText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            articleList = [];
            for (let i = 0; i < allLines.length; i += 2) {
                articleList.push({ en: allLines[i], zh: allLines[i+1] || "" });
            }
            initArticleSelect();
        }
    } catch (e) { console.error("加载数据出错", e); }
}

// ================= [5] 单词与生词系统 =================

function initGroupSelect() {
    const select = document.getElementById('groupSelect');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '';
    
    const groupCount = Math.ceil(wordList.length / 10);
    for (let i = 0; i < groupCount; i++) {
        select.add(new Option(`📦 第 ${i + 1} 组`, i));
    }
    select.add(new Option(`📚 全部练习`, 'all'));

    // 生词本逻辑
    let wrongWords = JSON.parse(localStorage.getItem('eng_wrong_words') || '[]');
    if (wrongWords.length > 0) {
        let opt = new Option(`❤️ 生词本 (${wrongWords.length} 词)`, 'wrong_book');
        opt.style.color = "red";
        select.add(opt);
    }
    
    // 更新看板
    const countSpan = document.getElementById('wrongWordsCount');
    const staticArea = document.getElementById('wrongWordsStatic');
    if (countSpan) countSpan.innerText = wrongWords.length;
    if (staticArea) staticArea.style.display = wrongWords.length > 0 ? 'block' : 'none';

    select.value = currentVal || 0;
}

function updateWordDisplay() {
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    
    if (source.length === 0) {
        if (isWrongBookMode) {
            alert("👏 太棒了！生词已全部消灭！");
            isWrongBookMode = false;
            document.getElementById('groupSelect').value = 0;
            changeGroup();
        }
        return;
    }

    if (currentWordIndex >= source.length) currentWordIndex = 0;
    const wordObj = source[currentWordIndex];
    const bounds = isWrongBookMode ? {start:0, total: source.length} : getGroupBounds();

    const wordEl = document.getElementById('targetWord');
    wordEl.innerText = wordObj.en;
    
    const counterEl = document.getElementById('wordCounter');
    if (counterEl) {
        const curNum = isWrongBookMode ? (currentWordIndex + 1) : (currentWordIndex - bounds.start + 1);
        const totalNum = isWrongBookMode ? source.length : bounds.total;
        counterEl.innerText = `${curNum} / ${totalNum}`;
    }
    
    const zhEl = document.getElementById('chineseMeaning');
    zhEl.innerText = wordObj.zh; zhEl.style.display = 'none';

    const exBox = document.getElementById('exampleSentence');
    const exParts = wordObj.ex.split("中文：");
    exBox.innerHTML = exParts.length > 1 ? 
        `<div style="font-weight:600; color:#2c3e50; margin-bottom:8px;">${exParts[0].trim()}</div><div style="color:#8e8e93; font-size:0.95em; border-top:1px solid #f0f0f0; padding-top:8px;">译: ${exParts[1].trim()}</div>` : 
        wordObj.ex;
    exBox.style.display = 'none';
    
    document.getElementById('wordResult').innerText = "";
    document.getElementById('dictationResult').innerText = "";
    
    // 自动清晰/模糊处理
    const isTesting = document.getElementById('dictationGroupMode').style.display === 'block';
    wordEl.style.filter = isTesting ? 'blur(8px)' : 'none';
}

function checkDictation() {
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    if (source.length === 0) return;

    const input = document.getElementById('dictationInput').value.trim().toLowerCase();
    const targetObj = source[currentWordIndex];
    const target = targetObj.en.toLowerCase();
    const resEl = document.getElementById('dictationResult');
    let wrongWords = JSON.parse(localStorage.getItem('eng_wrong_words') || '[]');

    if (input === target) {
        resEl.style.color = "green"; resEl.innerText = "✅ 正确！";
        document.getElementById('targetWord').style.filter = "none";
        // 写对移除
        wrongWords = wrongWords.filter(item => item.en.toLowerCase() !== target);
        localStorage.setItem('eng_wrong_words', JSON.stringify(wrongWords));
        initGroupSelect();
        setTimeout(nextWord, 1500);
    } else {
        resEl.style.color = "red"; resEl.innerText = "❌ 拼写有误";
        // 写错加入
        if (!wrongWords.some(item => item.en.toLowerCase() === target)) {
            wrongWords.push(targetObj);
            localStorage.setItem('eng_wrong_words', JSON.stringify(wrongWords));
            initGroupSelect();
        }
        document.getElementById('dictationInput').select();
    }
    pushToCloud();
}

function jumpToWrongBook() {
    const select = document.getElementById('groupSelect');
    if (select) {
        select.value = 'wrong_book';
        changeGroup();
        document.getElementById('page-words').scrollIntoView({ behavior: 'smooth' });
    }
}

// ================= [6] 测验模块 =================

function startGroupTest() {
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    let bounds = getGroupBounds();
    groupTestBounds = isWrongBookMode ? { start: 0, end: source.length - 1, total: source.length } : bounds;
    
    if (source.length === 0) return alert("没有单词可以测试");
    groupTestAnswers = []; 
    groupTestCurrentIndex = 0;

    document.getElementById('dictationSingleMode').style.display = 'none';
    document.getElementById('dictationGroupMode').style.display = 'block';
    document.getElementById('dictationResultMode').style.display = 'none';
    document.getElementById('targetWord').style.filter = 'blur(8px)';
    playTestWord();
}

function playTestWord() {
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    const wordObj = source[groupTestBounds.start + groupTestCurrentIndex];
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(wordObj.en); u.lang = 'en-US';
    window.speechSynthesis.speak(u);
    document.getElementById('groupTestProgress').innerText = `测验中: ${groupTestCurrentIndex + 1} / ${groupTestBounds.total}`;
    setTimeout(() => document.getElementById('groupTestInput').focus(), 200);
}

function submitTestWord() {
    groupTestAnswers.push(document.getElementById('groupTestInput').value.trim());
    document.getElementById('groupTestInput').value = "";
    groupTestCurrentIndex++;
    if (groupTestCurrentIndex < groupTestBounds.total) playTestWord();
    else showGroupTestResult();
}

function showGroupTestResult() {
    document.getElementById('dictationGroupMode').style.display = 'none';
    document.getElementById('dictationResultMode').style.display = 'block';
    let correctCount = 0, html = "";
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    let wrongWordsBook = JSON.parse(localStorage.getItem('eng_wrong_words') || '[]');

    for (let i = 0; i < groupTestBounds.total; i++) {
        const target = source[groupTestBounds.start + i];
        const isOk = groupTestAnswers[i].toLowerCase().trim() === target.en.toLowerCase().trim();
        if (isOk) {
            correctCount++;
            wrongWordsBook = wrongWordsBook.filter(item => item.en.toLowerCase() !== target.en.toLowerCase());
        } else {
            if (!wrongWordsBook.some(item => item.en.toLowerCase() === target.en.toLowerCase())) wrongWordsBook.push(target);
        }
        html += `<li class="${isOk ? 'correct-item' : 'incorrect-item'}"><b>${target.en}</b>: ${isOk ? '✅' : '❌ ' + groupTestAnswers[i]}<br><small>${target.zh}</small></li>`;
    }
    localStorage.setItem('eng_wrong_words', JSON.stringify(wrongWordsBook));
    document.getElementById('groupTestScore').innerText = `正确率: ${Math.round(correctCount/groupTestBounds.total*100)}%`;
    document.getElementById('groupTestResultList').innerHTML = html;
    initGroupSelect(); pushToCloud();
}

function quitGroupTest() {
    document.getElementById('dictationGroupMode').style.display = 'none';
    document.getElementById('dictationResultMode').style.display = 'none';
    document.getElementById('dictationSingleMode').style.display = 'block';
    document.getElementById('targetWord').style.filter = 'none';
    updateWordDisplay();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ================= [7] 看板逻辑 =================

function updateDailyDashboard() {
    const dashboard = document.getElementById('taskList');
    if (!dashboard) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const dateSpan = document.getElementById('todayDate');
    if (dateSpan) dateSpan.innerText = getLocalDateString(today);

    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    let tasks = [];
    let maxG = 0; Object.keys(history).forEach(g => { if(parseInt(g)>maxG) maxG=parseInt(g); });
    tasks.push(`🆕 <b>新课：</b> 第 <a href="#" onclick="jumpToGroup(${maxG})" style="color:#f1c40f; font-weight:bold;">${maxG+1}</a> 组`);

    let review = [];
    for (let g in history) {
        const parts = history[g].split('-');
        const d = new Date(parts[0], parts[1]-1, parts[2]);
        const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
        if ([1, 3, 6].includes(diff)) review.push(`<a href="#" onclick="jumpToGroup(${g-1})" style="color:#f1c40f; font-weight:bold; margin-right:10px;">第 ${g} 组</a>`);
    }
    if (review.length) tasks.push(`<br>🔄 <b>必复习：</b> ${review.reverse().join('')}`);
    dashboard.innerHTML = tasks.join('');
}

function markCurrentGroupFinished() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all' || val === 'wrong_book') return alert("请先选择具体的组号。");
    const currentGNum = parseInt(val) + 1;
    const today = new Date(); today.setHours(0,0,0,0);
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    for (let i = 1; i <= currentGNum; i++) {
        let target = new Date(today);
        if (i === currentGNum - 1) target.setDate(today.getDate() - 1);
        else if (i === currentGNum - 3) target.setDate(today.getDate() - 3);
        else if (i === currentGNum - 6) target.setDate(today.getDate() - 6);
        else if (i < currentGNum) target.setDate(today.getDate() - 20);
        history[i] = getLocalDateString(target);
    }
    localStorage.setItem('eng_study_history', JSON.stringify(history));
    updateDailyDashboard(); pushToCloud();
    alert("🎉 记录成功并同步！");
}

function jumpToGroup(idx) { 
    const select = document.getElementById('groupSelect');
    if(select) { select.value = idx; changeGroup(); }
}

// ================= [8] AI 生成功能 (故事/宫殿) =================

async function generateGroupStory() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) return alert("请先设置 API Key");
    const bounds = getGroupBounds();
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    let words = []; for(let i=bounds.start; i<=bounds.end; i++) if(source[i]) words.push(source[i].en);
    const box = document.getElementById('groupStoryContent');
    document.getElementById('groupStoryArea').style.display="block";
    box.innerHTML = "⏳ AI 正在严格构思防崩溃故事...";

    const prompt = `Task: Write a simple story with these words: [${words.join(", ")}]. Bold them like **word**. English first, then '---', then Chinese translation. No repetition.`;

    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({
                model:'Qwen/Qwen2.5-7B-Instruct', 
                messages: [{role:"user", content: prompt}],
                temperature: 0.1, frequency_penalty: 2.0, max_tokens: 600
            })
        });
        const data = await res.json();
        let txt = data.choices[0].message.content.trim();
        // 物理去重过滤
        let rawArr = txt.split(/\s+/), cleanArr = [];
        for(let i=0; i<rawArr.length; i++) if(i===0 || rawArr[i].toLowerCase()!==rawArr[i-1].toLowerCase()) cleanArr.push(rawArr[i]);
        box.innerHTML = cleanArr.join(' ').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b style="color:#e67e22; background:#fff5eb;">$1</b>');
    } catch(e) { box.innerText = "生成失败"; }
}

function generateGroupMemoryPalace() {
    const bounds = getGroupBounds(); const area = document.getElementById('memoryPalaceArea'); const content = document.getElementById('palaceContent');
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    let html = ""; for (let i = bounds.start; i <= bounds.end; i++) if (source[i]) html += `<div style="margin-bottom:12px; border-bottom:1px dashed #eee; padding-bottom:8px;"><b>${i - bounds.start + 1}. ${source[i].en}</b> [${source[i].zh}]<br><small>${source[i].hook}</small></div>`;
    area.style.display = 'block'; content.innerHTML = html; area.scrollIntoView({ behavior: 'smooth' });
}

// ================= [9] 翻译与文章挑战逻辑 =================

async function startTranslationChallenge() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if(!apiKey) return alert("请存 Key");
    document.getElementById('transSetup').style.display = 'none';
    document.getElementById('transWorking').style.display = 'block';
    const qBox = document.getElementById('transQuestions');
    qBox.innerHTML = "⏳ AI 老师正在出题...";
    const bounds = getGroupBounds();
    let words = []; for(let i=bounds.start; i<=bounds.end; i++) if(wordList[i]) words.push(wordList[i].en);
    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content: `针对词[${words.join(",")}]出3道纯中文翻译题，严禁英文和括号。每行一句。`}]})
        });
        const data = await res.json();
        const lines = data.choices[0].message.content.trim().split('\n').filter(l => l.trim().length > 3).slice(0,3);
        translationTasks = lines.map(l => ({ cn: l.replace(/[\[\]]/g, '').replace(/^\d+[\.、\s]+/, '').trim(), userEn: '' }));
        qBox.innerHTML = translationTasks.map((t, i) => `<div style="margin-bottom:10px;">Q${i+1}: ${t.cn}<input type="text" class="trans-user-input" data-idx="${i}" style="margin-top:5px;"></div>`).join('');
    } catch(e) { alert("出题失败"); }
}

async function gradeTranslations() {
    const apiKey = localStorage.getItem('silicon_api_key');
    const inputs = document.querySelectorAll('.trans-user-input');
    inputs.forEach(input => translationTasks[input.dataset.idx].userEn = input.value.trim());
    document.getElementById('btnSubmitTrans').innerText = "批改中...";
    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({
                model:'Qwen/Qwen2.5-7B-Instruct', 
                messages: [{role:"user", content: `Translate: ${translationTasks.map(t=>t.cn).join(' | ')}. English only, split by ###.`}],
                temperature: 0.1, frequency_penalty: 1.5
            })
        });
        const data = await res.json();
        const corrects = data.choices[0].message.content.split('###').map(s => s.trim().replace(/[\u4e00-\u9fa5]/g, '').split(' ').filter((v,i,a) => v!==a[i-1]).join(' '));
        copySentenceQueue = [];
        let html = "<h3>批改结果：</h3>";
        translationTasks.forEach((t, i) => {
            const correct = corrects[i] || "AI Error"; copySentenceQueue.push(correct);
            html += `<div style="margin-bottom:10px; border:1px solid #eee; padding:10px; border-radius:10px; background:white;"><p>${t.cn}</p><div style="display:flex; gap:10px;"><div style="flex:1; color:red;">${t.userEn}</div><div style="flex:1; color:green;"><b>${correct}</b></div></div></div>`;
        });
        document.getElementById('transComparisonArea').innerHTML = html;
        document.getElementById('transWorking').style.display = 'none';
        document.getElementById('transResult').style.display = 'block';
        startCopyExercise();
    } catch(e) { alert("批改失败"); }
}

// 回译挑战逻辑
async function startArticleChallenge() {
    const endIdx = parseInt(document.getElementById('articleEndSelect').value);
    const pool = articleList.slice(0, endIdx + 1);
    if (pool.length < 3) return alert("段落不足 3 个");
    let selected = []; while (selected.length < 3) { let r = Math.floor(Math.random() * pool.length); if (!selected.includes(r)) selected.push(r); }
    artChallengeData = selected.map(i => pool[i]);
    document.getElementById('artChallengeSetup').style.display = 'none';
    document.getElementById('artChallengeWorking').style.display = 'block';
    document.getElementById('artChallengeQuestions').innerHTML = artChallengeData.map((t, i) => `<div style="margin-bottom:15px;"><p style="background:#FFFBE6; padding:8px; border-radius:8px;">${t.zh}</p><textarea class="art-user-input" rows="2"></textarea></div>`).join('');
}

async function gradeArticleChallenge() {
    const apiKey = localStorage.getItem('silicon_api_key');
    const inputs = document.querySelectorAll('.art-user-input');
    document.getElementById('artChallengeWorking').style.display = 'none';
    document.getElementById('artChallengeResult').style.display = 'block';
    const fbBox = document.getElementById('artChallengeComparison');
    fbBox.innerHTML = "⏳ 阅卷中...";
    let prompt = `Compare: ${artChallengeData.map((t,i)=> `Q${i+1} Orig:[${t.en}], User:[${inputs[i].value}]`).join('\n')}. Use tags <p1>, <p2>, <p3> for feedback.`;
    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content:prompt}]})
        });
        const data = await res.json(); const raw = data.choices[0].message.content; let html = "";
        artChallengeData.forEach((t, i) => {
            const match = raw.match(new RegExp(`<p${i+1}>([\\s\\S]*?)<\\/p${i+1}>`));
            html += `<div style="margin-bottom:12px; border:1px solid #ddd; padding:10px; border-radius:12px;"><b>${t.en}</b><br><small>点评：${match?match[1]:"OK"}</small></div>`;
        });
        fbBox.innerHTML = html;
    } catch(e) { fbBox.innerHTML = "失败"; }
}

// ================= [10] 语音/聊天/辅助 =================

function readTargetWord() {
    window.speechSynthesis.cancel();
    const word = document.getElementById('targetWord').innerText;
    const u = new SpeechSynthesisUtterance(word); u.lang = 'en-US';
    window.speechSynthesis.speak(u);
}

function startChatVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR(); rec.lang = (currentChatMode === 'eng' ? 'en-US' : 'zh-CN');
    rec.start();
    rec.onresult = (e) => { document.getElementById('chatMsgInput').value = e.results[0][0].transcript; sendChatMessage(); };
}

async function sendChatMessage() {
    const input = document.getElementById('chatMsgInput');
    const txt = input.value.trim(); if(!txt) return;
    const key = localStorage.getItem('silicon_api_key');
    if(!key) return alert("请存 Key");
    appendChatBubble(txt, 'user'); input.value = ""; chatHistory.push({role:"user", content:txt});
    const loadingId = appendChatBubble("⏳ ...", 'ai');
    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: chatHistory})
        });
        const data = await res.json(); const aiTxt = data.choices[0].message.content;
        chatHistory.push({role:"assistant", content:aiTxt});
        document.getElementById(loadingId).innerText = aiTxt;
    } catch (e) { document.getElementById(loadingId).innerText = "Error"; }
}

// 云端拉取
async function pullFromCloud() {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const { data } = await supabaseClient.from('user_progress').select('data').single();
    if (data && data.data) {
        let changed = false;
        for (let key in data.data) { if (data.data[key] && localStorage.getItem(key) !== data.data[key]) { localStorage.setItem(key, data.data[key]); changed = true; } }
        if (changed) location.reload();
    }
}

// 常规辅助
function switchTab(t) {
    document.querySelectorAll('.page-section').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-' + t).style.display = 'block';
    document.getElementById('btn-' + t).classList.add('active');
    const b = document.getElementById('bookSelectorContainer'); if(b) b.style.display = (t === 'chat' ? 'none' : 'flex');
}
function changeGroup() {
    const val = document.getElementById('groupSelect').value;
    isWrongBookMode = (val === 'wrong_book');
    currentWordIndex = isWrongBookMode ? 0 : getGroupBounds().start;
    updateWordDisplay();
}
function restartWords() { currentWordIndex = isWrongBookMode ? 0 : getGroupBounds().start; updateWordDisplay(); }
function toggleMeaning() { const el = document.getElementById('chineseMeaning'); el.style.display = el.style.display === 'none' ? 'block' : 'none'; }
function toggleBlur() { const el = document.getElementById('targetWord'); el.style.filter = el.style.filter === 'blur(8px)' ? 'none' : 'blur(8px)'; }
function showAndPlayExample() { document.getElementById('exampleSentence').style.display='block'; let t = document.getElementById('exampleSentence').innerText.split('译:')[1] ? document.getElementById('exampleSentence').innerText.split('译:')[0] : document.getElementById('exampleSentence').innerText; window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t.replace(/[^\x00-\xff]/g, '')); u.lang='en-US'; window.speechSynthesis.speak(u); }
function changeBook() { localStorage.setItem('selected_book_path', document.getElementById('bookSelect').value); location.reload(); }
function saveApiKey() { localStorage.setItem('silicon_api_key', document.getElementById('siliconApiKey').value.trim()); alert("已保存"); }
function handleLogin() { const email = document.getElementById('syncEmail').value; if(supabaseClient) supabaseClient.auth.signInWithOtp({ email }).then(() => alert("验证邮件已发送")); }
function handleLogout() { if(supabaseClient) supabaseClient.auth.signOut().then(() => location.reload()); }
function manualPush() { pushToCloud().then(() => alert("同步完成")); }
function closeMemoryPalace() { document.getElementById('memoryPalaceArea').style.display = 'none'; }
function switchChatMode(m) { currentChatMode = m; document.getElementById('modeBtnEng').classList.toggle('active', m==='eng'); document.getElementById('modeBtnChn').classList.toggle('active', m==='chn'); document.getElementById('chatLog').innerHTML = `<div class="chat-bubble bubble-ai">${m==='eng'?"Hi!":"你好"}</div>`; chatHistory=[{role:"system",content:m==='eng'?"Teacher":"Assistant"}]; }
function appendChatBubble(t, s) { const id = "msg-" + Date.now(); const div = document.createElement('div'); div.className = `chat-bubble bubble-${s}`; div.id = id; div.innerText = t; document.getElementById('chatLog').appendChild(div); return id; }
function startCopyExercise() { currentCopyCount = 0; document.getElementById('copyExerciseArea').style.display = 'block'; updateCopyDisplay(); }
function updateCopyDisplay() { document.getElementById('copyTargetBox').innerText = copySentenceQueue[0]; document.getElementById('copyProgressText').innerText = `已完成: ${currentCopyCount}/5 遍`; document.getElementById('copyInput').value = ""; document.getElementById('copyInput').focus(); }
function resetTranslationChallenge() { document.getElementById('copyExerciseArea').style.display='none'; document.getElementById('transResult').style.display='none'; document.getElementById('transSetup').style.display='block'; }
function resetArtChallenge() { document.getElementById('artChallengeSetup').style.display = 'block'; document.getElementById('artChallengeResult').style.display = 'none'; }

// 其余文章、识别等小函数保持之前实现...
function initArticleSelect() {
    const s = document.getElementById('articleStartSelect'), e = document.getElementById('articleEndSelect');
    if(!s || !e) return;
    s.innerHTML = ''; e.innerHTML = ''; articleList.forEach((_, i) => { s.add(new Option(`第 ${i+1} 段`, i)); e.add(new Option(`第 ${i+1} 段`, i)); });
    changeArticleRange();
}
function changeArticleRange() {
    const s = parseInt(document.getElementById('articleStartSelect').value), e = parseInt(document.getElementById('articleEndSelect').value);
    const sel = articleList.slice(s, Math.max(s, e) + 1);
    document.getElementById('articleDisplay').innerHTML = sel.map(item => `<div style="margin-bottom:10px;">${item.en}<br><small style="color:#7f8c8d">${item.zh}</small></div>`).join('');
    currentArticleText = sel.map(item => item.en).join(' ');
}
function speakArticle() { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(currentArticleText); u.lang = 'en-US'; u.rate = parseFloat(document.getElementById('speedSelect').value); window.speechSynthesis.speak(u); }
function nextArticleRange() {
    const s = document.getElementById('articleStartSelect'), e = document.getElementById('articleEndSelect');
    let span = parseInt(e.value) - parseInt(s.value) + 1, nextS = parseInt(s.value) + span;
    if (nextS >= articleList.length) nextS = 0;
    s.value = nextS; e.value = Math.min(nextS + span - 1, articleList.length - 1); changeArticleRange();
}
function startArticleDictation() {
    articleSentences = currentArticleText.match(/[^.!?\n]+[.!?\n]+/g) || [currentArticleText];
    articleSentences = articleSentences.map(s => s.trim()).filter(s => s.length > 0);
    currentSentenceIdx = 0; document.getElementById('articleDictationSetup').style.display = 'none';
    document.getElementById('articleDictationRunning').style.display = 'block';
    document.getElementById('articleDisplay').style.filter = 'blur(8px)'; playCurrentSentence();
}
function playCurrentSentence() {
    clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel();
    const s = articleSentences[currentSentenceIdx]; document.getElementById('articleDictProgress').innerText = `听写: ${currentSentenceIdx+1}/${articleSentences.length}`;
    const h = document.getElementById('timerHint'); h.innerText = "🔊 第一遍..."; const u = new SpeechSynthesisUtterance(s); u.lang = 'en-US';
    u.onend = () => { h.innerText = "⏳ 10秒后..."; sentenceReplayTimer = setTimeout(() => { h.innerText = "🔊 第二遍..."; window.speechSynthesis.speak(u); }, 10000); };
    window.speechSynthesis.speak(u); setTimeout(()=>document.getElementById('articleDictInput').focus(), 200);
}
function checkArticleDictation() {
    const input = document.getElementById('articleDictInput').value.trim(); const res = document.getElementById('articleDictResult');
    res.style.display = 'block'; res.innerHTML = `写: ${input}<br>参: <b>${articleSentences[currentSentenceIdx]}</b>`;
    document.getElementById('btnNextSentence').style.display = 'block';
}
function nextDictationSentence() {
    currentSentenceIdx++; if (currentSentenceIdx >= articleSentences.length) { alert("🎉 听写挑战通关！"); quitArticleDictation(); }
    else { document.getElementById('articleDictResult').style.display = 'none'; document.getElementById('btnNextSentence').style.display = 'none'; document.getElementById('articleDictInput').value = ""; playCurrentSentence(); }
}
function startListeningForArticle() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; const rec = new SR(); rec.lang = 'en-US';
    const con = document.getElementById('diffContent'); document.getElementById('diffResult').style.display = 'block';
    con.innerText = "🎤 正在聆听你的发音..."; rec.start();
    rec.onresult = (e) => { const spoken = e.results[0][0].transcript; con.innerHTML = `听到了: "${spoken}"<br>${compareSentences(currentArticleText, spoken)}`; };
}
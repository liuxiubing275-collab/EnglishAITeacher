/**
 * AI 英语私教 - 终极功能整合版
 * 包含：基础控制、单词练习、拼写测验、1247看板、AI故事、记忆宫殿、文章听写、AI对话
 */

// ================= [1] 全局变量 =================
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

// ================= [2] 初始化与数据加载 =================
window.onload = function() {
    loadAllData();
    const savedKey = localStorage.getItem('silicon_api_key');
    if (savedKey) {
        document.getElementById('siliconApiKey').value = savedKey;
        document.getElementById('apiKeyStatus').innerText = "✅ API Key 已读取";
        document.getElementById('apiKeyStatus').style.color = "#27ae60";
        document.getElementById('settingsCard').style.display = 'none';
    }
    switchChatMode('eng');
    updateDailyDashboard();
    // 实时更新看板状态
    setInterval(() => {
        const val = document.getElementById('groupSelect').value;
        const gNum = val === 'all' ? '全' : parseInt(val) + 1;
        const activeSpan = document.getElementById('currentActiveGNum');
        if(activeSpan) activeSpan.innerText = gNum;
    }, 500);
};

async function loadAllData() {
    try {
        // 加载单词 (3行格式)
        const wRes = await fetch('NewWords.txt');
        if (wRes.ok) {
            const wText = await wRes.text();
            const rawLines = wText.split(/\r?\n/).map(w => w.trim()).filter(w => w.length > 0);
            wordList = [];
            for (let i = 0; i < rawLines.length; i += 3) {
                const parts = rawLines[i].split(/\||:|：/);
                wordList.push({
                    en: parts[0].trim(),
                    zh: parts.length > 1 ? parts[1].trim() : "暂无释义",
                    ex: rawLines[i + 1] || "暂无例句。",
                    hook: rawLines[i + 2] || "暂无记忆钩子。"
                });
            }
            if (wordList.length > 0) { initGroupSelect(); updateWordDisplay(); }
        }
        // 加载文章
        const aRes = await fetch('Texts.txt');
        if (aRes.ok) {
            const aText = await aRes.text();
            const allLines = aText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            articleList = [];
            for (let i = 0; i < allLines.length; i += 2) {
                articleList.push({ en: allLines[i], zh: allLines[i+1] || "" });
            }
            if (articleList.length > 0) initArticleSelect();
        }
    } catch (e) { console.error("数据加载失败", e); }
}

// ================= [3] 单词核心控制 (解决 restartWords 等报错) =================
function initGroupSelect() {
    const select = document.getElementById('groupSelect');
    select.innerHTML = `<option value="all">📚 全部练习 (${wordList.length} 词)</option>`;
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

    const exBox = document.getElementById('exampleSentence');
    exBox.innerHTML = `<div style="margin-bottom:8px;">${currentWord.ex}</div><div style="color:#8e44ad; font-weight:bold; font-size:14px; border-top:1px dashed #ddd; padding-top:5px;">🏰 ${currentWord.hook}</div>`;
    exBox.style.display = 'none';
    document.getElementById('wordResult').innerText = "";
    document.getElementById('dictationResult').innerText = "";
    document.getElementById('dictationInput').value = "";
    document.getElementById('targetWord').style.filter = 'none';
}

function changeGroup() { currentWordIndex = getGroupBounds().start; updateWordDisplay(); }

function nextWord() {
    const bounds = getGroupBounds();
    currentWordIndex++;
    if (currentWordIndex > bounds.end) currentWordIndex = bounds.start;
    updateWordDisplay();
}

function restartWords() { // <-- 修复报错
    currentWordIndex = getGroupBounds().start;
    updateWordDisplay();
}

function toggleBlur() { 
    const el = document.getElementById('targetWord');
    el.style.filter = el.style.filter === 'blur(8px)' ? 'none' : 'blur(8px)';
}

function toggleMeaning() { 
    const el = document.getElementById('chineseMeaning');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function showAndPlayExample() {
    document.getElementById('exampleSentence').style.display = 'block';
    const enPart = wordList[currentWordIndex].ex.replace(/[^\x00-\xff]/g, '').trim();
    if (enPart) {
        window.speechSynthesis.cancel();
        activeUtterance = new SpeechSynthesisUtterance(enPart);
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

function startListeningForWord() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("请使用 Safari 或 Chrome。");
    const rec = new SR(); rec.lang = 'en-US';
    const resEl = document.getElementById('wordResult');
    resEl.innerText = "正在聆听..."; rec.start();
    rec.onresult = (e) => {
        const spoken = e.results[0][0].transcript.toLowerCase().replace(/[.,!?]/g, '').trim();
        const target = wordList[currentWordIndex].en.toLowerCase().trim();
        if (spoken === target) { resEl.style.color="#27ae60"; resEl.innerHTML=`✅ 完美: "${spoken}"`; }
        else { resEl.style.color="#e74c3c"; resEl.innerHTML=`❌ 差一点: "${spoken}"`; }
    };
}

function checkDictation() {
    const input = document.getElementById('dictationInput').value.toLowerCase().trim();
    const target = wordList[currentWordIndex].en.toLowerCase().trim();
    const resEl = document.getElementById('dictationResult');
    if (!input) return;
    if (input === target) {
        resEl.style.color="#27ae60"; resEl.innerText="✅ 正确！";
        document.getElementById('targetWord').style.filter="none";
        setTimeout(nextWord, 1500);
    } else { resEl.style.color="#e74c3c"; resEl.innerText="❌ 错误。"; }
}

// ================= [4] 单词组测验逻辑 =================
let groupTestAnswers = [];
let groupTestCurrentIndex = 0;
let groupTestBounds = null;

function startGroupTest() {
    groupTestBounds = getGroupBounds(); groupTestAnswers = []; groupTestCurrentIndex = 0;
    document.getElementById('dictationSingleMode').style.display = 'none';
    document.getElementById('dictationGroupMode').style.display = 'block';
    document.getElementById('dictationResultMode').style.display = 'none';
    playTestWord();
}

function playTestWord() {
    const word = wordList[groupTestBounds.start + groupTestCurrentIndex].en;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word); u.lang = 'en-US';
    window.speechSynthesis.speak(u);
    document.getElementById('groupTestProgress').innerText = `测验中: ${groupTestCurrentIndex+1} / ${groupTestBounds.total}`;
    setTimeout(()=>document.getElementById('groupTestInput').focus(), 200);
}

function submitTestWord() {
    const val = document.getElementById('groupTestInput').value.trim();
    groupTestAnswers.push(val);
    document.getElementById('groupTestInput').value = "";
    groupTestCurrentIndex++;
    if (groupTestCurrentIndex < groupTestBounds.total) playTestWord();
    else showGroupTestResult();
}

function showGroupTestResult() {
    document.getElementById('dictationGroupMode').style.display = 'none';
    document.getElementById('dictationResultMode').style.display = 'block';
    let correct = 0; let html = "";
    for (let i=0; i<groupTestBounds.total; i++) {
        const target = wordList[groupTestBounds.start + i];
        const isOk = groupTestAnswers[i].toLowerCase() === target.en.toLowerCase();
        if (isOk) correct++;
        html += `<li class="${isOk?'correct-item':'incorrect-item'}"><b>${target.en}</b>: ${isOk?'✅':'❌ 你写了: '+groupTestAnswers[i]}<br><small>${target.zh}</small></li>`;
    }
    document.getElementById('groupTestScore').innerText = `正确率: ${Math.round(correct/groupTestBounds.total*100)}%`;
    document.getElementById('groupTestResultList').innerHTML = html;
}

function quitGroupTest() {
    document.getElementById('dictationGroupMode').style.display = 'none';
    document.getElementById('dictationResultMode').style.display = 'none';
    document.getElementById('dictationSingleMode').style.display = 'block';
    document.getElementById('targetWord').style.filter = 'none';
}

// ================= [5] 1247 看板逻辑 =================
function getLocalDateString(date) {
    let y = date.getFullYear();
    let m = (date.getMonth() + 1).toString().padStart(2, '0');
    let d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function markCurrentGroupFinished() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all') return alert("请选择具体组。");
    const currentGNum = parseInt(val) + 1;
    const today = new Date(); today.setHours(0,0,0,0);
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    for (let i = 1; i <= currentGNum; i++) {
        let target = new Date(today);
        if (i === currentGNum) {} 
        else if (i === currentGNum - 1) target.setDate(today.getDate() - 1);
        else if (i === currentGNum - 3) target.setDate(today.getDate() - 3);
        else if (i === currentGNum - 6) target.setDate(today.getDate() - 6);
        else target.setDate(today.getDate() - 20);
        history[i] = getLocalDateString(target);
    }
    localStorage.setItem('eng_study_history', JSON.stringify(history));
    alert("🎉 记录成功！复习清单已更新。");
    updateDailyDashboard();
}

function updateDailyDashboard() {
    const dashboard = document.getElementById('taskList');
    if (!dashboard) return;
    const today = new Date(); today.setHours(0,0,0,0);
    document.getElementById('todayDate').innerText = getLocalDateString(today);
    let history = JSON.parse(localStorage.getItem('eng_study_history') || '{}');
    let tasks = [];
    let maxG = 0; Object.keys(history).forEach(g => { if(parseInt(g)>maxG) maxG=parseInt(g); });
    tasks.push(`🆕 <b>新课：</b> 第 <a href="#" onclick="jumpToGroup(${maxG})" style="color:#f1c40f; font-weight:bold;">${maxG+1}</a> 组`);
    let review = [];
    for (let g in history) {
        const parts = history[g].split('-');
        const d = new Date(parts[0], parts[1]-1, parts[2]);
        const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
        if ([1, 3, 6].includes(diff)) review.push(`<a href="#" onclick="jumpToGroup(${g-1})" style="color:#f1c40f; font-weight:bold; margin-right:8px;">第 ${g} 组</a>`);
    }
    if (review.length) tasks.push(`<br>🔄 <b>必复习：</b> ${review.reverse().join('')}`);
    dashboard.innerHTML = tasks.join('');
}

function jumpToGroup(idx) { document.getElementById('groupSelect').value = idx; changeGroup(); }

// ================= [6] AI 故事与宫殿生成 =================
async function generateRevisionStory() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) return alert("请保存 Key");
    const bounds = getGroupBounds();
    let words = []; for(let i=bounds.start; i<=bounds.end; i++) if(wordList[i]) words.push(wordList[i].en);
    const btn = document.getElementById('btnGenStory');
    const box = document.getElementById('aiStoryContent');
    btn.innerText = "⏳ AI 创作中..."; box.style.display="block"; box.innerText="正在构思故事...";
    const prompt = `用这些单词写一段励志短文并加粗，末尾附翻译：[${words.join(", ")}]`;
    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content:prompt}] })
        });
        const data = await res.json();
        const content = data.choices[0].message.content;
        box.innerHTML = content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        document.getElementById('btnShadowStory').style.display = 'block';
        btn.innerText = "重新生成故事";
    } catch (e) { box.innerText = "失败"; btn.innerText = "重试"; }
}

async function generateGroupMemoryPalace() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) return alert("请保存 Key");
    const bounds = getGroupBounds();
    let words = []; for(let i=bounds.start; i<=bounds.end; i++) if(wordList[i]) words.push(`${wordList[i].en}(${wordList[i].zh})`);
    const box = document.getElementById('palaceContent');
    document.getElementById('memoryPalaceArea').style.display="block";
    box.innerText = "正在构建记忆宫殿...";
    const prompt = `你是记忆宫殿专家，为这10个词分别提供荒诞夸张的视觉钩子：[${words.join(", ")}]。格式：1. 单词：描述`;
    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'Qwen/Qwen2.5-7B-Instruct', messages: [{role:"user", content:prompt}] })
        });
        const data = await res.json();
        box.innerHTML = data.choices[0].message.content.replace(/\n/g, '<br>').replace(/(\d+\.)/g, '<b style="color:#e67e22;">$1</b>');
    } catch (e) { box.innerText = "失败"; }
}

function transferStoryToArticle() {
    const text = document.getElementById('aiStoryContent').innerText;
    const parts = text.split('---');
    currentArticleText = parts[0].trim();
    switchTab('articles');
    document.getElementById('articleDisplay').innerHTML = `<div style="border-left:4px solid #8e44ad; padding-left:10px;"><b>AI故事：</b><br>${parts[0]}<hr><small>${parts[1]||""}</small></div>`;
    quitArticleDictation();
}

// ================= [7] 文章练习逻辑 (含翻页、听写) =================
function initArticleSelect() {
    const s = document.getElementById('articleStartSelect');
    const e = document.getElementById('articleEndSelect');
    s.innerHTML = ''; e.innerHTML = '';
    articleList.forEach((_, i) => { s.add(new Option(`第 ${i+1} 段`, i)); e.add(new Option(`第 ${i+1} 段`, i)); });
    changeArticleRange();
}

function changeArticleRange() {
    const startSel = document.getElementById('articleStartSelect');
    const endSel = document.getElementById('articleEndSelect');
    
    let startIdx = parseInt(startSel.value);
    let endIdx = parseInt(endSel.value);

    // 【修复逻辑】如果起始段落选得比结束段落还晚，强制同步
    if (startIdx > endIdx) {
        endIdx = startIdx;
        endSel.value = endIdx;
    }

    const selected = articleList.slice(startIdx, endIdx + 1);
    
    // 如果没有数据，显示提示
    if (selected.length === 0) {
        document.getElementById('articleDisplay').innerHTML = "未选中有效段落";
        return;
    }

    document.getElementById('articleDisplay').innerHTML = selected.map(item => 
        `<div style="margin-bottom:12px;">${item.en}<br><small style="color:#7f8c8d">${item.zh}</small></div>`
    ).join('');

    // 更新当前练习的纯英文文本
    currentArticleText = selected.map(item => item.en).join(' ');
    
    // 重置比对结果和听写状态
    document.getElementById('diffResult').style.display = 'none';
    quitArticleDictation();
}

function nextArticleRange() {
    const s = document.getElementById('articleStartSelect');
    const e = document.getElementById('articleEndSelect');
    let span = parseInt(e.value) - parseInt(s.value) + 1;
    let nextS = parseInt(s.value) + span;
    if (nextS >= articleList.length) nextS = 0;
    s.value = nextS; e.value = Math.min(nextS + span - 1, articleList.length - 1);
    changeArticleRange();
}

function speakArticle() {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(currentArticleText);
    u.lang = 'en-US'; u.rate = parseFloat(document.getElementById('speedSelect').value);
    window.speechSynthesis.speak(u);
}

function startListeningForArticle() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("您的浏览器不支持语音识别");

    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    const box = document.getElementById('diffResult');
    const con = document.getElementById('diffContent');

    box.style.display = 'block';
    box.style.borderColor = '#e67e22'; // 橙色表示正在听
    con.innerHTML = "🎤 <strong>请开始朗读...</strong>";

    recognition.start();

    recognition.onresult = (e) => {
        const spoken = e.results[0][0].transcript;
        
        // 【核心修改】：调用比对算法
        const diffHTML = compareSentences(currentArticleText, spoken);
        
        box.style.borderColor = '#27ae60'; // 识别成功变绿
        con.innerHTML = `
            <div style="margin-bottom: 10px; color: #7f8c8d; font-size: 14px; border-bottom: 1px dashed #eee; padding-bottom:5px;">
                <b>AI 听到的内容：</b><br>"${spoken}"
            </div>
            <div style="line-height: 1.8;">
                <b>比对结果（绿色为准确，红色为错漏）：</b><br>${diffHTML}
            </div>
        `;
    };

    recognition.onerror = () => {
        box.style.borderColor = '#e74c3c';
        con.innerHTML = "⚠️ 没听清，请点击按钮重试。";
    };
}

function compareSentences(original, spoken) {
    // 清洗文本：转小写，去掉标点
    let origWords = original.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/);
    let spokenWords = spoken.replace(/[.,!?'"]/g, '').toLowerCase().split(/\s+/);
    let originalRawWords = original.split(/\s+/); // 保留带标点的原词用于展示
    
    let resultHTML = [];
    let spokenIdx = 0;

    for (let i = 0; i < origWords.length; i++) {
        if (!origWords[i]) continue;
        
        let found = false;
        // 在说话内容中向后搜索3个词，防止漏读一个词导致全盘变红
        for (let j = spokenIdx; j < Math.min(spokenIdx + 3, spokenWords.length); j++) {
            if (origWords[i] === spokenWords[j]) {
                found = true;
                spokenIdx = j + 1;
                break;
            }
        }

        if (found) {
            resultHTML.push(`<span style="color: #27ae60; font-weight: bold;">${originalRawWords[i]}</span>`);
        } else {
            resultHTML.push(`<span style="color: #e74c3c; text-decoration: line-through;">${originalRawWords[i]}</span>`);
        }
    }
    return resultHTML.join(' ');
}

// 逐句听写 (黄金10秒)
function startArticleDictation() {
    articleSentences = currentArticleText.match(/[^.!?\n]+[.!?\n]+/g) || [currentArticleText];
    articleSentences = articleSentences.map(s => s.trim()).filter(s => s.length > 0);
    currentSentenceIdx = 0;
    document.getElementById('articleDictationSetup').style.display = 'none';
    document.getElementById('articleDictationRunning').style.display = 'block';
    document.getElementById('articleDisplay').style.filter = 'blur(8px)';
    updateArticleDictProgress(); playCurrentSentence();
}

function updateArticleDictProgress() {
    document.getElementById('articleDictProgress').innerText = `听写中: ${currentSentenceIdx+1} / ${articleSentences.length}`;
}

function playCurrentSentence() {
    clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel();
    const s = articleSentences[currentSentenceIdx];
    const hint = document.getElementById('timerHint');
    hint.innerText = "🔊 第一遍播放...";
    const u = new SpeechSynthesisUtterance(s); u.lang = 'en-US';
    u.onend = () => {
        hint.innerText = "⏳ 10秒后重播...";
        sentenceReplayTimer = setTimeout(() => {
            hint.innerText = "🔊 第二遍播放...";
            window.speechSynthesis.speak(u);
        }, 10000);
    };
    window.speechSynthesis.speak(u);
    setTimeout(()=>document.getElementById('articleDictInput').focus(), 200);
}

function checkArticleDictation() {
    clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel();
    const ans = articleSentences[currentSentenceIdx];
    const input = document.getElementById('articleDictInput').value.trim();
    const res = document.getElementById('articleDictResult');
    res.style.display = 'block';
    res.innerHTML = `你写了: ${input}<br>正确答案: <b>${ans}</b>`;
    document.getElementById('btnNextSentence').style.display = 'block';
}

function nextDictationSentence() {
    currentSentenceIdx++;
    if (currentSentenceIdx >= articleSentences.length) { alert("🎉 全部完成！"); quitArticleDictation(); }
    else {
        document.getElementById('articleDictResult').style.display = 'none';
        document.getElementById('btnNextSentence').style.display = 'none';
        document.getElementById('articleDictInput').value = "";
        updateArticleDictProgress(); playCurrentSentence();
    }
}

function quitArticleDictation() {
    clearTimeout(sentenceReplayTimer); window.speechSynthesis.cancel();
    document.getElementById('articleDictationRunning').style.display = 'none';
    document.getElementById('articleDictationSetup').style.display = 'block';
    document.getElementById('articleDisplay').style.filter = 'none';
}

// ================= [8] AI 对话 =================
function switchChatMode(mode) {
    currentChatMode = mode;
    document.getElementById('modeBtnEng').classList.toggle('active', mode==='eng');
    document.getElementById('modeBtnChn').classList.toggle('active', mode==='chn');
    document.getElementById('chatLog').innerHTML = `<div class="chat-bubble bubble-ai">${mode==='eng'?'Hi! I am your English teacher.':'你好！有什么我可以帮你的？'}</div>`;
    chatHistory = [{role:"system", content: mode==='eng'?'You are a friendly English teacher. Correct grammar only if it is a major mistake using <纠错>标签.':'你是全能中文助手。'}];
}

async function sendChatMessage() {
    const input = document.getElementById('chatMsgInput');
    const txt = input.value.trim(); if(!txt) return;
    const key = localStorage.getItem('silicon_api_key');
    if(!key) return alert("请存 Key");
    appendChatBubble(txt, 'user');
    input.value = ""; chatHistory.push({role:"user", content:txt});
    const loadingId = appendChatBubble("⏳ ...", 'ai');
    try {
        const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({model:'Qwen/Qwen2.5-7B-Instruct', messages: chatHistory})
        });
        const data = await res.json();
        const aiTxt = data.choices[0].message.content;
        chatHistory.push({role:"assistant", content:aiTxt});
        updateChatBubble(loadingId, aiTxt);
    } catch(e) { updateChatBubble(loadingId, "Error"); }
}

// ================= [9] 辅助功能 =================
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
    localStorage.setItem('silicon_api_key', k); alert("保存成功"); toggleSettings();
}

// ================= [10] AI 聊天语音识别 (补全功能) =================

function startChatVoice() {
    // 1. 检查浏览器兼容性
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        return alert("您的浏览器不支持语音识别，请在 iPhone Safari 或 Chrome 浏览器中使用。");
    }

    const recognition = new SpeechRecognition();
    
    // 2. 根据当前模式自动切换识别语言
    // 如果是英语私教模式，听英文；如果是中文助手模式，听中文
    recognition.lang = (currentChatMode === 'eng') ? 'en-US' : 'zh-CN';
    
    const inputEl = document.getElementById('chatMsgInput');
    const originalPlaceholder = inputEl.placeholder;
    
    // 3. 开始录音时的 UI 反馈
    inputEl.placeholder = "🎤 正在聆听，请说话...";
    recognition.start();

    // 4. 识别成功处理
    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        inputEl.value = transcript; // 将识别出的文字填入输入框
        inputEl.placeholder = originalPlaceholder;
        
        // 自动触发发送逻辑
        sendChatMessage();
    };

    // 5. 错误处理
    recognition.onerror = function(event) {
        console.error("语音识别错误:", event.error);
        inputEl.placeholder = "⚠️ 没听清，请重试...";
        setTimeout(() => {
            inputEl.placeholder = originalPlaceholder;
        }, 2000);
    };

    // 6. 结束录音
    recognition.onend = function() {
        if (inputEl.placeholder.includes("正在聆听")) {
            inputEl.placeholder = originalPlaceholder;
        }
    };
}

// ================= [补全功能] 11词成文逻辑 =================

async function generateGroupStory() {
    // 1. 获取 API Key
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) {
        alert("请先在‘互动聊天’版块设置并保存 API Key！");
        return;
    }

    // 2. 获取当前组单词
    const bounds = getGroupBounds();
    let currentWords = [];
    for (let i = bounds.start; i <= bounds.end; i++) {
        if (wordList[i] && wordList[i].en) {
            currentWords.push(wordList[i].en);
        }
    }

    if (currentWords.length === 0) {
        alert("当前组没有单词，请先选择一个单词组。");
        return;
    }

    // 3. UI 状态
    const storyArea = document.getElementById('groupStoryArea');
    const storyContent = document.getElementById('groupStoryContent');
    if (!storyArea) {
        alert("HTML中缺少 id='groupStoryArea' 的显示区域");
        return;
    }

    storyArea.style.display = 'block';
    storyContent.innerText = "正在构思故事...";
    storyArea.scrollIntoView({ behavior: 'smooth' });

    // 4. 发送 API 请求
    const prompt = `使用以下 10 个单词编写一段连贯的英语短文（约 100 词），单词需加粗。结尾附带中文翻译，中间用 --- 分隔：[${currentWords.join(", ")}]`;

    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'Qwen/Qwen2.5-7B-Instruct',
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7
            })
        });

        const data = await response.json();
        const fullText = data.choices[0].message.content;

        // 5. 渲染到界面
        storyContent.innerHTML = fullText
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e67e22;">$1</strong>');

    } catch (error) {
        console.error(error);
        storyContent.innerText = "⚠️ 生成失败，请检查网络或 API Key。";
    }
}

// 联动：同步到文章板块
function transferGroupStoryToArticle() {
    const storyBox = document.getElementById('groupStoryContent');
    if (!storyBox || storyBox.innerText.includes("正在构思")) return;

    const parts = storyBox.innerText.split('---');
    currentArticleText = parts[0].trim();
    
    switchTab('articles');
    
    const articleDisplay = document.getElementById('articleDisplay');
    articleDisplay.innerHTML = `
        <div style="border-left: 4px solid #8e44ad; padding-left: 10px; background: #fdf6ff;">
            <p style="color: #8e44ad; font-weight: bold;">✨ AI 单词挑战故事：</p>
            <p>${currentArticleText}</p>
            <p style="color: #7f8c8d; font-size: 14px;">${parts[1] || ""}</p>
        </div>
    `;
    quitArticleDictation();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

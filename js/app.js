/**
 * AI 英语私教 - 终极整合稳定版 v11.0
 */

// ================= [0] 基础配置 =================
const SB_URL = 'https://bhilewmilbhxowxwwyfq.supabase.co'; 
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoaWxld21pbGJoeG93eHd3eWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTYyNTUsImV4cCI6MjA5MjUzMjI1NX0._Kj-4i2KTU7LO07AwNkKAta-0qluh4BygU_OMwAKc6o'; 

let supabaseClient = null;
try {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SB_URL, SB_KEY);
    }
} catch (e) { console.warn("Supabase 模式未就绪"); }

// ================= [1] 全局状态 =================
let wordList = [];
let currentWordIndex = 0;
let articleList = [];
let currentArticleText = "";
let articleSentences = [];
let currentSentenceIdx = 0;
let sentenceReplayTimer = null;
let currentChatMode = 'eng';
let chatHistory = [];
let isWrongBookMode = false;

// 挑战相关变量
let translationTasks = [];
let copySentenceQueue = [];
let currentCopyCount = 0;
let artChallengeData = [];

// ================= [2] 核心工具函数 (必须放在最前面) =================

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

function switchTab(t) {
    document.querySelectorAll('.page-section').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const activePage = document.getElementById('page-' + t);
    if(activePage) activePage.style.display = 'block';
    const activeBtn = document.getElementById('btn-' + t);
    if(activeBtn) activeBtn.classList.add('active');
    const selector = document.getElementById('bookSelectorContainer');
    if(selector) selector.style.display = (t === 'chat' ? 'none' : 'flex');
}

// ================= [3] 初始化逻辑 =================

window.onload = function() {
    console.log("🚀 程序正在初始化...");
    
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
};

// ================= [4] 数据读取 =================

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

    let wrongWords = JSON.parse(localStorage.getItem('eng_wrong_words') || '[]');
    if (wrongWords.length > 0) {
        let opt = new Option(`❤️ 生词本 (${wrongWords.length} 词)`, 'wrong_book');
        opt.style.color = "red";
        select.add(opt);
    }
    
    const countSpan = document.getElementById('wrongWordsCount');
    if (countSpan) countSpan.innerText = wrongWords.length;
    const staticArea = document.getElementById('wrongWordsStatic');
    if (staticArea) staticArea.style.display = wrongWords.length > 0 ? 'block' : 'none';

    select.value = currentVal || 0;
}

function updateWordDisplay() {
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    if (source.length === 0) {
        if (isWrongBookMode) {
            alert("生词已清空！");
            isWrongBookMode = false;
            document.getElementById('groupSelect').value = 0;
            changeGroup();
        }
        return;
    }

    if (currentWordIndex >= source.length) currentWordIndex = 0;
    const wordObj = source[currentWordIndex];
    const bounds = isWrongBookMode ? {start:0, total: source.length} : getGroupBounds();

    document.getElementById('targetWord').innerText = wordObj.en;
    const counterEl = document.getElementById('wordCounter');
    if (counterEl) {
        const current = isWrongBookMode ? (currentWordIndex + 1) : (currentWordIndex - bounds.start + 1);
        const total = isWrongBookMode ? source.length : bounds.total;
        counterEl.innerText = `${current} / ${total}`;
    }
    
    const zhEl = document.getElementById('chineseMeaning');
    zhEl.innerText = wordObj.zh; zhEl.style.display = 'none';

    const exBox = document.getElementById('exampleSentence');
    const exParts = wordObj.ex.split("中文：");
    exBox.innerHTML = exParts.length > 1 ? 
        `<div style="font-weight:600;">${exParts[0]}</div><div style="color:#8e8e93; font-size:14px; margin-top:8px; border-top:1px solid #eee; padding-top:8px;">译: ${exParts[1]}</div>` : 
        wordObj.ex;
    exBox.style.display = 'none';
    
    document.getElementById('wordResult').innerText = "";
    document.getElementById('targetWord').style.filter = 'none';
}

function changeGroup() {
    const val = document.getElementById('groupSelect').value;
    isWrongBookMode = (val === 'wrong_book');
    currentWordIndex = isWrongBookMode ? 0 : getGroupBounds().start;
    updateWordDisplay();
}

function nextWord() {
    const source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    const bounds = isWrongBookMode ? {start:0, end: source.length-1} : getGroupBounds();
    currentWordIndex++;
    if (currentWordIndex > bounds.end) currentWordIndex = bounds.start;
    updateWordDisplay();
}

function checkDictation() {
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    const input = document.getElementById('dictationInput').value.trim().toLowerCase();
    const targetObj = source[currentWordIndex];
    const target = targetObj.en.toLowerCase();
    const resEl = document.getElementById('dictationResult');
    let wrongWords = JSON.parse(localStorage.getItem('eng_wrong_words') || '[]');

    if (input === target) {
        resEl.style.color = "green"; resEl.innerText = "✅ 正确！";
        document.getElementById('targetWord').style.filter = "none";
        wrongWords = wrongWords.filter(item => item.en.toLowerCase() !== target);
        localStorage.setItem('eng_wrong_words', JSON.stringify(wrongWords));
        initGroupSelect();
        setTimeout(nextWord, 1500);
    } else {
        resEl.style.color = "red"; resEl.innerText = "❌ 拼写有误";
        if (!wrongWords.some(item => item.en.toLowerCase() === target)) {
            wrongWords.push(targetObj);
            localStorage.setItem('eng_wrong_words', JSON.stringify(wrongWords));
            initGroupSelect();
        }
        document.getElementById('dictationInput').select();
    }
    pushToCloud();
}

// ================= [6] 看板仪表盘 =================

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
        if ([1, 3, 6].includes(diff)) {
            review.push(`<a href="#" onclick="jumpToGroup(${g-1})" style="color:#f1c40f; font-weight:bold; margin-right:10px;">第 ${g} 组</a>`);
        }
    }
    if (review.length) tasks.push(`<br>🔄 <b>必复习：</b> ${review.reverse().join('')}`);
    dashboard.innerHTML = tasks.join('');
}

function markCurrentGroupFinished() {
    const val = document.getElementById('groupSelect').value;
    if (val === 'all' || val === 'wrong_book') return alert("请先选择一个具体的组号。");
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
    updateDailyDashboard(); pushToCloud();
    alert("🎉 进度已记录并同步！");
}

function jumpToGroup(idx) { 
    const select = document.getElementById('groupSelect');
    if(select) { select.value = idx; changeGroup(); }
}

// ================= [7] AI 生成功能 (故事与翻译) =================
// ================= [终极修正：防崩溃 AI 故事生成] =================
async function generateGroupStory() {
    const apiKey = localStorage.getItem('silicon_api_key');
    if (!apiKey) return alert("请先设置 API Key");

    const bounds = getGroupBounds();
    let words = [];
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    
    for (let i = bounds.start; i <= bounds.end; i++) {
        if (source[i]) words.push(source[i].en);
    }
    if (words.length === 0) return alert("当前组没有单词");

    const box = document.getElementById('groupStoryContent');
    document.getElementById('groupStoryArea').style.display = 'block';
    box.innerHTML = `<p style="color:#8e44ad;">⏳ AI 正在严格构思故事，请稍候...</p>`;

    // 强力约束：不许废话，只要故事
    const prompt = `Task: Write a simple 5-sentence story in English using these 10 words: [${words.join(", ")}].
    1. Bold the 10 words like **word**.
    2. Write English first, then '---', then Chinese translation.
    3. NO chatter like "Certainly" or "Here is". NO repetition.`;

    try {
        const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'Qwen/Qwen2.5-7B-Instruct',
                messages: [
                    { role: "system", content: "You are a translation machine. Output ONLY English story, '---', and Chinese translation. NEVER repeat words." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1,      // 极低随机性，防止乱码
                top_p: 0.1,
                frequency_penalty: 2.0, // 最高等级重复惩罚
                max_tokens: 500
            })
        });

        const data = await response.json();
        let fullText = data.choices[0].message.content.trim();

        // --- 物理清洗逻辑：过滤 AI 废话和重复词 ---
        // 1. 过滤开场白
        fullText = fullText.replace(/Certainly!|Here is the story|Here is a story|Sure!/gi, "").trim();
        
        // 2. 物理去重逻辑（连续重复的单词只留一个）
        let rawWords = fullText.split(/\s+/);
        let cleanedArray = [];
        for(let i=0; i<rawWords.length; i++) {
            if (i > 0 && rawWords[i].toLowerCase() === rawWords[i-1].toLowerCase()) continue;
            cleanedArray.push(rawWords[i]);
        }
        fullText = cleanedArray.join(' ');

        // 3. 渲染（高亮单词）
        box.innerHTML = fullText
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<b style="color:#e67e22; background:#fff5eb; padding:0 2px;">$1</b>');

    } catch (error) {
        console.error(error);
        box.innerText = "生成失败，请点击按钮重试。";
    }
}

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
            body: JSON.stringify({
                model:'Qwen/Qwen2.5-7B-Instruct', 
                messages: [{role:"user", content: `出3道关于[${words.slice(0,5).join(",")}]的纯中文翻译题，禁止带括号。每行一句。`}]
            })
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
                messages: [{role:"user", content: `Translate to English: ${translationTasks.map(t=>t.cn).join(' | ')}. Split by ###.`}],
                temperature: 0.1
            })
        });
        const data = await res.json();
        const raw = data.choices[0].message.content;
        const corrects = raw.split('###').map(s => s.trim().replace(/[\u4e00-\u9fa5]/g, ''));
        
        document.getElementById('transResult').style.display = 'block';
        document.getElementById('transWorking').style.display = 'none';
        copySentenceQueue = [];
        let html = "<h3>批改结果：</h3>";
        translationTasks.forEach((t, i) => {
            const correct = corrects[i] || "AI Error";
            copySentenceQueue.push(correct);
            html += `<div style="margin-bottom:10px; border:1px solid #eee; padding:10px; border-radius:10px; background:white;">
                <p style="font-size:12px;">${t.cn}</p><div style="display:flex; gap:10px;"><div style="flex:1; color:red;">${t.userEn}</div><div style="flex:1; color:green;"><b>${correct}</b></div></div>
            </div>`;
        });
        document.getElementById('transComparisonArea').innerHTML = html;
        startCopyExercise();
    } catch(e) { alert("批改失败"); }
}

// ================= [8] 语音与辅助 =================

function readTargetWord() {
    window.speechSynthesis.cancel();
    const word = document.getElementById('targetWord').innerText;
    const u = new SpeechSynthesisUtterance(word); u.lang = 'en-US';
    window.speechSynthesis.speak(u);
}

function startListeningForWord() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR(); rec.lang = 'en-US';
    const resEl = document.getElementById('wordResult');
    resEl.innerText = "聆听中..."; rec.start();
    rec.onresult = (e) => {
        const spoken = e.results[0][0].transcript.toLowerCase().replace(/[.,!?]/g, '').trim();
        const target = document.getElementById('targetWord').innerText.toLowerCase().trim();
        resEl.innerHTML = (spoken === target) ? `<span style="color:green">✅ ${spoken}</span>` : `<span style="color:red">❌ ${spoken}</span>`;
    };
}

function startChatVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR(); rec.lang = (currentChatMode === 'eng' ? 'en-US' : 'zh-CN');
    rec.start();
    rec.onresult = (e) => {
        document.getElementById('chatMsgInput').value = e.results[0][0].transcript;
        sendChatMessage();
    };
}

// ================= [9] 其余功能补充 =================

function restartWords() { currentWordIndex = isWrongBookMode ? 0 : getGroupBounds().start; updateWordDisplay(); }
function toggleMeaning() { const el = document.getElementById('chineseMeaning'); el.style.display = el.style.display === 'none' ? 'block' : 'none'; }
function toggleBlur() { const el = document.getElementById('targetWord'); el.style.filter = el.style.filter === 'blur(8px)' ? 'none' : 'blur(8px)'; }
function showAndPlayExample() { 
    document.getElementById('exampleSentence').style.display='block'; 
    let t = document.getElementById('exampleSentence').innerText.split('译:')[0].replace(/[^\x00-\xff]/g, '');
    window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang='en-US'; window.speechSynthesis.speak(u); 
}
function generateGroupMemoryPalace() {
    const bounds = getGroupBounds(); const area = document.getElementById('memoryPalaceArea'); const content = document.getElementById('palaceContent');
    let source = isWrongBookMode ? JSON.parse(localStorage.getItem('eng_wrong_words') || '[]') : wordList;
    let html = ""; for (let i = bounds.start; i <= bounds.end; i++) if (source[i]) html += `<div style="margin-bottom:10px; border-bottom:1px dashed #eee;"><b>${i+1}. ${source[i].en}</b><br><small>${source[i].hook}</small></div>`;
    area.style.display = 'block'; content.innerHTML = html;
}
function closeMemoryPalace() { document.getElementById('memoryPalaceArea').style.display = 'none'; }
function jumpToWrongBook() { document.getElementById('groupSelect').value = 'wrong_book'; changeGroup(); }
function saveApiKey() { localStorage.setItem('silicon_api_key', document.getElementById('siliconApiKey').value.trim()); alert("Key 已保存"); }
function changeBook() { localStorage.setItem('selected_book_path', document.getElementById('bookSelect').value); location.reload(); }
function toggleSettings() { const s = document.getElementById('settingsCard'); s.style.display = (s.style.display === 'none' ? 'block' : 'none'); }
function startCopyExercise() { currentCopyCount = 0; document.getElementById('copyExerciseArea').style.display = 'block'; updateCopyDisplay(); }
function updateCopyDisplay() { 
    document.getElementById('copyTargetBox').innerText = copySentenceQueue[0];
    document.getElementById('copyProgressText').innerText = `已复写: ${currentCopyCount}/5`;
    document.getElementById('copyInput').value = ""; document.getElementById('copyInput').focus();
}
function handleCopyInput() {
    const input = document.getElementById('copyInput').value.trim().toLowerCase().replace(/[.,!?'"]/g, '');
    const target = copySentenceQueue[0].trim().toLowerCase().replace(/[.,!?'"]/g, '');
    if (input === target) {
        currentCopyCount++;
        if (currentCopyCount >= 5) {
            copySentenceQueue.shift();
            if (copySentenceQueue.length > 0) { currentCopyCount = 0; updateCopyDisplay(); }
            else { alert("🎉 完成！"); document.getElementById('copyExerciseArea').style.display = 'none'; }
        } else updateCopyDisplay();
    } else alert("拼写不匹配");
}

// 补充看板跳转、同步、文章初始化等逻辑... (参考前几版实现即可)
async function pushToCloud() {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const progressData = {
        eng_study_history: localStorage.getItem('eng_study_history'),
        selected_book_path: localStorage.getItem('selected_book_path'),
        silicon_api_key: localStorage.getItem('silicon_api_key'),
        eng_wrong_words: localStorage.getItem('eng_wrong_words')
    };
    await supabaseClient.from('user_progress').upsert({ id: user.id, data: progressData });
}

async function pullFromCloud() {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const { data } = await supabaseClient.from('user_progress').select('data').single();
    if (data && data.data) {
        let changed = false;
        for (let key in data.data) {
            if (data.data[key] && localStorage.getItem(key) !== data.data[key]) {
                localStorage.setItem(key, data.data[key]);
                changed = true;
            }
        }
        if (changed) location.reload();
    }
}
function handleLogin() { 
    const email = document.getElementById('syncEmail').value;
    if(supabaseClient) supabaseClient.auth.signInWithOtp({ email }).then(() => alert("验证邮件已发送"));
}
function handleLogout() { if(supabaseClient) supabaseClient.auth.signOut().then(() => location.reload()); }
function manualPush() { pushToCloud().then(() => alert("云端已同步")); }

// 文章与挑战
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

// 互动聊天 API 请求头修正
async function sendChatMessage() {
    const input = document.getElementById('chatMsgInput');
    const txt = input.value.trim(); if(!txt) return;
    const key = localStorage.getItem('silicon_api_key');
    if(!key) return alert("请设置 API Key");
    appendChatBubble(txt, 'user'); input.value = "";
    chatHistory.push({role:"user", content:txt});
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
        document.getElementById(loadingId).innerText = aiTxt;
    } catch (e) { document.getElementById(loadingId).innerText = "Error"; }
}

function switchChatMode(mode) {
    currentChatMode = mode;
    document.getElementById('modeBtnEng').classList.toggle('active', mode === 'eng');
    document.getElementById('modeBtnChn').classList.toggle('active', mode === 'chn');
    document.getElementById('chatLog').innerHTML = `<div class="chat-bubble bubble-ai">${mode==='eng'?"Hi! Let's chat!":"你好！我是中文助手。"}</div>`;
    chatHistory = [{role:"system", content: mode==='eng'?"Teacher. Brief correction.":"助手。"}];
}

function appendChatBubble(t, s) {
    const id = "msg-" + Date.now(); const div = document.createElement('div'); div.className = `chat-bubble bubble-${s}`; div.id = id; div.innerText = t;
    document.getElementById('chatLog').appendChild(div); document.getElementById('chatLog').scrollTop = document.getElementById('chatLog').scrollHeight; return id;
}
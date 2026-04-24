// ================= [0] Supabase 云端初始化 =================
// 请在此处填入你在 Supabase 官网获取的真实参数
const supabaseUrl = 'https://bhilewmilbhxowxwwyfq.supabase.co/rest/v1/'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoaWxld21pbGJoeG93eHd3eWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTYyNTUsImV4cCI6MjA5MjUzMjI1NX0._Kj-4i2KTU7LO07AwNkKAta-0qluh4BygU_OMwAKc6o'; 

let supabase;
try {
    if (window.supabase) {
        supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        console.log("✅ Supabase SDK 加载成功");
    } else {
        console.error("❌ 未检测到 Supabase SDK，请检查 HTML 是否引入了脚本");
    }
} catch (e) {
    console.error("❌ Supabase 初始化失败:", e);
}

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

// ================= [2] 初始化逻辑 =================
window.onload = function() {
    console.log("🚀 程序启动初始化...");
    
    // 初始化登录状态监听
    if (supabase) {
        supabase.auth.onAuthStateChange((event, session) => {
            const authSection = document.getElementById('authSection');
            const userSection = document.getElementById('userSection');
            if (session) {
                if(authSection) authSection.style.display = 'none';
                if(userSection) userSection.style.display = 'block';
                const display = document.getElementById('userEmailDisplay');
                if(display) display.innerText = "已登录: " + session.user.email;
                pullFromCloud(); 
            } else {
                if(authSection) authSection.style.display = 'block';
                if(userSection) userSection.style.display = 'none';
            }
        });
    }

    // 核心数据加载
    loadAllData();

    // 加载保存的 API Key
    const savedKey = localStorage.getItem('silicon_api_key');
    if (savedKey) {
        const keyInput = document.getElementById('siliconApiKey');
        if(keyInput) keyInput.value = savedKey;
        const settings = document.getElementById('settingsCard');
        if(settings) settings.style.display = 'none';
    }

    // 设置默认标签
    switchTab('words');
    
    // 启动看板同步计时器
    setInterval(updateDailyDashboard, 5000); // 每5秒静默刷新一次看板
};

// ================= [3] 数据加载 (增加了容错) =================
async function loadAllData() {
    console.log("开始读取文件数据...");
    let currentBookPath = localStorage.getItem('selected_book_path') || 'default';
    let wordPath = currentBookPath === 'default' ? 'NewWords.txt' : `books/${currentBookPath}/NewWords.txt`;
    
    try {
        const wRes = await fetch(wordPath + '?t=' + Date.now());
        if (!wRes.ok) throw new Error("找不到单词文件: " + wordPath);
        
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
        
        console.log(`成功解析 ${wordList.length} 个单词`);
        
        if (wordList.length > 0) {
            initGroupSelect();
            updateWordDisplay();
            // 如果成功显示单词，这里就会消除“载入中”的状态
        }
    } catch (e) {
        console.error("单词加载失败:", e);
        document.getElementById('targetWord').innerText = "加载失败，请检查文件";
    }

    // 加载文章 (略，保持你之前的逻辑)
    fetchTexts();
}

// 文章加载独立出来
async function fetchTexts() {
    let currentBookPath = localStorage.getItem('selected_book_path') || 'default';
    let textPath = currentBookPath === 'default' ? 'Texts.txt' : `books/${currentBookPath}/Texts.txt`;
    try {
        const aRes = await fetch(textPath + '?t=' + Date.now());
        if (aRes.ok) {
            const aText = await aRes.text();
            const allLines = aText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            articleList = [];
            for (let i = 0; i < allLines.length; i += 2) {
                articleList.push({ en: allLines[i], zh: allLines[i+1] || "" });
            }
            initArticleSelect();
        }
    } catch (e) { console.log("文章加载跳过"); }
}

// ================= [4] 基础控制函数 (确保全部存在) =================
function initGroupSelect() {
    const select = document.getElementById('groupSelect');
    if(!select) return;
    select.innerHTML = '';
    const groupCount = Math.ceil(wordList.length / 10);
    for (let i = 0; i < groupCount; i++) {
        select.add(new Option(`📦 第 ${i + 1} 组 (${i*10+1}-${Math.min((i+1)*10, wordList.length)})`, i));
    }
    select.add(new Option(`📚 全部练习`, 'all'));
}

function updateWordDisplay() {
    if (wordList.length === 0) return;
    const currentWord = wordList[currentWordIndex];
    
    const wordEl = document.getElementById('targetWord');
    const counterEl = document.getElementById('wordCounter');
    const chineseEl = document.getElementById('chineseMeaning');
    
    if(wordEl) wordEl.innerText = currentWord.en;
    if(counterEl) counterEl.innerText = `${currentWordIndex + 1} / ${wordList.length}`;
    if(chineseEl) {
        chineseEl.innerText = currentWord.zh;
        chineseEl.style.display = 'none';
    }

    // 例句格式化
    const exBox = document.getElementById('exampleSentence');
    if(exBox) {
        const exParts = currentWord.ex.split("中文：");
        exBox.innerHTML = exParts.length > 1 ? 
            `<div style="font-weight:500;">${exParts[0]}</div><div style="color:#8e8e93; font-size:14px; margin-top:5px; border-top:1px solid #f0f0f0; padding-top:5px;">译: ${exParts[1]}</div>` : 
            currentWord.ex;
        exBox.style.display = 'none';
    }
    
    if(wordEl) wordEl.style.filter = 'none';
}

function readTargetWord() {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(wordList[currentWordIndex].en);
    u.lang = 'en-US';
    window.speechSynthesis.speak(u);
}

function nextWord() {
    currentWordIndex++;
    if (currentWordIndex >= wordList.length) currentWordIndex = 0;
    updateWordDisplay();
}

function restartWords() { currentWordIndex = 0; updateWordDisplay(); }

function toggleMeaning() {
    const el = document.getElementById('chineseMeaning');
    if(el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function showAndPlayExample() {
    const el = document.getElementById('exampleSentence');
    if(el) el.style.display = 'block';
    let speechText = wordList[currentWordIndex].ex.split("中文：")[0];
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(speechText.replace(/[^\x00-\xff]/g, ''));
    u.lang = 'en-US';
    window.speechSynthesis.speak(u);
}

// 补全所有看板、AI故事、宫殿、翻页等函数... (请保持你之前的实现，并确保函数名正确)
// ... [markCurrentGroupFinished, updateDailyDashboard, jumpToGroup, generateRevisionStory, generateGroupMemoryPalace, etc.]
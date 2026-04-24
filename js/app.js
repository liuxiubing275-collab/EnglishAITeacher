// ================= [0] Supabase 云端初始化 =================
// 请在此处填入你在 Supabase 官网获取的真实参数
const supabaseUrl = 'https://bhilewmilbhxowxwwyfq.supabase.co/rest/v1/'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoaWxld21pbGJoeG93eHd3eWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTYyNTUsImV4cCI6MjA5MjUzMjI1NX0._Kj-4i2KTU7LO07AwNkKAta-0qluh4BygU_OMwAKc6o'; 

let supabaseClient; // 改名，防止与全局库名冲突

try {
    if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SB_URL, SB_KEY);
        console.log("✅ Supabase 客户端创建成功");
    }
} catch (e) {
    printError("Supabase 初始化失败，将仅使用本地模式");
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

// ================= [2] 核心初始化逻辑 =================
window.onload = function() {
    console.log("🚀 程序开始加载...");
    
    // 1. 处理云端登录状态
    if (supabaseClient) {
        supabaseClient.auth.onAuthStateChange((event, session) => {
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

    // 2. 加载核心数据
    loadAllData();

    // 3. 恢复配置
    const savedKey = localStorage.getItem('silicon_api_key');
    if (savedKey) {
        const keyInput = document.getElementById('siliconApiKey');
        if(keyInput) keyInput.value = savedKey;
        const settings = document.getElementById('settingsCard');
        if(settings) settings.style.display = 'none';
    }

    // 4. 界面初始化
    switchTab('words');
    setInterval(updateDailyDashboard, 5000); 
};

// ================= [3] 数据加载 (步进3行模式) =================
async function loadAllData() {
    console.log("正在尝试加载单词数据...");
    let currentBookPath = localStorage.getItem('selected_book_path') || 'default';
    let wordPath = currentBookPath === 'default' ? 'NewWords.txt' : `books/${currentBookPath}/NewWords.txt`;
    let textPath = currentBookPath === 'default' ? 'Texts.txt' : `books/${currentBookPath}/Texts.txt`;

    try {
        // 加载单词
        const wRes = await fetch(wordPath + '?t=' + Date.now());
        if (!wRes.ok) throw new Error("无法读取单词文件");
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
        
        if (wordList.length > 0) {
            initGroupSelect();
            updateWordDisplay(); // 运行到这里，单词就会显示，“载入中”消失
            console.log("✅ 单词加载完成");
        } else {
            document.getElementById('targetWord').innerText = "词库内容为空";
        }

        // 加载文章
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
    } catch (e) {
        console.error("加载流程崩溃:", e);
        document.getElementById('targetWord').innerText = "加载失败, 请刷新或检查文件";
    }
}

// ================= [4] 云端同步逻辑 =================
async function handleLogin() {
    const email = document.getElementById('syncEmail').value;
    if(!email) return alert("请输入邮箱");
    const { error } = await supabaseClient.auth.signInWithOtp({ email });
    if (error) alert("错误: " + error.message);
    else alert("验证邮件已发送！请查收。");
}

async function pushToCloud() {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const progressData = {
        eng_study_history: localStorage.getItem('eng_study_history'),
        selected_book_path: localStorage.getItem('selected_book_path'),
        silicon_api_key: localStorage.getItem('silicon_api_key')
    };
    await supabaseClient.from('user_progress').upsert({ id: user.id, data: progressData, updated_at: new Date() });
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
        if (changed) updateDailyDashboard();
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    location.reload();
}

function manualPush() { pushToCloud().then(() => alert("云端备份成功！")); }

// ================= [5] 单词控制 =================
function initGroupSelect() {
    const select = document.getElementById('groupSelect');
    if(!select) return;
    select.innerHTML = '';
    const groupCount = Math.ceil(wordList.length / 10);
    for (let i = 0; i < groupCount; i++) {
        select.add(new Option(`📦 第 ${i + 1} 组 (${i*10+1}-${Math.min((i+1)*10, wordList.length)})`, i));
    }
    select.add(new Option(`📚 全部练习`, 'all'));
    select.value = 0;
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
    const wordObj = wordList[currentWordIndex];
    const bounds = getGroupBounds();

    document.getElementById('targetWord').innerText = wordObj.en;
    document.getElementById('wordCounter').innerText = `${currentWordIndex - bounds.start + 1} / ${bounds.total}`;
    
    const chineseEl = document.getElementById('chineseMeaning');
    chineseEl.innerText = wordObj.zh;
    chineseEl.style.display = 'none';

    const exBox = document.getElementById('exampleSentence');
    const exParts = wordObj.ex.split("中文：");
    exBox.innerHTML = exParts.length > 1 ? 
        `<div style="font-weight:500;">${exParts[0]}</div><div style="color:#8e8e93; font-size:14px; margin-top:5px; border-top:1px solid #f0f0f0; padding-top:5px;">${exParts[1]}</div>` : 
        wordObj.ex;
    exBox.style.display = 'none';
    
    document.getElementById('wordResult').innerText = "";
    document.getElementById('targetWord').style.filter = 'none';
}

function nextWord() {
    const bounds = getGroupBounds();
    currentWordIndex++;
    if (currentWordIndex > bounds.end) currentWordIndex = bounds.start;
    updateWordDisplay();
}

function readTargetWord() {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(wordList[currentWordIndex].en);
    u.lang = 'en-US';
    window.speechSynthesis.speak(u);
}

// 其余函数保持不变 (toggleMeaning, restartWords, startListeningForWord, startGroupTest, etc.)
// ...由于篇幅限制，请确保你 app.js 后面保留了之前版本的其他功能函数...

function printError(msg) { console.warn(msg); }

function switchTab(tabName) {
    document.querySelectorAll('.page-section').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const activePage = document.getElementById('page-' + tabName);
    if(activePage) activePage.style.display = 'block';
    const activeBtn = document.getElementById('btn-' + tabName);
    if(activeBtn) activeBtn.classList.add('active');
    
    const selector = document.getElementById('bookSelectorContainer');
    if(selector) selector.style.display = (tabName === 'chat' ? 'none' : 'flex');
}
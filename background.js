// 初始化 Service Worker
self.addEventListener('install', (event) => {
    console.log('Service Worker 正在安装');
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker 已激活');
    event.waitUntil(self.clients.claim());
});

// 错误处理
self.addEventListener('error', (event) => {
    console.error('Service Worker 错误:', event.message);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('Service Worker 未处理的 Promise 拒绝:', event.reason);
});

// 存储收集到的候选人信息
let collectedCandidates = [];

// 添加网站状态管理
let runningSite = null;

// 用于存储已处理的请求
const processedRequests = new Set();

// 用于存储已处理的请求URL，避免重复处理
const processedUrls = new Set();

// 保持 Service Worker 活跃
let keepAliveInterval = null;

function startKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }
    keepAliveInterval = setInterval(() => {
        console.log('Service Worker 保活 ping:', new Date().toISOString());
    }, 20000);
}

// 打赏排行榜功能已移除

// 监听来自content script的消息
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    console.log('Background收到消息:', message);
    startKeepAlive(); // 每次收到消息时重置保活定时器

    // 对于异步操作，需要先返回true
    if (message.type === 'CANDIDATES_COLLECTED' || message.type === 'RESUME_DATA') {
        return true;  // 表明我们会异步发送响应
    }

    try {
        switch (message.action) {
            case 'OPEN_PLUGIN':
                console.log('打开插件的请求');
                // 这里可以添加打开插件的具体逻辑，例如打开一个新的标签页
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    chrome.tabs.update(tabs[0].id, { url: 'popup/index.html' });
                });
                sendResponse({ status: 'success' });
                break;

            // 排行榜功能已移除

            case 'MATCH_SUCCESS':
                console.log('处理匹配成功消息:', message.data);
                // 立即发送响应
                sendResponse({ status: 'success', received: true });
                break;

            case 'AI_MATCH_CHECK':
                checkCandidateMatch(message.candidateInfo, message.jobDescription)
                    .then(isMatch => {
                        sendResponse({ status: 'success', isMatch: isMatch });
                    })
                    .catch(error => {
                        console.error('AI匹配检查失败:', error);
                        sendResponse({ status: 'error', error: error.message, isMatch: true });
                    });
                return true;  // 表明我们会异步发送响应

            case 'CHECK_RUNNING_SITE':
                const canStart = !runningSite || runningSite === message.site;
                sendResponse({ canStart });
                break;

            case 'SITE_STARTED':
                runningSite = message.site;
                sendResponse({ status: 'success' });
                break;

            case 'SITE_STOPPED':
                if (runningSite === message.site) {
                    runningSite = null;
                }
                sendResponse({ status: 'success' });
                break;

            case 'SITE_INITIALIZED':
                if (!runningSite) {
                    runningSite = message.site;
                }
                sendResponse({ status: 'success' });
                break;

            default:
                sendResponse({ status: 'unknown_message_type' });
                break;
        }
    } catch (error) {
        console.error('处理消息时出错:', error);
        sendResponse({ status: 'error', error: error.message });
    }

    return true;
});

// 监听连接以保持service worker活跃
chrome.runtime.onConnect.addListener((port) => {
    console.log('建立新连接:', port.name);
    startKeepAlive(); // 建立连接时启动保活

    port.onMessage.addListener((message) => {
        console.log('收到端口消息:', message);
    });

    port.onDisconnect.addListener(() => {
        console.log('连接断开:', port.name);
    });
});

// 初始化
startKeepAlive();

// 根据设置的筛选条件过滤候选人
async function filterCandidates(candidates) {
    // 获取保存的筛选条件
    const settings = await chrome.storage.local.get([
        'ageRange',
        'education',
        'gender',
        'keywords'
    ]);

    return candidates.filter(candidate => {
        // 年龄筛选
        if (settings.ageRange) {
            const { min, max } = settings.ageRange;
            if (min && candidate.age < min) return false;
            if (max && candidate.age > max) return false;
        }

        // 学历筛选
        if (settings.education &&
            !settings.education.includes('不限') &&
            !settings.education.includes(candidate.education)) {
            return false;
        }

        // 关键词筛选
        if (settings.keywords && settings.keywords.length > 0) {
            const text = `${candidate.name} ${candidate.university}`;
            if (!settings.keywords.some(keyword =>
                text.toLowerCase().includes(keyword.toLowerCase())
            )) {
                return false;
            }
        }

        return true;
    });
}

// 清理文件名，移除不合法字符
function sanitizeFilename(filename) {
    // 替换 Windows 和通用的非法字符
    return filename
        .replace(/[<>:"/\\|?*]/g, '_')  // 替换 Windows 非法字符
        .replace(/\s+/g, '_')           // 替换空格
        .replace(/\./g, '_')            // 替换点号
        .trim();                        // 移除首尾空格
}

// AI匹配功能
async function checkCandidateMatch(candidateInfo, jobDescription) {
    const API_BASE = 'https://tbai.xin/v1/chat';
    const API_KEY = 'sk-Qj6S6L0X84phMQMiGZ5zYG1a66xcpDU7ZLljOBeyFdq4QLen';

    try {
        const prompt = `
        你是一个专业的HR助手。请根据以下职位描述(JD)和候选人信息，判断候选人是否匹配该职位。请特别关注职位描述中的核心要求（如技能、经验年限、学历等），并重点判断以下几个方面：

        职位描述：
        ${jobDescription}

        职位要求：
        1. 技能要求：${jobDescription.skills || '无'}
        2. 经验年限：${jobDescription.experience || '无'}
        3. 学历要求：${jobDescription.education || '无'}
        4. 其他要求：${jobDescription.otherRequirements || '无'}

        职位层级：${jobDescription.level || '无'}

        候选人信息：
        姓名：${candidateInfo.name}
        年龄：${candidateInfo.age}岁
        学历：${candidateInfo.education}
        学校：${candidateInfo.university}
        描述：${candidateInfo.description}
        ${candidateInfo.extraInfo ? candidateInfo.extraInfo.map(info => `${info.type}：${info.value}`).join('\n') : ''}

        请特别注意：
        1. 是否符合职位要求的技能、经验和学历等硬性要求；
        2. 候选人的经验层级是否符合该职位要求（例如，是否是初级/中级/高级岗位）；
        3. 是否符合公司文化或岗位需求中的额外要求（如沟通能力、领导力等）；
        4. 如果候选人有额外的项目经验或特别成就（如项目管理经验、获奖情况等），请考虑这些对匹配度的影响；
        5. 重点关注候选人的技能匹配度和工作经验是否符合岗位要求。

        注意：年龄筛选已在系统层面处理，无需在AI判断中考虑年龄因素。

        只回答"匹配"或"不匹配"，不要其他解释。`;       

        const response = await fetch(`${API_BASE}/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 50,
                temperature: 0.1
            })
        });

        if (!response.ok) {
            throw new Error(`AI API请求失败: ${response.status}`);
        }

        const data = await response.json();
        const result = data.choices?.[0]?.message?.content?.trim() || '';

        console.log('AI匹配结果:', result);
        return result.includes('匹配') && !result.includes('不匹配');

    } catch (error) {
        console.error('AI匹配检查失败:', error);
        // 如果AI检查失败，返回true以避免阻止正常流程
        return true;
    }
}



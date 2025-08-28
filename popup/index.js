let isRunning = false;
let keywords = [];
let excludeKeywords = [];
let isAndMode = false;
let matchCount = 0;
let matchLimit = 200;
let enableSound = true;

// 添加职位相关状态
let positions = [];
let currentPosition = null;

// 下载功能已移除

// 添加新的状态变量
let scrollDelayMin = 3;  // 默认最小延迟秒数
let scrollDelayMax = 5;  // 默认最大延迟秒数

// 监控相关变量
let monitorStats = {
	totalProcessed: 0,
	readingCount: 0,
	aiCount: 0,
	matchCount: 0,
	startTime: null,
	processingTimes: []
};

// 服务器相关功能已移除

// AI匹配相关变量
let enableAiMatch = false;
let jobDescription = '';
const AI_API_BASE = 'https://tbai.xin/v1/chat';
const AI_API_KEY = 'sk-Qj6S6L0X84phMQMiGZ5zYG1a66xcpDU7ZLljOBeyFdq4QLen';

// 添加日志持久化相关的函数
async function saveLogs(logs) {
	try {
		await chrome.storage.local.set({ 'hr_assistant_logs': logs });
	} catch (error) {
		console.error('保存日志失败:', error);
	}
}

async function loadLogs() {
	try {
		const result = await chrome.storage.local.get('hr_assistant_logs');
		return result.hr_assistant_logs || [];
	} catch (error) {
		console.error('加载日志失败:', error);
		return [];
	}
}

// 添加错误提示函数
function showError(error) {
	addLog(`错误: ${error.message}`, 'error');
	console.error('详细错误:', error);
}

// 添加自动保存设置函数
async function saveSettings() {
	try {
		// 获取当前设置
		const currentSettings = {
			positions,
			currentPosition: currentPosition?.name || '',
			isAndMode,
			matchLimit: parseInt(document.getElementById('match-limit')?.value) || 200,
			enableSound,
			scrollDelayMin: parseInt(document.getElementById('delay-min')?.value) || 3,
			scrollDelayMax: parseInt(document.getElementById('delay-max')?.value) || 5,
			clickFrequency: parseInt(document.getElementById('click-frequency')?.value) || 7,
			enableAiMatch,
			jobDescription,
			enableAgeFilter: document.getElementById('enable-age-filter')?.checked || false,
			ageMin: parseInt(document.getElementById('ageMin')?.value) || null,
			ageMax: parseInt(document.getElementById('ageMax')?.value) || null,
			enableEducationFilter: document.getElementById('enable-education-filter')?.checked || false,
			educationLevel: document.getElementById('education-level')?.value || ''
		};

		console.log('💾 保存设置:', currentSettings);

		// 保存到本地存储
		await chrome.storage.local.set(currentSettings);

		addLog('设置已保存到本地', 'success');

		// 通知 content script 设置已更新
		chrome.tabs.query({
			active: true,
			currentWindow: true
		}, function (tabs) {
			if (tabs[0]) {
				chrome.tabs.sendMessage(tabs[0].id, {
					type: 'SETTINGS_UPDATED',
					data: {
						...currentSettings,
						keywords: currentPosition?.keywords || [],
						excludeKeywords: currentPosition?.excludeKeywords || []
					}
				});
			}
		});

	} catch (error) {
		showError(error);
	}
}

// 定义基础的关键词函数
function addKeywordBase() {
	const input = document.getElementById('keyword-input');
	if (!input) {
		console.error('找不到关键词输入框元素');
		addLog('⚠️ 系统错误：找不到关键词输入框', 'error');
		return;
	}

	const keyword = input.value.trim();
	if (keyword && !keywords.includes(keyword)) {
		keywords.push(keyword);
		renderKeywords();
		input.value = '';
	}
}

function removeKeyword(keyword) {
	if (!currentPosition) return;

	currentPosition.keywords = currentPosition.keywords.filter(k => k !== keyword);
	keywords = [...currentPosition.keywords];
	renderKeywords();
	saveSettings();

	// 实时通知 content script 关键词更新
	if (isRunning) {
		notifyKeywordsUpdate();
	}
}

// 包装函数，添加自动保存功能
function addKeyword() {
	if (!currentPosition) {
		addLog('⚠️ 请先选择岗位', 'error');
		return;
	}

	const input = document.getElementById('keyword-input');
	if (!input) {
		console.error('找不到关键词输入框元素');
		addLog('⚠️ 系统错误：找不到关键词输入框', 'error');
		return;
	}

	const keyword = input.value.trim();
	if (keyword && !currentPosition.keywords.includes(keyword)) {
		currentPosition.keywords.push(keyword);
		keywords = [...currentPosition.keywords];
		renderKeywords();
		input.value = '';
		saveSettings();

		// 实时通知 content script 关键词更新
		if (isRunning) {
			notifyKeywordsUpdate();
		}
	}
}

// 添加排除关键词的函数
function addExcludeKeyword() {
	if (!currentPosition) {
		addLog('⚠️ 请先选择岗位', 'error');
		return;
	}

	const input = document.getElementById('keyword-input');
	if (!input) {
		console.error('找不到关键词输入框元素');
		addLog('⚠️ 系统错误：找不到关键词输入框', 'error');
		return;
	}

	const keyword = input.value.trim();
	if (keyword && !currentPosition.excludeKeywords.includes(keyword)) {
		currentPosition.excludeKeywords.push(keyword);
		excludeKeywords = [...currentPosition.excludeKeywords];
		renderExcludeKeywords();
		input.value = '';
		saveSettings();

		// 实时通知 content script 关键词更新
		if (isRunning) {
			notifyKeywordsUpdate();
		}
	}
}

// 删除排除关键词的函数
function removeExcludeKeyword(keyword) {
	if (!currentPosition) return;

	currentPosition.excludeKeywords = currentPosition.excludeKeywords.filter(k => k !== keyword);
	excludeKeywords = [...currentPosition.excludeKeywords];
	renderExcludeKeywords();
	saveSettings();

	// 实时通知 content script 关键词更新
	if (isRunning) {
		notifyKeywordsUpdate();
	}
}

// 渲染排除关键词列表
function renderExcludeKeywords() {
	const container = document.getElementById('exclude-keyword-list');
	if (!container) {
		throw new Error('找不到排除关键词列表容器');
	}

	container.innerHTML = '';

	excludeKeywords.forEach(keyword => {
		const keywordDiv = document.createElement('div');
		keywordDiv.className = 'tag exclude';
		keywordDiv.innerHTML = `
            ${keyword}
            <button class="tag-remove" data-keyword="${keyword}">&times;</button>
        `;

		const removeButton = keywordDiv.querySelector('.tag-remove');
		removeButton.addEventListener('click', () => {
			removeExcludeKeyword(keyword);
		});

		container.appendChild(keywordDiv);
	});
}

// 在文件开头添加状态持久化相关函数
async function saveState() {
	await chrome.storage.local.set({
		isRunning,
		matchCount
	});
}

async function loadState() {
	try {
		const state = await new Promise((resolve) => {
			chrome.storage.local.get({  // 添加默认值对象
				isRunning: false,
				matchCount: 0
			}, (result) => {
				resolve(result);
			});
		});

		isRunning = state.isRunning;
		matchCount = state.matchCount;

		// 更新UI以反映当前状态
		updateUI();

		// 如果有正在进行的操作，显示相应的状态
		if (isRunning) {
			addLog(`继续运行中，已匹配 ${matchCount} 个候选人`, 'info');
		}
	} catch (error) {
		console.error('加载状态失败:', error);
		// 使用默认值
		isRunning = false;
		matchCount = 0;
	}
}

// 将所有按钮事件监听器移到 DOMContentLoaded 事件处理函数中
document.addEventListener('DOMContentLoaded', async () => {
	try {
		// 设置版本号
		const version = chrome.runtime.getManifest().version;
		document.getElementById('version').textContent = `v${version}`;

		// 账号绑定功能已移除

		// 加载并显示历史日志
		const logs = await loadLogs();
		const logContainer = document.getElementById('log-container');
		logContainer.innerHTML = ''; // 清空默认的系统就绪消息

		logs.forEach(log => {
			const logEntry = document.createElement('div');
			logEntry.className = 'log-entry';
			logEntry.innerHTML = log.html;
			logContainer.appendChild(logEntry);
		});

		// 如果没有历史日志，显示系统就绪消息
		if (logs.length === 0) {
			const logEntry = document.createElement('div');
			logEntry.className = 'log-entry';
			logEntry.innerHTML = `
				<span class="log-prefix">></span>
				<span class="log-info">系统就绪，等待开始...</span>
			`;
			logContainer.appendChild(logEntry);
		}

		await loadState();  // 加载保存的状态

		// 加载设置
		const settings = await getSettings();
		const matchLimitInput = document.getElementById('match-limit');
		const enableSoundCheckbox = document.getElementById('enable-sound');

		// 加载年龄筛选设置
		const enableAgeFilterCheckbox = document.getElementById('enable-age-filter');
		const ageMinInput = document.getElementById('ageMin');
		const ageMaxInput = document.getElementById('ageMax');

		if (settings.enableAgeFilter !== undefined) {
			enableAgeFilterCheckbox.checked = settings.enableAgeFilter;
		}

		if (settings.ageMin !== undefined) {
			ageMinInput.value = settings.ageMin;
		}

		if (settings.ageMax !== undefined) {
			ageMaxInput.value = settings.ageMax;
		}

		// 加载学历筛选设置
		const enableEducationFilterCheckbox = document.getElementById('enable-education-filter');
		const educationLevelSelect = document.getElementById('education-level');
		
		if (settings.enableEducationFilter !== undefined) {
			enableEducationFilterCheckbox.checked = settings.enableEducationFilter;
		}
		
		if (settings.educationLevel !== undefined) {
			educationLevelSelect.value = settings.educationLevel;
		}

		// 监听年龄筛选设置变更
		enableAgeFilterCheckbox?.addEventListener('change', saveSettings);
		ageMinInput?.addEventListener('change', saveSettings);
		ageMaxInput?.addEventListener('change', saveSettings);

		// 监听学历筛选设置变更
		enableEducationFilterCheckbox?.addEventListener('change', saveSettings);
		educationLevelSelect?.addEventListener('change', saveSettings);

		// 监听性别选择变更
		document.querySelectorAll('input[id^="gender-"]').forEach(checkbox => {
			checkbox.addEventListener('change', saveSettings);
		});

		// 绑定关键词相关事件
		const keywordInput = document.getElementById('keyword-input');
		const addKeywordBtn = document.getElementById('add-keyword');
		const addExcludeKeywordBtn = document.getElementById('add-exclude-keyword');
		const positionInput = document.getElementById('position-input');
		const addPositionBtn = document.getElementById('add-position');

		if (!keywordInput || !addKeywordBtn || !addExcludeKeywordBtn || !positionInput || !addPositionBtn) {
			console.error('找不到关键词或岗位相关元素');
			addLog('⚠️ 系统错误：界面初始化失败', 'error');
			return;
		}

		// 关键词输入框回车事件
		keywordInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault(); // 阻止默认行为
				addKeyword();
			}
		});

		// 岗位输入框回车事件
		positionInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault(); // 阻止默认行为
				addPosition();
			}
		});

		// 按钮点击事件
		addKeywordBtn.addEventListener('click', () => addKeyword());
		addExcludeKeywordBtn.addEventListener('click', () => addExcludeKeyword());
		addPositionBtn.addEventListener('click', () => addPosition());

		// 加载与/或模式设置
		const andModeCheckbox = document.getElementById('keywords-and-mode');
		if (settings.isAndMode !== undefined) {
			isAndMode = settings.isAndMode;
			andModeCheckbox.checked = isAndMode;
		}

		// 监听与/或模式变化
		andModeCheckbox.addEventListener('change', (e) => {
			isAndMode = e.target.checked;
			saveSettings();
			addLog(`关键词匹配模式: ${isAndMode ? '全部匹配' : '任一匹配'}`, 'info');
		});

		// 设置关键词
		if (settings.keywords && settings.keywords.length > 0) {
			keywords = settings.keywords;
			renderKeywords();
			addLog(`已加载 ${keywords.length} 个关键词`, 'info');
		}

		// 设置排除关键词
		if (settings.excludeKeywords && settings.excludeKeywords.length > 0) {
			excludeKeywords = settings.excludeKeywords;
			renderExcludeKeywords();
			addLog(`已加载 ${excludeKeywords.length} 个排除关键词`, 'info');
		}

		// 加载匹配限制和声音设置
		if (settings.matchLimit !== undefined) {
			matchLimit = settings.matchLimit;
			matchLimitInput.value = matchLimit;
		}

		if (settings.enableSound !== undefined) {
			enableSound = settings.enableSound;
			enableSoundCheckbox.checked = enableSound;
		}

		// 监听设置变化
		matchLimitInput.addEventListener('change', () => {
			matchLimit = parseInt(matchLimitInput.value) || 10;
			saveSettings();
			addLog(`设置匹配暂停数量: ${matchLimit}`, 'info');
		});

		enableSoundCheckbox.addEventListener('change', (e) => {
			enableSound = e.target.checked;
			saveSettings();
			addLog(`${enableSound ? '启用' : '禁用'}提示音`, 'info');
		});

		// AI匹配相关事件监听
		const enableAiMatchCheckbox = document.getElementById('enable-ai-match');
		const jobDescriptionTextarea = document.getElementById('job-description');

		// 加载AI匹配设置
		if (settings.enableAiMatch !== undefined) {
			enableAiMatch = settings.enableAiMatch;
			enableAiMatchCheckbox.checked = enableAiMatch;
		}

		if (settings.jobDescription) {
			jobDescription = settings.jobDescription;
			jobDescriptionTextarea.value = jobDescription;
		}

		// 监听AI匹配设置变化
		enableAiMatchCheckbox.addEventListener('change', (e) => {
			enableAiMatch = e.target.checked;
			saveSettings();
			addLog(`${enableAiMatch ? '启用' : '禁用'}AI智能匹配`, 'info');
		});

		jobDescriptionTextarea.addEventListener('input', (e) => {
			jobDescription = e.target.value.trim();
			saveSettings();
		});

		// 加载职位数据
		if (settings.positions) {
			positions = settings.positions;
			renderPositions();

			if (settings.currentPosition) {
				selectPosition(settings.currentPosition);
			}
		}

		// 绑定职位相关事件
		document.getElementById('position-input')?.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				addPosition();
			}
		});

		document.getElementById('add-position')?.addEventListener('click', addPosition);

		// 绑定打招呼按钮事件
		document.getElementById('scrollButton')?.addEventListener('click', () => {
			startAutoScroll();  // 开始打招呼
		});

		// 绑定停止按钮事件
		document.getElementById('stopButton')?.addEventListener('click', () => {
			if (isRunning) {
				stopAutoScroll();  // 停止打招呼
			}
		});

		// 加载完成提示
		addLog('设置加载完成', 'success');

		// 加载延迟设置
		const delayMinInput = document.getElementById('delay-min');
		const delayMaxInput = document.getElementById('delay-max');

		if (settings.scrollDelayMin !== undefined) {
			scrollDelayMin = settings.scrollDelayMin;
			delayMinInput.value = scrollDelayMin;
		} else {
			delayMinInput.value = 3; // 设置默认值
		}

		if (settings.scrollDelayMax !== undefined) {
			scrollDelayMax = settings.scrollDelayMax;
			delayMaxInput.value = scrollDelayMax;
		} else {
			delayMaxInput.value = 5; // 设置默认值
		}

		// 监听延迟输入框变化
		delayMinInput.addEventListener('change', saveSettings);
		delayMaxInput.addEventListener('change', saveSettings);

		// 加载点击频率设置
		const clickFrequencyInput = document.getElementById('click-frequency');
		if (settings.clickFrequency !== undefined) {
			clickFrequencyInput.value = settings.clickFrequency;
		}

		// 监听点击频率变化
		clickFrequencyInput?.addEventListener('change', saveSettings);

		// 排行榜功能已移除
	} catch (error) {
		showError(error);
	}
});

// 修改 getSettings 函数
async function getSettings() {
	return new Promise((resolve, reject) => {
		chrome.storage.local.get([
			'positions',
			'currentPosition',
			'isAndMode',
			'matchLimit',
			'enableSound',
			'scrollDelayMin',
			'scrollDelayMax',
			'clickFrequency',
			'enableAiMatch',
			'jobDescription',
			'enableAgeFilter',
			'ageMin',
			'ageMax',
			'enableEducationFilter',
			'educationLevel'
		], (result) => {
			if (chrome.runtime.lastError) {
				reject(chrome.runtime.lastError);
				return;
			}
			resolve(result);
		});
	});
}

// 修改 startAutoScroll 函数
async function startAutoScroll() {
	if (!currentPosition) {
		addLog('⚠️ 请先选择岗位', 'error');
		isRunning = false;
		updateUI();
		return;
	}

	// 获取打招呼暂停数
	const matchLimitInput = document.getElementById('match-limit');
	matchLimit = parseInt(matchLimitInput.value) || 200; // 默认值为200

	// 检查硬性筛选条件
	const enableAgeFilter = document.getElementById('enable-age-filter')?.checked;
	const enableEducationFilter = document.getElementById('enable-education-filter')?.checked;
	const ageMin = parseInt(document.getElementById('ageMin')?.value);
	const ageMax = parseInt(document.getElementById('ageMax')?.value);
	const educationLevel = document.getElementById('education-level')?.value;

	// 显示硬性筛选条件
	if (enableAgeFilter && ageMin && ageMax) {
		addLog(`✓ 年龄筛选已启用: ${ageMin}-${ageMax}岁`, 'info');
	}
	if (enableEducationFilter && educationLevel) {
		addLog(`✓ 学历筛选已启用: 最低${educationLevel}`, 'info');
	}

	// 检查是否有关键词
	if (!currentPosition.keywords.length && !currentPosition.excludeKeywords.length && !enableAiMatch) {
		if (!enableAgeFilter && !enableEducationFilter) {
			if (!confirm('当前没有设置任何筛选条件，将会给所有候选人打招呼，是否继续？')) {
				return;
			}
			addLog('⚠️ 无筛选条件，将给所有候选人打招呼', 'warning');
		} else {
			addLog('ℹ️ 仅使用硬性筛选条件（年龄/学历）', 'info');
		}
	}

	// 检查AI匹配设置
	if (enableAiMatch && !jobDescription.trim()) {
		if (!confirm('已启用AI匹配但未输入职位描述(JD)，AI将无法进行准确匹配，是否继续？')) {
			return;
		}
		addLog('⚠️ 未输入JD，AI匹配效果可能不佳', 'warning');
	}

	if (isRunning) return;

	try {
		isRunning = true;
		matchCount = 0;
		updateUI();
		addLog('开始运行自动滚动...', 'info');
		addLog(`设置打招呼暂停数: ${matchLimit}`, 'info');
		addLog(`随机延迟时间: ${scrollDelayMin}-${scrollDelayMax}秒`, 'info');

		chrome.tabs.query({
			active: true,
			currentWindow: true
		}, tabs => {
			if (tabs[0]) {
				const messageData = {
					keywords: currentPosition.keywords,
					excludeKeywords: currentPosition.excludeKeywords,
					isAndMode: isAndMode,
					matchLimit: matchLimit,
					scrollDelayMin: scrollDelayMin,
					scrollDelayMax: scrollDelayMax,
					clickFrequency: parseInt(document.getElementById('click-frequency')?.value) || 7,
					enableAiMatch: enableAiMatch,
					jobDescription: jobDescription,
					enableAgeFilter: document.getElementById('enable-age-filter')?.checked || false,
					ageMin: parseInt(document.getElementById('ageMin')?.value) || null,
					ageMax: parseInt(document.getElementById('ageMax')?.value) || null,
					enableEducationFilter: document.getElementById('enable-education-filter')?.checked || false,
					educationLevel: document.getElementById('education-level')?.value || ''
				};
				
				console.log('📤 发送给content script的数据:', messageData);
				
				chrome.tabs.sendMessage(
					tabs[0].id, {
					action: 'START_SCROLL',
					data: messageData
				},
					response => {
						if (chrome.runtime.lastError) {
							console.error('发送消息失败:', chrome.runtime.lastError);
							addLog('⚠️ 无法连接到页面，请刷新页面', 'error');
							isRunning = false;
							updateUI();
							return;
						}
						console.log('收到响应:', response);
					}
				);
			}
		});

		await saveState();
	} catch (error) {
		console.error('启动失败:', error);
		isRunning = false;
		updateUI();
		addLog('启动失败: ' + error.message, 'error');
	}
}

// 停止自动滚动
async function stopAutoScroll() {
	if (!isRunning) return;

	try {
		isRunning = false;
		updateUI();
		addLog(`停止自动滚动，当前已匹配 ${matchCount} 个候选人`, 'warning');

		chrome.tabs.query({
			active: true,
			currentWindow: true
		}, tabs => {
			if (tabs[0]) {
				chrome.tabs.sendMessage(tabs[0].id, {
					action: 'STOP_SCROLL'
				}, response => {
					if (chrome.runtime.lastError) {
						console.error('发送停止消息失败:', chrome.runtime.lastError);
						return;
					}
					console.log('停止响应:', response);
				});
			}
		});

		await saveState();  // 保存状态
	} catch (error) {
		console.error('停止失败:', error);
		addLog('停止失败: ' + error.message, 'error');
	} finally {
		// 确保状态被重置
		matchCount = 0;
		isRunning = false;
		updateUI();
	}
}

// 更新UI状态
function updateUI() {
	const initialButtons = document.getElementById('initialButtons');
	const stopButtons = document.getElementById('stopButtons');
	const monitorCard = document.getElementById('monitor-card');

	// 如果正在运行，显示停止按钮和监控界面
	if (isRunning) {
		initialButtons.classList.add('hidden');
		stopButtons.classList.remove('hidden');
		monitorCard.style.display = 'block';

		// 重置监控统计
		if (!monitorStats.startTime) {
			resetMonitorStats();
		}
	} else {
		initialButtons.classList.remove('hidden');
		stopButtons.classList.add('hidden');
		monitorCard.style.display = 'none';

		// 重置监控数据
		monitorStats.startTime = null;
	}
}

// 重置监控统计
function resetMonitorStats() {
	monitorStats = {
		totalProcessed: 0,
		readingCount: 0,
		aiCount: 0,
		matchCount: 0,
		startTime: Date.now(),
		processingTimes: []
	};
	updateMonitorDisplay();
}

// 更新监控显示
function updateMonitorDisplay() {
	// 更新计数器
	document.getElementById('reading-count').textContent = monitorStats.readingCount;
	document.getElementById('ai-count').textContent = monitorStats.aiCount;
	document.getElementById('match-count-display').textContent = monitorStats.matchCount;
	document.getElementById('total-processed').textContent = monitorStats.totalProcessed;

	// 计算匹配率
	const matchRate = monitorStats.totalProcessed > 0
		? Math.round((monitorStats.matchCount / monitorStats.totalProcessed) * 100)
		: 0;
	document.getElementById('match-rate').textContent = `${matchRate}%`;

	// 计算平均处理时间
	const avgTime = monitorStats.processingTimes.length > 0
		? Math.round(monitorStats.processingTimes.reduce((a, b) => a + b, 0) / monitorStats.processingTimes.length / 1000)
		: 0;
	document.getElementById('avg-time').textContent = `${avgTime}s`;
}

// 更新当前处理的简历信息
function updateCurrentResume(candidateInfo, status = 'processing') {
	if (!candidateInfo) {
		document.getElementById('current-name').textContent = '-';
		document.getElementById('current-age').textContent = '-';
		document.getElementById('current-education').textContent = '-';
		document.getElementById('current-ai-result').textContent = '-';
		document.getElementById('current-status').textContent = '等待中...';
		document.getElementById('current-status').className = 'resume-status';
		return;
	}

	document.getElementById('current-name').textContent = candidateInfo.name || '-';
	document.getElementById('current-age').textContent = candidateInfo.age ? `${candidateInfo.age}岁` : '-';
	document.getElementById('current-education').textContent = candidateInfo.education || '-';

	const statusElement = document.getElementById('current-status');
	statusElement.className = `resume-status ${status}`;

	switch (status) {
		case 'reading':
			statusElement.textContent = '读取简历中...';
			setStatusDot('reading-status', true);
			break;
		case 'ai-analyzing':
			statusElement.textContent = 'AI分析中...';
			setStatusDot('ai-status', true);
			break;
		case 'success':
			statusElement.textContent = '处理完成';
			setStatusDot('match-status', true);
			break;
		case 'failed':
			statusElement.textContent = '处理失败';
			break;
		default:
			statusElement.textContent = '处理中...';
	}
}

// 设置状态指示器
function setStatusDot(dotId, active) {
	const dot = document.getElementById(dotId);
	if (active) {
		dot.classList.add('active');
		// 2秒后自动取消激活状态
		setTimeout(() => {
			dot.classList.remove('active');
		}, 2000);
	} else {
		dot.classList.remove('active');
	}
}

function renderKeywords() {
	const container = document.getElementById('keyword-list');
	if (!container) {
		throw new Error('找不到关键词列表容器');
	}

	// 移除旧的事件监听器
	container.innerHTML = '';

	// 为每个关键词创建元素
	keywords.forEach(keyword => {
		const keywordDiv = document.createElement('div');
		keywordDiv.className = 'tag';
		keywordDiv.innerHTML = `
            ${keyword}
            <button class="tag-remove" data-keyword="${keyword}">&times;</button>
        `;

		// 为删除按钮添加事件监听器
		const removeButton = keywordDiv.querySelector('.tag-remove');
		removeButton.addEventListener('click', () => {
			removeKeyword(keyword);
		});

		container.appendChild(keywordDiv);
	});
}

// 修改添加日志的函数
async function addLog(message, type = 'info') {
	const logContainer = document.getElementById('log-container');
	const logEntry = document.createElement('div');
	logEntry.className = 'log-entry';

	const timestamp = new Date().toLocaleTimeString('zh-CN', {
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});

	let colorClass = 'log-info'; // 默认信息色
	let prefix = '>';

	switch (type) {
		case 'error':
			colorClass = 'log-error';
			prefix = '!';
			break;
		case 'warning':
			colorClass = 'log-warning';
			prefix = '?';
			break;
		case 'success':
			colorClass = 'log-success';
			prefix = '√';
			break;
		case 'info':
			colorClass = 'log-info';
			prefix = '>';
			break;
	}

	logEntry.innerHTML = `
        <span class="log-prefix">${prefix}</span>
        <span class="log-time">[${timestamp}]</span>
        <span class="${colorClass}">${message}</span>
    `;

	logContainer.appendChild(logEntry);

	// 自动滚动到底部
	logContainer.scrollTop = logContainer.scrollHeight;

	// 保存日志到存储
	try {
		const logs = await loadLogs();
		logs.push({
			message,
			type,
			timestamp,
			html: logEntry.innerHTML
		});

		// 只保留最近的100条日志
		if (logs.length > 100) {
			logs.splice(0, logs.length - 100);
		}

		await saveLogs(logs);
	} catch (error) {
		console.error('保存日志失败:', error);
	}
}

// 发送消息
chrome.runtime.sendMessage({ message: "hello" }, function (response) {
	console.log("收到来自接收者的回复：", response);
});

// 修改 chrome.runtime.onMessage 监听器
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
	console.log('插件收到页面收到消息:', message);

	if (message.type === 'RESUME_READING') {
		// 简历读取开始
		const candidateInfo = message.data;
		monitorStats.readingCount++;
		updateCurrentResume(candidateInfo, 'reading');
		updateMonitorDisplay();
		addLog(`正在读取简历: ${candidateInfo.name}`, 'info');

	} else if (message.type === 'AI_ANALYZING') {
		// AI分析开始
		const candidateInfo = message.data;
		monitorStats.aiCount++;
		updateCurrentResume(candidateInfo, 'ai-analyzing');
		updateMonitorDisplay();
		addLog(`AI分析中: ${candidateInfo.name}`, 'info');

	} else if (message.type === 'AI_RESULT') {
		// AI分析结果
		const { candidateInfo, isMatch, processingTime } = message.data;
		document.getElementById('current-ai-result').textContent = isMatch ? '匹配' : '不匹配';

		if (processingTime) {
			monitorStats.processingTimes.push(processingTime);
		}

		addLog(`AI分析结果: ${candidateInfo.name} - ${isMatch ? '匹配' : '不匹配'}`, isMatch ? 'success' : 'warning');

	} else if (message.type === 'MATCH_SUCCESS') {
		const {
			name,
			age,
			education,
			university,
			extraInfo,
			clicked,
			aiMatch
		} = message.data;

		matchCount++;
		monitorStats.matchCount++;
		monitorStats.totalProcessed++;

		// 更新监控显示
		updateCurrentResume(message.data, 'success');
		updateMonitorDisplay();

		let logText = ` [${matchCount}] ${name} `;

		if (extraInfo && extraInfo.length > 0) {
			const extraInfoText = extraInfo
				.map(info => `${info.type}: ${info.value}`)
				.join(' | ');
			logText += ` | ${extraInfoText}`;
		}

		if (clicked) {
			logText += ' [已点击]';
		}

		if (aiMatch !== null) {
			logText += aiMatch ? ' [AI匹配]' : ' [AI不匹配]';
		}

		addLog(logText, 'success');

		// 播放提示音
		if (enableSound) {
			playNotificationSound();
		}

		// 检查是否达到匹配限制
		if (matchCount >= matchLimit) {
			stopAutoScroll();
			addLog(`已达到设定的打招呼数量 ${matchLimit}，自动停止`, 'warning');
			// 播放特殊的完成提示音
			if (enableSound) {
				playNotificationSound();
				// 连续播放两次以示区分
				setTimeout(() => playNotificationSound(), 500);
			}
		}

		await saveState();

	} else if (message.type === 'CANDIDATE_PROCESSED') {
		// 候选人处理完成（无论是否匹配）
		monitorStats.totalProcessed++;
		updateMonitorDisplay();

	} else if (message.type === 'SCROLL_COMPLETE') {
		isRunning = false;
		await saveState();
		updateUI();
		addLog(`滚动完成，共匹配 ${matchCount} 个候选人`, 'success');
		matchCount = 0;

	} else if (message.type === 'LOG_MESSAGE') {
		// 处理日志消息
		addLog(message.data.message, message.data.type);

	} else if (message.type === 'ERROR') {
		addLog(message.error, 'error');
		updateCurrentResume(null, 'failed');
	}
});

// 添加提示音函数
function playNotificationSound() {
	const audio = new Audio(chrome.runtime.getURL('sounds/notification.mp3'));
	audio.volume = 0.5; // 设置音量
	audio.play().catch(error => console.error('播放提示音失败:', error));
}

// 版本检查功能已移除，避免跳转到第三方网站

// 添加职位相关函数
function addPosition() {
	const input = document.getElementById('position-input');
	const positionName = input.value.trim();

	if (positionName && !positions.find(p => p.name === positionName)) {
		const newPosition = {
			name: positionName,
			keywords: [],
			excludeKeywords: []
		};

		positions.push(newPosition);
		renderPositions();
		input.value = '';
		saveSettings();
		selectPosition(positionName);
	}
}

function removePosition(positionName) {
	if (confirm(`确定要删除职位"${positionName}"吗？\n删除后该职位的所有关键词都将被删除。`)) {
		positions = positions.filter(p => p.name !== positionName);
		if (currentPosition?.name === positionName) {
			currentPosition = null;
		}
		renderPositions();
		renderKeywords();
		renderExcludeKeywords();
		saveSettings();
	}
}

function selectPosition(positionName) {
	currentPosition = positions.find(p => p.name === positionName);

	// 更新关键词显示
	keywords = currentPosition ? [...currentPosition.keywords] : [];
	excludeKeywords = currentPosition ? [...currentPosition.excludeKeywords] : [];

	renderKeywords();
	renderExcludeKeywords();
	renderPositions();
}

function renderPositions() {
	const container = document.getElementById('position-list');
	container.innerHTML = '';

	positions.forEach(position => {
		const positionDiv = document.createElement('div');
		positionDiv.className = `tag ${currentPosition?.name === position.name ? 'active' : ''}`;
		positionDiv.innerHTML = `
            ${position.name}
            <button class="tag-remove" data-position="${position.name}">&times;</button>
        `;

		positionDiv.querySelector('button').addEventListener('click', (e) => {
			e.stopPropagation();
			removePosition(position.name);
		});

		positionDiv.addEventListener('click', () => {
			selectPosition(position.name);
		});

		container.appendChild(positionDiv);
	});

	// 如果没有职位,显示提示文本
	if (positions.length === 0) {
		const emptyTip = document.createElement('div');
		emptyTip.style.cssText = 'color: #8e8e93; font-size: 12px; padding: 8px; text-align: center;';
		emptyTip.textContent = '请添加职位...';
		container.appendChild(emptyTip);
	}
}

// 添加通知关键词更新的函数
function notifyKeywordsUpdate() {
	chrome.tabs.query({
		active: true,
		currentWindow: true
	}, tabs => {
		if (tabs[0]) {
			chrome.tabs.sendMessage(tabs[0].id, {
				action: 'UPDATE_KEYWORDS',
				data: {
					keywords: currentPosition.keywords,
					excludeKeywords: currentPosition.excludeKeywords,
					isAndMode: isAndMode
				}
			});
		}
	});
}

// 简历下载功能已移除

// 打赏排行榜功能已移除

// 账号绑定和服务器同步功能已移除
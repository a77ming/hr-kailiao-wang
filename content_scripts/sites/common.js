// 基础解析器类
class BaseParser {
    constructor() {
        this.settings = null;
        this.filterSettings = null;
        
        // 学历等级映射（数字越大等级越高）
        this.educationLevels = {
            '初中': 1,
            '高中': 2,
            '中专': 2,
            '大专': 3,
            '本科': 4,
            '硕士': 5,
            '博士': 6
        };
        // 添加高亮样式
        this.highlightStyles = {
            processing: `
                background-color: #fff3e0 !important;
                transition: background-color 0.3s ease;
                outline: 2px solid #ffa726 !important;
            `,
            matched: `
                background-color: #e8f5e9 !important;
                transition: background-color 0.3s ease;
                outline: 2px solid #4caf50 !important;
                box-shadow: 0 0 10px rgba(76, 175, 80, 0.3) !important;
            `
        };
        this.clickCandidateConfig = {
            enabled: true,
            frequency: 3,  // 默认每浏览10个点击3个
            viewDuration: [3, 5]  // 查看时间将从页面设置获取
        };
    }

    async loadSettings() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['keywords', 'isAndMode'], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }
                this.settings = result;
                resolve(result);
            });
        });
    }

    setFilterSettings(settings) {
        this.filterSettings = { ...this.filterSettings, ...settings };
    }

    // 基础的筛选方法
    filterCandidate(candidate) {
        console.log('🔍 开始筛选候选人:', candidate.name);
        console.log('📋 候选人信息:', {
            name: candidate.name,
            age: candidate.age,
            education: candidate.education,
            university: candidate.university
        });
        console.log('⚙️ 筛选设置:', this.filterSettings);
        
        if (!this.filterSettings) {
            console.log('⚠️ 没有筛选设置，返回所有候选人');
            return true;  // 如果没有设置，默认匹配所有
        }

        // 年龄筛选 - 硬性要求，优先检查
        if (this.filterSettings.enableAgeFilter) {
            console.log('🎯 年龄筛选已启用');
            const candidateAge = parseInt(candidate.age, 10);

            // 如果年龄信息无效或缺失，则直接过滤
            if (isNaN(candidateAge) || candidateAge <= 0) {
                console.log('❌ 年龄信息无效或缺失，已过滤');
                return false;
            }

            console.log(`📊 候选人年龄: ${candidateAge}, 设置范围: ${this.filterSettings.ageMin}-${this.filterSettings.ageMax}`);

            const minAge = this.filterSettings.ageMin;
            const maxAge = this.filterSettings.ageMax;

            if (minAge != null && candidateAge < minAge) {
                console.log(`❌ 年龄不符合要求: ${candidateAge}岁 < ${minAge}岁`);
                return false;
            }
            if (maxAge != null && candidateAge > maxAge) {
                console.log(`❌ 年龄不符合要求: ${candidateAge}岁 > ${maxAge}岁`);
                return false;
            }
            console.log('✅ 年龄筛选通过');
        } else {
            console.log('⚪ 年龄筛选未启用');
        }

        // 学历筛选 - 硬性要求
        if (this.filterSettings.enableEducationFilter && this.filterSettings.educationLevel) {
            const requiredLevel = this.educationLevels[this.filterSettings.educationLevel];
            if (requiredLevel) {
                const candidateEducation = candidate.education || '';
                let candidateLevel = 0;
                let matchedEducation = '';
                
                // 查找候选人学历等级（优先匹配最高学历）
                for (const [education, level] of Object.entries(this.educationLevels)) {
                    if (candidateEducation.includes(education)) {
                        if (level > candidateLevel) {
                            candidateLevel = level;
                            matchedEducation = education;
                        }
                    }
                }
                
                // 如果找到了学历信息但等级不够，则过滤
                if (candidateLevel > 0 && candidateLevel < requiredLevel) {
                    console.log(`学历不符合要求: ${matchedEducation} (等级${candidateLevel}) < ${this.filterSettings.educationLevel} (等级${requiredLevel})`);
                    return false;
                }
                
                // 如果没有找到任何学历信息，也过滤掉（除非设置为不限）
                if (candidateLevel === 0) {
                    console.log(`学历信息不明确或缺失: "${candidateEducation}"`);
                    return false;
                }
            }
        }

        // 合并所有需要匹配的文本
        const allText = [
            candidate.name,
            candidate.age?.toString(),
            candidate.education,
            candidate.university,
            candidate.description,
            ...(candidate.extraInfo?.map(info => `${info.type}:${info.value}`) || [])
        ].filter(Boolean).join(' ').toLowerCase();

        //console.log('检查文本:', allText);
        
        // 检查排除关键词
        if (this.filterSettings.excludeKeywords && 
            this.filterSettings.excludeKeywords.some(keyword => 
                allText.includes(keyword.toLowerCase())
            )) {
            //console.log('匹配到排除关键词');
            return false;
        }

        // 如果没有关键词，匹配所有
        if (!this.filterSettings.keywords || !this.filterSettings.keywords.length) {
            //console.log('没有设置关键词，匹配所有');
            return true;
        }

        if (this.filterSettings.isAndMode) {
            // 与模式：所有关键词都必须匹配
            return this.filterSettings.keywords.every(keyword => {
                if (!keyword) return true;
                return allText.includes(keyword.toLowerCase());
            });
        } else {

            // 或模式：匹配任一关键词即可
            return this.filterSettings.keywords.some(keyword => {
                if (!keyword) return false;
                return allText.includes(keyword.toLowerCase());
            });
        }
    }

    // AI匹配方法
    async checkAiMatch(candidate) {
        if (!this.filterSettings?.enableAiMatch || !this.filterSettings?.jobDescription) {
            return true; // 如果未启用AI匹配或没有JD，直接通过
        }

        try {
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'AI_MATCH_CHECK',
                    candidateInfo: candidate,
                    jobDescription: this.filterSettings.jobDescription
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                });
            });

            if (response.status === 'success') {
                return response.isMatch;
            } else {
                console.error('AI匹配检查失败:', response.error);
                return true; // 失败时默认通过
            }
        } catch (error) {
            console.error('AI匹配检查出错:', error);
            return true; // 出错时默认通过
        }
    }

    // 添加高亮方法
    highlightElement(element, type = 'processing') {
        if (element && this.highlightStyles[type]) {
            element.style.cssText = this.highlightStyles[type];
        }
    }

    // 清除高亮
    clearHighlight(element) {
        if (element) {
            element.style.cssText = '';
        }
    }

    // 添加提取额外信息的方法
    extractExtraInfo(element, extraSelectors) {
        const extraInfo = [];
        if (Array.isArray(extraSelectors)) {
            extraSelectors.forEach(selector => {
                const elements = this.getElementsByClassPrefix(element, selector.prefix);
                if (elements.length > 0) {
                    elements.forEach(el => {
                        const info = el.textContent?.trim();
                        if (info) {
                            extraInfo.push({
                                type: selector.type || 'unknown',
                                value: info
                            });
                        }
                    });
                }
            });
        }
        return extraInfo;
    }

    // 获取所有匹配前缀的元素
    getElementsByClassPrefix(parent, prefix) {
        const elements = [];
        // 使用前缀开头匹配
        const startsWith = Array.from(parent.querySelectorAll(`[class^="${prefix}"]`));
        // 使用包含匹配
        const contains = Array.from(parent.querySelectorAll(`[class*=" ${prefix}"]`));
        
        return [...new Set([...startsWith, ...contains])];
    }

    // 添加基础的点击方法
    clickMatchedItem(element) {
        // 默认实现，子类可以覆盖
        console.warn('未实现点击方法');
        return false;
    }

    // 添加新方法
    setClickCandidateConfig(config) {
        this.clickCandidateConfig = {
            ...this.clickCandidateConfig,
            ...config
        };
    }

    // 基础的随机点击判断方法
    shouldClickCandidate() {
        if (!this.clickCandidateConfig.enabled) return false;
        let random = Math.random() * 10;
        //console.log('随机数:', random);
        //console.log('频率:', this.clickCandidateConfig.frequency);
        //console.log('结果:', random <= (this.clickCandidateConfig.frequency));
        
        return random <= (this.clickCandidateConfig.frequency);
    }

    // 获取随机查看时间
    getRandomViewDuration() {
        // 使用 filterSettings 中的延迟设置
        const min = this.filterSettings?.scrollDelayMin || 3;
        const max = this.filterSettings?.scrollDelayMax || 5;
        return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
    }

    // 基础的点击候选人方法（需要被子类重写）
    async clickCandidateDetail(element) {
        throw new Error('clickCandidateDetail method must be implemented by child class');
    }

    // 基础的关闭详情方法（需要被子类重写）
    async closeDetail() {
        throw new Error('closeDetail method must be implemented by child class');
    }
}

export { BaseParser }; 
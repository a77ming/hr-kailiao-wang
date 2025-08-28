import { BaseParser } from './common.js';

class BossParser extends BaseParser {
    constructor() {
        super();
        // 定义完整的 class 名称
        this.fullClasses = {
            container: 'card-list',
            items: 'candidate-card-wrap',
            name: 'name',
            age: 'job-card-left_labels__wVUfs',
            education: 'base-info join-text-wrap',
            university: 'content join-text-wrap',
            description: 'content',
            clickTarget: 'btn btn-greet'
        };
        this.urlInfo = {
            url: '/web/chat/recommend',
            site: '推荐牛人'
        };
        
        // 定义部分 class 名称（用于模糊匹配）
        this.selectors = {
            container: 'card-list',
            items: 'candidate-card-wrap',
            name: 'name',
            age: 'job-card-left',
            education: 'base-info join-text-wrap',
            university: 'content join-text-wrap',
            description: 'content',
            clickTarget: 'btn btn-greet',
            extraSelectors: [
                { prefix: 'salary-text', type: '薪资' },
                { prefix: 'job-info-primary', type: '基本信息' },
                { prefix: 'tags-wrap', type: '标签' },
                { prefix: 'content join-text-wrap', type: '公司信息' }
            ]
        };

        // BOSS特定的选择器
        this.detailSelectors = {
            detailLink: 'card-inner common-wrap',
            closeButton: 'boss-popup__close'
        };
    }

    // 添加一个新的查找元素的方法
    findElements() {
        let items = [];
        
        // 1. 首先尝试使用完整的 class 名称
        items = document.getElementsByClassName(this.fullClasses.items);
        
        if (items.length === 0) {
            // 2. 尝试使用简单的 class 名称
            items = document.getElementsByClassName(this.selectors.items);
        }
        
        if (items.length === 0) {
            // 3. 尝试使用模糊匹配
            items = document.querySelectorAll(`[class*="${this.selectors.items}"]`);
        }
        
        if (items.length === 0) {
            // 4. 尝试使用前缀匹配
            items = document.querySelectorAll(`[class^="${this.selectors.items}"], [class*=" ${this.selectors.items}"]`);
        }

        return items;
    }

    extractCandidates(elements = null) {
        //console.log('开始提取 BOSS 直聘信息');
        
        const candidates = [];
        let items;
        
        try {
            if (elements) {
                items = elements;
            } else {
                items = this.findElements();
                
                if (items.length === 0) {
                    // 输出更多调试信息
                   
                    
                    // 修改 class 列表的获取方式
                    const allClasses = Array.from(document.querySelectorAll('*'))
                        .map(el => {
                            if (el instanceof SVGElement) {
                                return el.className.baseVal;
                            }
                            return el.className;
                        })
                        .filter(className => {
                            return className && typeof className === 'string' && className.trim() !== '';
                        });

                    //console.log('页面上所有的 class:', allClasses.join('\n'));
                    throw new Error('未找到任何元素，请检查选择器是否正确');
                }
            }
            
            
            Array.from(items).forEach((item, index) => {
                this.highlightElement(item, 'processing');
                
                try {
                    // 使用多种方式查找子元素
                    const findElement = (fullClass, partialClass) => {
                        return item.getElementsByClassName(fullClass)[0] ||
                               item.getElementsByClassName(partialClass)[0] ||
                               item.querySelector(`[class*="${partialClass}"]`);
                    };

                    const nameElement = findElement(this.fullClasses.name, this.selectors.name);
                    const ageElement = findElement(this.fullClasses.age, this.selectors.age);
                    const educationElement = findElement(this.fullClasses.education, this.selectors.education);
                    const universityElement = findElement(this.fullClasses.university, this.selectors.university);
                    const descriptionElement = findElement(this.fullClasses.description, this.selectors.description);
                    
                  

                    const extraInfo = this.extractExtraInfo(item, this.selectors.extraSelectors);
                    
                    const candidate = {
                        name: nameElement?.textContent?.trim() || '',
                        age: this.extractAge(ageElement?.textContent),
                        education: educationElement?.textContent?.trim() || '',
                        university: universityElement?.textContent?.trim() || '',
                        description: descriptionElement?.textContent?.trim() || '',
                        extraInfo: extraInfo
                    };
                    
                    
                    if (candidate.name) {
                        candidates.push(candidate);
                        this.highlightElement(item, 'matched');
                    } else {
                        this.clearHighlight(item);
                    }
                } catch (error) {
                    console.error(`处理第 ${index + 1} 个元素时出错:`, error);
                    this.clearHighlight(item);
                }
            });
            
        } catch (error) {
            console.error('提取信息失败:', error);
            throw error;
        }
        
        return candidates;
    }

    extractAge(text) {
        console.log('🔍 提取年龄信息，原始文本:', text);
        if (!text) {
            console.log('⚠️ 年龄文本为空');
            return 0;
        }
        const matches = text.match(/(\d+)岁/);
        const age = matches ? parseInt(matches[1]) : 0;
        console.log('📊 提取到的年龄:', age);
        return age;
    }

    clickMatchedItem(element) {

        console.log('打招呼:', element);
        try {
            // 使用多种方式查找点击目标
            const clickElement = element.getElementsByClassName(this.fullClasses.clickTarget)[0] ||
                               element.getElementsByClassName(this.selectors.clickTarget)[0] ||
                               element.querySelector(`[class*="${this.selectors.clickTarget}"]`);
            //console.log('点击元素:', clickElement);
            if (clickElement) {
                clickElement.click();
                return true;
            }
            return false;
        } catch (error) {
            console.error('点击元素时出错:', error);
            return false;
        }
    }

    // 实现点击候选人详情方法
    async clickCandidateDetail(element) {
        //console.log(element);
        
        try {
            const detailLink = element.getElementsByClassName(this.detailSelectors.detailLink)[0];
            //console.log(detailLink);
            if (detailLink) {
                detailLink.click();
                return true;
            }
            return false;
        } catch (error) {
            console.error('点击候选人详情失败:', error);
            return false;
        }
    }

    // 实现关闭详情方法
    async closeDetail() {
        try {
            const closeButton = document.getElementsByClassName(this.detailSelectors.closeButton)[0];

            
            if (closeButton) {
                closeButton.click();
                return true;
            }else{
                console.error("页面关闭失败");
                
            }
            return false;
        } catch (error) {
            console.error('关闭详情失败:', error);
            return false;
        }
    }
}

export { BossParser }; 
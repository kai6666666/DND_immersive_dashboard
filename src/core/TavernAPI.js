// src/core/TavernAPI.js
// src/core/TavernAPI.js

export const TavernAPI = {
    getDatabaseAPI: function() {
        try {
            return window.AutoCardUpdaterAPI
                || (window.parent && window.parent.AutoCardUpdaterAPI)
                || (window.top && window.top.AutoCardUpdaterAPI)
                || null;
        } catch (e) {
            console.error('[TavernAPI] 获取数据库 API 失败:', e);
            return window.AutoCardUpdaterAPI || null;
        }
    },

    // 获取全局核心对象（兼容 iframe 和 父窗口）
    getCore: function() {
        let st = null;
        let helper = null;
        
        // 尝试从不同层级获取 SillyTavern 对象
        try {
            if (window.SillyTavern) st = window.SillyTavern;
            else if (window.parent && window.parent.SillyTavern) st = window.parent.SillyTavern;
            else if (window.top && window.top.SillyTavern) st = window.top.SillyTavern;
            
            if (window.TavernHelper) helper = window.TavernHelper;
            else if (window.parent && window.parent.TavernHelper) helper = window.parent.TavernHelper;
            else if (window.top && window.top.TavernHelper) helper = window.top.TavernHelper;
        } catch(e) {
            console.error('[TavernAPI] 获取核心对象失败:', e);
        }

        return {
            SillyTavern: st,
            TavernHelper: helper
        };
    },

    getDatabaseAIStatus: function() {
        const api = this.getDatabaseAPI();
        let presets = [];
        let tablePreset = '';
        let plotPreset = '';

        try {
            if (api?.getApiPresets) presets = api.getApiPresets() || [];
            if (api?.getTableApiPreset) tablePreset = api.getTableApiPreset() || '';
            if (api?.getPlotApiPreset) plotPreset = api.getPlotApiPreset() || '';
        } catch (e) {
            console.warn('[TavernAPI] 读取数据库 AI 状态失败:', e);
        }

        return {
            available: !!(api && typeof api.callAI === 'function'),
            presetCount: Array.isArray(presets) ? presets.length : 0,
            tablePreset,
            plotPreset
        };
    },

    /**
     * 规范化 API URL (去除尾部斜杠，去除 /chat/completions)
     */
    _normalizeUrl: function(url) {
        if (!url) return '';
        let cleanUrl = url.trim();
        // 去除尾部斜杠
        while (cleanUrl.endsWith('/')) {
            cleanUrl = cleanUrl.slice(0, -1);
        }
        // 如果用户不小心加了 /chat/completions，尝试去除
        if (cleanUrl.endsWith('/chat/completions')) {
            cleanUrl = cleanUrl.replace(/\/chat\/completions$/, '');
        }
        return cleanUrl;
    },

    /**
     * 获取所有可用的 API 连接预设
     * @returns {Array} 预设列表 [{id, name}, ...]
     */
    getPresets: function() {
        const { SillyTavern } = this.getCore();
        
        console.log('[TavernAPI] 正在尝试获取 API 预设...');
        if (!SillyTavern) {
            console.error('[TavernAPI] 未找到 SillyTavern 对象');
            return [];
        }

        // 路径 A: 标准路径
        if (SillyTavern.extensionSettings?.connectionManager?.profiles) {
            return SillyTavern.extensionSettings.connectionManager.profiles;
        }
        
        // 路径 B: 可能是 connection 而不是 connectionManager
        if (SillyTavern.extensionSettings?.connection?.profiles) {
            return SillyTavern.extensionSettings.connection.profiles;
        }

        // 路径 C: 尝试从 contexts 中查找 (某些新版架构)
        if (SillyTavern.contexts?.connection?.profiles) {
            return SillyTavern.contexts.connection.profiles;
        }

        console.warn('[TavernAPI] 未能找到 connectionManager.profiles，请检查酒馆版本');
        return [];
    },

    /**
     * 获取自定义 API 的模型列表 (通过酒馆后端检查连接)
     * @param {string} apiUrl - API 基础 URL
     * @param {string} apiKey - API 密钥
     * @returns {Promise<Array>} 模型列表 ['model1', 'model2']
     */
    fetchModels: async function(rawApiUrl, apiKey) {
        if (!rawApiUrl) throw new Error('API URL 不能为空');
        
        const apiUrl = this._normalizeUrl(rawApiUrl);

        // 确保 URL 格式正确 (指向 status 接口或 models 接口)
        const statusUrl = '/api/backends/chat-completions/status';
        const { SillyTavern } = this.getCore();
        
        const body = {
            "reverse_proxy": apiUrl,
            "proxy_password": "",
            "chat_completion_source": "custom",
            "custom_url": apiUrl,
            "custom_include_headers": apiKey ? `Authorization: Bearer ${apiKey}` : ""
        };

        const response = await fetch(statusUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(SillyTavern?.getRequestHeaders ? SillyTavern.getRequestHeaders() : {})
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`连接失败: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        // Tavern 返回格式兼容: { models: [...] } 或直接数组 或 { data: [...] }
        let models = [];
        if (data.models && Array.isArray(data.models)) models = data.models;
        else if (Array.isArray(data)) models = data;
        else if (data.data && Array.isArray(data.data)) models = data.data;

        return models.map(m => (typeof m === 'string' ? m : m.id));
    },

    /**
     * 发送请求给 AI
     * @param {Array} messages - 消息数组 [{role: 'user', content: '...'}, ...]
     * @param {Object} options - 配置项
     * @param {string} [options.presetId] - (可选) API预设ID，留空则使用主API
     * @param {Object} [options.customConfig] - (可选) 自定义配置 { url, key, model }，优先级高于 presetId
     * @param {number} [options.maxTokens=4096] - 最大生成长度
     * @returns {Promise<string>} AI回复的内容
     */
    generate: async function(messages, options = {}) {
        const { SillyTavern, TavernHelper } = this.getCore();
        const { presetId, customConfig, maxTokens = 4096, useDatabaseAPI = false } = options;

        if (useDatabaseAPI) {
            const dbApi = this.getDatabaseAPI();
            if (!dbApi || typeof dbApi.callAI !== 'function') {
                throw new Error('当前数据库 API 未提供 callAI()');
            }

            const response = await dbApi.callAI(messages, { max_tokens: maxTokens });
            if (!response) {
                throw new Error('数据库 AI 调用失败，请检查数据库中的 AI 配置');
            }
            return typeof response === 'string' ? response.trim() : String(response).trim();
        }

        if (!SillyTavern && !TavernHelper) {
            throw new Error("SillyTavern 核心 API 未就绪");
        }

        // --- 方式 C: 使用自定义配置 (通过酒馆后端代理调用) ---
        if (customConfig && customConfig.url && customConfig.model) {
            console.log(`[TavernAPI] 使用自定义配置发送请求: ${customConfig.url}`);
            
            const { url: rawApiUrl, key: apiKey, model } = customConfig;
            const apiUrl = this._normalizeUrl(rawApiUrl);

            try {
                const requestBody = {
                    messages: messages,
                    model: model,
                    max_tokens: maxTokens,
                    temperature: 0.7,
                    top_p: 0.9,
                    stream: false,
                    chat_completion_source: 'custom',
                    reverse_proxy: apiUrl,
                    proxy_password: '',
                    custom_url: apiUrl,
                    custom_include_headers: apiKey ? `Authorization: Bearer ${apiKey}` : '',
                    enable_web_search: false,
                    request_images: false
                };

                const response = await fetch('/api/backends/chat-completions/generate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(SillyTavern?.getRequestHeaders ? SillyTavern.getRequestHeaders() : {})
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`API 请求失败: ${response.status} - ${errText}`);
                }

                const data = await response.json();
                
                if (data && data.choices && data.choices[0] && data.choices[0].message) {
                    return data.choices[0].message.content.trim();
                } else if (data && data.content) {
                    return data.content.trim();
                } else {
                    throw new Error('API 返回了意外的数据结构');
                }
            } catch (err) {
                console.error('[TavernAPI] Proxy Fetch Error:', err);
                throw err;
            }
        }

        // --- 方式 A: 使用指定的 API 预设 (通过酒馆后端代理调用) ---
        else if (presetId) {
            console.log(`[TavernAPI] 使用预设 ID: ${presetId} 发送请求`);
            
            // 1. 检查预设是否存在
            const profile = this.getPresets().find(p => p.id === presetId);
            if (!profile) throw new Error(`找不到 ID 为 "${presetId}" 的 API 预设`);

            // 2. 提取配置
            let apiKey = profile.api_key || profile.key || '';
            let apiUrl = profile.api_url || profile.url || '';
            let model = profile.openai_model || profile.model || 'gpt-3.5-turbo';
            
            // 特殊处理：如果是 settings 嵌套对象
            if (profile.settings) {
                apiKey = apiKey || profile.settings.api_key || profile.settings.key;
                apiUrl = apiUrl || profile.settings.api_url || profile.settings.url;
                model = model || profile.settings.openai_model || profile.settings.model;
            }

            if (!apiUrl) {
                throw new Error(`无法从预设 "${presetId}" 中解析出 API URL。`);
            }

            // 规范化 URL
            apiUrl = this._normalizeUrl(apiUrl);

            console.log(`[TavernAPI] Proxy via Backend: ${apiUrl}, Model: ${model}`);

            try {
                // 构造 Tavern 后端代理请求体
                const requestBody = {
                    messages: messages,
                    model: model,
                    max_tokens: maxTokens,
                    temperature: 0.7,
                    top_p: 0.9,
                    stream: false,
                    chat_completion_source: 'custom',
                    reverse_proxy: apiUrl,
                    proxy_password: '',
                    custom_url: apiUrl,
                    custom_include_headers: apiKey ? `Authorization: Bearer ${apiKey}` : '',
                    enable_web_search: false,
                    request_images: false
                };

                const response = await fetch('/api/backends/chat-completions/generate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(SillyTavern?.getRequestHeaders ? SillyTavern.getRequestHeaders() : {})
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`API 请求失败: ${response.status} - ${errText}`);
                }

                const data = await response.json();
                
                // 解析结果 (兼容不同的返回结构)
                if (data && data.choices && data.choices[0] && data.choices[0].message) {
                    return data.choices[0].message.content.trim();
                } else if (data && data.content) {
                    return data.content.trim();
                } else {
                    throw new Error('API 返回了意外的数据结构');
                }
            } catch (err) {
                console.error('[TavernAPI] Proxy Fetch Error:', err);
                throw err;
            }
        }
        
        // --- 方式 B: 直接使用当前主 API ---
        else {
            console.log(`[TavernAPI] 使用主 API 发送请求`);
            
            const response = await TavernHelper.generateRaw({
                ordered_prompts: messages,
                should_stream: false,
            });
            
            return response.trim();
        }
    },


    /**
     * 获取酒馆中所有可用的世界书名称列表 (四重真实保障提取)
     * @returns {Promise<Array<string>>}
     */
    getAllWorldbookNames: async function() {
        const { TavernHelper, SillyTavern } = this.getCore();
        const names = new Set();

        // 1. 最强绝对保障：直接请求酒馆后端官方接口，获取底层字典键名
        try {
            const headers = SillyTavern?.getRequestHeaders ? SillyTavern.getRequestHeaders() : {};
            const res = await fetch('/api/worldinfo', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json', ...headers }
            });
            if (res.ok) {
                const data = await res.json();
                // 返回的 data 是以世界书名字为 Key 的对象字典
                if (data && typeof data === 'object' && !Array.isArray(data)) {
                    Object.keys(data).forEach(k => names.add(String(k).trim()));
                }
            }
        } catch (e) {
            console.warn('[TavernAPI] 通过 GET /api/worldinfo 获取失败:', e);
        }

        // 2. 保障二：读取酒馆原生前端全局变量 (兼容旧版非模块化酒馆)
        try {
            const win = window.parent || window;
            if (win.world_names && Array.isArray(win.world_names)) {
                win.world_names.forEach(n => names.add(String(n).trim()));
            }
            if (win.world_info_data) {
                Object.keys(win.world_info_data).forEach(n => names.add(String(n).trim()));
            }
        } catch (e) {}

        // 3. 保障三：DOM 暴力抓取 (直接去酒馆页面找所有相关的下拉框)
        try {
            const { $ } = getCore();
            if ($) {
                const doc = window.parent?.document || window.document;
                $(doc).find('#world_editor_select option, #character_world_info option, .world_info_select option').each(function() {
                    const val = $(this).attr('value') || $(this).text();
                    if (val && !['', 'none', 'null', '0'].includes(String(val).toLowerCase()) && !val.startsWith('--')) {
                        names.add(String(val).trim());
                    }
                });
            }
        } catch (e) {}

        // 4. 保障四：从酒馆助手获取当前已绑定的世界书 (兜底)
        try {
            if (TavernHelper) {
                if (typeof TavernHelper.getGlobalWorldbookNames === 'function') {
                    (TavernHelper.getGlobalWorldbookNames() || []).forEach(n => names.add(String(n).trim()));
                }
                if (typeof TavernHelper.getChatWorldbookName === 'function') {
                    const cb = TavernHelper.getChatWorldbookName('current');
                    if (cb) names.add(String(cb).trim());
                }
                if (typeof TavernHelper.getCharWorldbookNames === 'function') {
                    const cbs = TavernHelper.getCharWorldbookNames('current') || {};
                    if (cbs.primary) names.add(String(cbs.primary).trim());
                    if (Array.isArray(cbs.additional)) cbs.additional.forEach(n => names.add(String(n).trim()));
                }
            }
        } catch (e) {}

        // 过滤掉系统自带的占位符选项和空值
        const result = Array.from(names).filter(n => 
            n && 
            n !== 'No World Info' && 
            n !== 'Select World Info' && 
            n !== 'No specific world'
        );
        
        console.log('[TavernAPI] 已成功获取酒馆世界书列表:', result);
        return result;
    },

    /**
     * 获取当前启用的世界书内容
     * @returns {Promise<string>} 世界书内容摘要
     */
    getEnabledWorldInfo: async function(customWorldbooks = null) {
        const { TavernHelper } = this.getCore();
        if (!TavernHelper) return '';

        try {
            const worldbooks = new Set();
            
            // 1. 如果传入了自定义世界书名称，则优先读取指定的世界书
            if (customWorldbooks) {
                const list = Array.isArray(customWorldbooks) ? customWorldbooks : [customWorldbooks];
                list.filter(Boolean).forEach(n => worldbooks.add(String(n).trim()));
            } else {
                // 2. 未指定时：自动读取酒馆当前全局、聊天与角色绑定的世界书
                if (TavernHelper.getGlobalWorldbookNames) {
                    const globals = TavernHelper.getGlobalWorldbookNames();
                    if (Array.isArray(globals)) globals.forEach(n => worldbooks.add(n));
                }

                if (TavernHelper.getChatWorldbookName) {
                    const chatBook = TavernHelper.getChatWorldbookName('current');
                    if (chatBook) worldbooks.add(chatBook);
                }

                if (TavernHelper.getCharWorldbookNames) {
                    const charBooks = TavernHelper.getCharWorldbookNames('current');
                    if (charBooks) {
                        if (charBooks.primary) worldbooks.add(charBooks.primary);
                        if (Array.isArray(charBooks.additional)) charBooks.additional.forEach(n => worldbooks.add(n));
                    }
                }
            }

            if (worldbooks.size === 0) return '';

            let context = "【当前世界观/规则参考 (World Info)】\n";
            
            // 获取条目内容
            for (const bookName of worldbooks) {
                if (TavernHelper.getWorldbook) {
                    const entries = await TavernHelper.getWorldbook(bookName);
                    if (entries && entries.length > 0) {
                        context += `\n--- 世界书: ${bookName} ---\n`;

                        // [新增] 排除关键词列表（可在此自由增减需要忽略的词）
                        const excludeWords = ['命定系统', '纪要-', 'TavernDB-', '角色信息-', '角色属性'];

                        // 筛选启用条目，并直接剔除包含排除词的条目
                        const activeEntries = entries.filter(e => {
                            if (!e.enabled) return false;
                            const text = ((Array.isArray(e.keys) ? e.keys : []).join(',') + (e.content || '')).toLowerCase();
                            return !excludeWords.some(w => text.includes(w.toLowerCase()));
                        });
                        
                        // 简单摘要: 仅提取关键字和部分内容，避免 Token 过多
                        // 优先提取: 职业, 种族, 等级, 魔法, 规则


                        const relevantEntries = activeEntries.filter(e => {
                            const keys = (Array.isArray(e.keys) ? e.keys : []).join(',').toLowerCase();
                            const content = (e.content || '').toLowerCase();
                            return keys.includes('数值') || keys.includes('世界') || keys.includes('规则') || keys.includes('设定') || keys.includes('技能') || keys.includes('魔法') || keys.includes('法术') || keys.includes('战技') || keys.includes('种族') || keys.includes('等级') ||
                                   content.includes('数值') || content.includes('世界') || content.includes('规则') || content.includes('设定') || content.includes('技能') || content.includes('魔法') || content.includes('法术') || content.includes('战技') || content.includes('种族') || content.includes('等级')
                        });
                        const targetEntries = relevantEntries;


                        // const targetEntries = activeEntries;



                        targetEntries.forEach(e => {
                            const keysStr = Array.isArray(e.keys) ? e.keys.join(', ') : '无关键字';
                            context += `[${keysStr}]: ${e.content}\n`;
                        });
                    }
                }
            }
            
            return context;

        } catch (e) {
            console.error('[TavernAPI] 获取世界书失败:', e);
            return '';
        }
    }
};

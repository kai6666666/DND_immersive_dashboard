// src/data/DataManager.js
import { getCore } from '../core/Utils.js';
import { DiceManager } from './DiceManager.js';

export const DataManager = {
    // [新增] 查找表键名 (模糊匹配)
    findTableKey: (rawData, nameFragment) => {
        if (!rawData) return null;
        
        // 19 张核心业务表的【英文 / 拼音 / 中文】映射字典
        const aliasMap = {
            // 1. 系统与全局
            'SYS_GlobalState': '全局状态', 'SYS_GlobalStatus': '全局状态', 'quanjuzhuangtai': '全局状态',
            
            // 2. NPC管理
            'NPC_Registry': 'NPC', 'npczhuce': 'NPC',
            
            // 3. 物品与背包
            'ITEM_Inventory': '背包', 'beibao': '背包',
            
            // 4. 任务系统
            'QUEST_Active': '任务', 'QUESTTracker': '任务', 'renwu': '任务',
            
            // 5. 阵营势力
            'FACTION_Standing': '势力', 'shilishengwang': '势力',
            
            // 6. 战斗遭遇
            'COMBAT_Encounter': '战斗遭遇', 'zhandouzaoyu': '战斗遭遇',
            
            // 7. 战术地图
            'COMBAT_BattleMap': '战斗地图', 'zhandouditu': '战斗地图',
            
            // 8. 轮次纪要
            'LOG_Summary': '纪要', 'jiyaobiao': '纪要',
            
            // 9. 行动选项
            'UI_ActionOptions': '行动选项', 'xingdongxuanxiang': '行动选项',
            
            // 10. 随机数骰子池
            'DICE_Pool': '骰子池', 'touzichi': '骰子池',
            
            // 11. 技能法术库
            'SKILL_Library': '技能/法术库', 'jinengfashuku': '技能/法术库', 'jinengku': '技能', 'fashuku': '法术',
            
            // 12. 角色技能关联
            'CHARACTER_Skills': '角色技能关联', 'juesejinengguanlian': '角色技能关联', 'jinengguanlian': '技能关联',
            
            // 13. 专长特性库
            'FEAT_Library': '专长库', 'zhuanchangku': '专长库', 'texingku': '专长库',
            
            // 14. 角色专长关联
            'CHARACTER_Feats': '角色专长关联', 'juesezhuanchangguanlian': '角色专长关联', 'zhuanchangguanlian': '专长关联',
            
            // 15. 角色档案
            'CHARACTER_Registry': '角色表', 'juesebiao': '角色表', 'juesezhuce': '角色表',
            
            // 16. 角色战斗属性
            'CHARACTER_Attributes': '角色属性', 'jueseshuxing': '角色属性',
            
            // 17. 角色资源池
            'CHARACTER_Resources': '角色资源', 'jueseziyuan': '角色资源',
            
            // 18. 探索地图数据
            'EXPLORATION_MapData': '探索地图数据', 'tansuoditushuju': '探索地图数据',
            
            // 19. 战斗地图绘制
            'COMBAT_Map_Visuals': '战斗地图绘制', 'zhandoudituhuizhi': '战斗地图绘制'
        };

        const target = aliasMap[nameFragment] || nameFragment;

        return Object.keys(rawData).find(k =>
            k.toLowerCase().includes(nameFragment.toLowerCase()) ||
            (rawData[k].uid && rawData[k].uid.toLowerCase().includes(nameFragment.toLowerCase())) ||
            (rawData[k].name && rawData[k].name.includes(target))
        ) || null;
    },

    // [新增] 在数据对象中应用系统通知 (不立即保存)
    applySystemNotification: (rawData, text) => {
        if (!rawData) return;
        let sheetKey = Object.keys(rawData).find(k => k.includes('SYS_GlobalState') || (rawData[k].name && rawData[k].name.includes('全局状态')));
        if (!sheetKey) return;
        
        const sheet = rawData[sheetKey];
        if (!sheet.content || sheet.content.length < 2) return;
        
        // 查找或创建 '系统通知' 列
        let colIndex = sheet.content[0].indexOf('系统通知');
        if (colIndex === -1) {
            sheet.content[0].push('系统通知');
            colIndex = sheet.content[0].length - 1;
            // 确保数据行有足够的列
            if (sheet.content[1].length <= colIndex) {
                sheet.content[1][colIndex] = null;
            }
        }
        
        // 写入文本
        sheet.content[1][colIndex] = text;
    },

    // [新增] 独立的设置通知函数 (立即保存)
    setSystemNotification: async (text) => {
        const rawData = DataManager.getAllData();
        DataManager.applySystemNotification(rawData, text);
        await DiceManager.saveData(rawData);
    },

    getAPI: () => getCore().getDB(),
    
    // 增加一个辅助获取 Core 的方法，供其他模块使用（如 DiceManager）
    getCore: getCore,

    // 通用解析器：支持 JSON 和自定义字符串格式
    parseValue: (val, type = 'json') => {
        if (!val) return null;
        if (typeof val === 'object') return val;
        
        // 字符串格式解析 (优先尝试字符串解析)
        if (typeof val === 'string') {
            // 如果看起来像 JSON，尝试 JSON 解析 (为了兼容旧数据)
            if (val.trim().startsWith('{') || val.trim().startsWith('[')) {
                try {
                    const parsed = JSON.parse(val);
                    if (parsed && typeof parsed === 'object') return parsed;
                } catch (e) {}
            }

            if (type === 'stats') {
                // 格式: STR:16|DEX:14 或 json
                const stats = {};
                // 处理 JSON 字符串格式: {"STR":16,...}
                if (val.trim().startsWith('{')) {
                    try {
                        const parsed = JSON.parse(val);
                        if (parsed) return parsed;
                    } catch(e) {}
                }
                
                // 处理自定义字符串格式
                val.split('|').forEach(part => {
                    const [k, v] = part.split(':');
                    if (k && v) stats[k.trim()] = isNaN(v) ? v : parseInt(v);
                });
                return Object.keys(stats).length > 0 ? stats : null;
            }
            if (type === 'coord') {
                // 格式: 7,13 -> {x:7, y:13}
                // 或者: x:7,y:13
                // 或者: {"x":7, "y":13}
                if (val.trim().startsWith('{')) {
                    try {
                        const parsed = JSON.parse(val);
                        if (parsed) return parsed;
                    } catch(e) {}
                }

                if (val.includes(':') && !val.includes('{')) {
                    const pos = {};
                    val.split(',').forEach(p => {
                        const [k, v] = p.split(':');
                        if (k && v) pos[k.trim()] = parseFloat(v);
                    });
                    return pos;
                }
                const parts = val.split(',');
                if (parts.length >= 2) return { x: parseFloat(parts[0]), y: parseFloat(parts[1]) };
            }
            if (type === 'size') {
                // 格式: 2,2 -> {w:2, h:2}
                // 或者: {"w":2, "h":2}
                if (val.trim().startsWith('{')) {
                    try {
                        const parsed = JSON.parse(val);
                        if (parsed) return parsed;
                    } catch(e) {}
                }

                const parts = val.split(',');
                if (parts.length >= 2) return { w: parseFloat(parts[0]), h: parseFloat(parts[1]) };
            }
            if (type === 'resources') {
                // 格式: 1级:3/4|2级:2/3
                // 或者: {"1级":"3/4",...}
                if (val.trim().startsWith('{')) {
                    try {
                        const parsed = JSON.parse(val);
                        if (parsed) return parsed;
                    } catch(e) {}
                }

                const res = {};
                val.split('|').forEach(part => {
                    const [k, v] = part.split(':');
                    if (k && v) res[k.trim()] = v.trim();
                });
                return Object.keys(res).length > 0 ? res : null;
            }
        }
        return null;
    },
    
    getAllData: () => {
        const api = DataManager.getAPI();
        if (!api || !api.exportTableAsJson) return null;
        const raw = api.exportTableAsJson();
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    },

    parseSheet: (sheet) => {
        if (!sheet || !sheet.content || sheet.content.length < 2) return [];
        const headers = sheet.content[0];
        const rows = sheet.content.slice(1);
        
        return rows.map(row => {
            const obj = {};
            headers.forEach((h, i) => {
                if (h) {
                    obj[h] = row[i];
                    obj[String(h).trim().toLowerCase()] = row[i]; // 自动注入小写键 (如 char_id)
                    obj[String(h).trim().toUpperCase()] = row[i]; // 自动注入大写键 (如 CHAR_ID)
                }
            });
            return obj;
        });
    },

    getTable: (tableNameFragment) => {
    const data = DataManager.getAllData();
    if (!data) return null;
    const key = DataManager.findTableKey(data, tableNameFragment);
    return key ? DataManager.parseSheet(data[key]) : null;
    },

    getPartyData: () => {
        const charReg = DataManager.getTable('CHARACTER_Registry');
        const charAttr = DataManager.getTable('CHARACTER_Attributes');
        const charRes = DataManager.getTable('CHARACTER_Resources');
        
        if (!charReg) return [];

        const party = [];

        charReg.forEach(char => {
            const charId = char['CHAR_ID'];
            const attr = charAttr ? charAttr.find(a => a['CHAR_ID'] === charId) : {};
            const res = charRes ? charRes.find(r => r['CHAR_ID'] === charId) : {};
            
            const type = char['成员类型'] === '主角' ? 'PC' : 'NPC';
            const isPC = type === 'PC';
            
            // 合并数据
            const merged = { ...char, ...attr, ...res, type, isPC };
            party.push(merged);
        });

        return party;
    },

    getCharacterSkills: (charId) => {
        const links = DataManager.getTable('CHARACTER_Skills');
        const library = DataManager.getTable('SKILL_Library');
        
        if (!links || !library) return [];

        // 兼容：尝试通过 ID 查找，或者通过名称查找
        let charLinks = links.filter(l => l['char_id'] === charId);
        
        // 如果按 ID 没找到，尝试按姓名
        if (charLinks.length === 0) {
             const party = DataManager.getPartyData();
             const char = party.find(p => p['姓名'] === charId);
             if (char) {
                 const realId = char['CHAR_ID'];
                 charLinks = links.filter(l => l['char_id'] === realId);
             }
        }
        
        return charLinks.map(link => {
            const skill = library.find(s => s['skill_id'] === link['skill_id']);
            return { ...link, ...skill };
        });
    },

    getCharacterFeats: (charId) => {
        const links = DataManager.getTable('CHARACTER_Feats');
        const library = DataManager.getTable('FEAT_Library');
        
        if (!links || !library) return [];

        let charLinks = links.filter(l => l['char_id'] === charId);
        
        if (charLinks.length === 0) {
             const party = DataManager.getPartyData();
             const char = party.find(p => p['姓名'] === charId);
             if (char) {
                 const realId = char['CHAR_ID'];
                 charLinks = links.filter(l => l['char_id'] === realId);
             }
        }
        
        return charLinks.map(link => {
            const feat = library.find(f => f['feat_id'] === link['feat_id']);
            return { ...link, ...feat };
        });
    },

    // [新增] 获取已知法术 (从技能库合成)
    getKnownSpells: (charId) => {
        // 如果未提供 ID，尝试查找主角
        if (!charId) {
            const party = DataManager.getPartyData();
            const pc = party.find(p => p.isPC);
            if (pc) charId = pc['CHAR_ID'];
        }
        
        if (!charId) return [];

        const links = DataManager.getTable('CHARACTER_Skills');
        const library = DataManager.getTable('SKILL_Library');
        
        if (!links || !library) return [];

        // 筛选该角色的技能关联
        let charLinks = links.filter(l => l['char_id'] === charId);
        
        if (charLinks.length === 0) {
             const party = DataManager.getPartyData();
             const char = party.find(p => p['姓名'] === charId);
             if (char) {
                 const realId = char['CHAR_ID'];
                 charLinks = links.filter(l => l['char_id'] === realId);
             }
        }
        
        const spells = [];
        charLinks.forEach(link => {
            const skill = library.find(s => s['skill_id'] === link['skill_id']);
            // 判断是否为法术 (仅当技能类型明确为'法术'时)
            // [修复] 移除对环阶的宽松判断，防止 '武技' 被误判为法术
            if (skill && skill['技能类型'] === '法术') {
                spells.push({
                    ...skill,
                    ...link,
                    '法术名称': skill['技能名称'], // 兼容旧字段名
                    '已准备': link['已准备']
                });
            }
        });
        
        return spells;
    },

    getMaxSpellSlotLevel: (char) => {
        if (!char || !char['法术位']) return 9; // 默认9以防万一
        const slots = DataManager.parseValue(char['法术位'], 'resources');
        if (!slots) return 0;
        
        let maxLevel = 0;
        Object.keys(slots).forEach(k => {
            // k 通常是 "1级", "2级" 等
            let lvl = parseInt(k);
            if (isNaN(lvl)) {
                const m = k.match(/(\d+)/);
                if (m) lvl = parseInt(m[1]);
            }
            
            if (!isNaN(lvl) && lvl > maxLevel) {
                // 检查是否有该环阶的槽位上限 (max > 0)
                const valStr = slots[k].toString();
                const parts = valStr.split('/');
                // 格式: 当前/最大
                if (parts.length >= 2) {
                    const maxSlots = parseInt(parts[1]);
                    if (!isNaN(maxSlots) && maxSlots > 0) {
                        maxLevel = lvl;
                    }
                } else {
                    // 如果只有数字，假设是数量? 或者是 "3" (当前3)?
                    // 保守起见，如果存在key且解析正常，就认为拥有
                    maxLevel = lvl;
                }
            }
        });
        return maxLevel;
    },

    // [新增] 导出队伍数据为 JSON (支持选择性导出)
    // @param selectedCharIds - 可选，要导出的角色ID数组。如果为空则导出全部
    exportPartyData: (selectedCharIds = null) => {
        const party = DataManager.getPartyData();
        if (!party || party.length === 0) {
            console.warn('[DND DataManager] 无队伍数据可导出');
            return null;
        }

        // 如果指定了角色ID列表，则过滤
        let exportParty = party;
        if (selectedCharIds && Array.isArray(selectedCharIds) && selectedCharIds.length > 0) {
            exportParty = party.filter(char => {
                const charId = char['CHAR_ID'] || char['PC_ID'] || char['姓名'];
                return selectedCharIds.includes(charId);
            });
        }

        if (exportParty.length === 0) {
            console.warn('[DND DataManager] 没有选中任何角色');
            return null;
        }

        const exportData = {
            version: '1.1',
            exportDate: new Date().toISOString(),
            exportSource: 'DND_Dashboard_Immersive',
            party: [],
            skills: {},
            feats: {},
            spells: {}
        };

        exportParty.forEach(char => {
            const charId = char['CHAR_ID'] || char['PC_ID'] || char['姓名'];
            
            // 添加角色基础数据
            exportData.party.push({ ...char });
            
            // 获取技能数据
            const skills = DataManager.getCharacterSkills(charId);
            if (skills && skills.length > 0) {
                exportData.skills[charId] = skills;
            }
            
            // 获取专长数据
            const feats = DataManager.getCharacterFeats(charId);
            if (feats && feats.length > 0) {
                exportData.feats[charId] = feats;
            }
            
            // 获取法术数据
            const spells = DataManager.getKnownSpells(charId);
            if (spells && spells.length > 0) {
                exportData.spells[charId] = spells;
            }
        });

        return exportData;
    },

    // [新增] 导入队伍数据
    // @param jsonData - 导入的数据
    // @param options - 导入选项
    //   - mode: 'append' (追加，默认) 或 'replace' (替换当前队伍)
    //   - selectedCharIds: 可选，要导入的角色ID数组。如果为空则导入全部
    importPartyData: async (jsonData, options = {}) => {
        try {
            const { mode = 'append', selectedCharIds = null } = options;

            // 验证数据格式
            if (!jsonData || !jsonData.party || !Array.isArray(jsonData.party)) {
                return { success: false, message: '无效的数据格式' };
            }

            // 过滤要导入的角色
            let partyToImport = jsonData.party;
            if (selectedCharIds && Array.isArray(selectedCharIds) && selectedCharIds.length > 0) {
                partyToImport = jsonData.party.filter(char => {
                    const charId = char['CHAR_ID'] || char['PC_ID'] || char['姓名'];
                    return selectedCharIds.includes(charId);
                });
            }

            if (partyToImport.length === 0) {
                return { success: false, message: '没有选中任何角色' };
            }

            // 同样过滤关联数据
            const filteredSkills = {};
            const filteredFeats = {};
            const filteredSpells = {};
            
            if (selectedCharIds && selectedCharIds.length > 0) {
                selectedCharIds.forEach(charId => {
                    if (jsonData.skills && jsonData.skills[charId]) {
                        filteredSkills[charId] = jsonData.skills[charId];
                    }
                    if (jsonData.feats && jsonData.feats[charId]) {
                        filteredFeats[charId] = jsonData.feats[charId];
                    }
                    if (jsonData.spells && jsonData.spells[charId]) {
                        filteredSpells[charId] = jsonData.spells[charId];
                    }
                });
            } else {
                Object.assign(filteredSkills, jsonData.skills || {});
                Object.assign(filteredFeats, jsonData.feats || {});
                Object.assign(filteredSpells, jsonData.spells || {});
            }

            const rawData = DataManager.getAllData();
            if (!rawData) return { success: false, message: '无法读取数据库' };

            // 如果是替换模式，先清空现有队伍数据
            if (mode === 'replace') {
                const clearTable = (tableNameFragment) => {
                    const tableKey = DataManager.findTableKey(rawData, tableNameFragment);
                    if (!tableKey) return;
                    const sheet = rawData[tableKey];
                    if (!sheet || !sheet.content || sheet.content.length < 1) return;
                    // 保留表头，清空数据行
                    sheet.content = [sheet.content[0]];
                };
                
                // 清空角色相关表
                clearTable('CHARACTER_Registry');
                clearTable('CHARACTER_Attributes');
                clearTable('CHARACTER_Resources');
                clearTable('CHARACTER_Skills');
                clearTable('CHARACTER_Feats');
            }

            // 辅助函数：处理单个表的更新/插入
            const processTable = (tableNameFragment, dataList) => {
                const tableKey = DataManager.findTableKey(rawData, tableNameFragment);
                if (!tableKey) return;
                
                const sheet = rawData[tableKey];
                if (!sheet || !sheet.content || sheet.content.length < 1) return;
                
                const headers = sheet.content[0];
                // [修复] 尝试找到 ID 列（兼容 CHAR_ID / char_id / PC_ID / pc_id / 姓名 等不同模板写法）
                let idColName = null;
                for (const cand of ['CHAR_ID', 'char_id', 'PC_ID', 'pc_id']) {
                    if (headers.includes(cand)) { idColName = cand; break; }
                }
                if (!idColName && headers.includes('姓名')) idColName = '姓名';
                if (!idColName) return;

                const idIdx = headers.indexOf(idColName);
                if (idIdx === -1) return;

                dataList.forEach(item => {
                    // [修复] 确定该条目的 ID（兼容导出数据与目标表之间的大小写差异）
                    const itemId = item[idColName] !== undefined ? item[idColName]
                        : (item['CHAR_ID'] !== undefined ? item['CHAR_ID']
                        : (item['char_id'] !== undefined ? item['char_id']
                        : (item['PC_ID'] !== undefined ? item['PC_ID']
                        : (item['pc_id'] !== undefined ? item['pc_id'] : item['姓名']))));
                    if (!itemId) return;

                    // 在表中查找对应行
                    let rowIdx = -1;
                    // 跳过表头
                    for (let i = 1; i < sheet.content.length; i++) {
                        const rowVal = sheet.content[i][idIdx];
                        if (rowVal === itemId) {
                            rowIdx = i;
                            break;
                        }
                    }

                    if (rowIdx !== -1) {
                        // [修复] 更新: 遍历 header，兼容大小写键（如 char_id / CHAR_ID）
                        headers.forEach((h, colIdx) => {
                            let v = item[h];
                            if (v === undefined && typeof h === 'string') {
                                v = item[h.toLowerCase()];
                                if (v === undefined) v = item[h.toUpperCase()];
                            }
                            if (v !== undefined) {
                                sheet.content[rowIdx][colIdx] = v;
                            }
                        });
                    } else {
                        // [修复] 插入: 构建新行（兼容大小写键）
                        const newRow = headers.map(h => {
                            let v = item[h];
                            if (v === undefined && typeof h === 'string') {
                                v = item[h.toLowerCase()];
                                if (v === undefined) v = item[h.toUpperCase()];
                            }
                            return v !== undefined ? v : null;
                        });
                        // [修复] 确保 ID 存在（兼容大小写差异）
                        const idVal = item[idColName] !== undefined ? item[idColName]
                            : (item['CHAR_ID'] !== undefined ? item['CHAR_ID']
                            : (item['char_id'] !== undefined ? item['char_id'] : item['姓名']));
                        if (idVal !== undefined) {
                            newRow[idIdx] = idVal;
                        }
                        sheet.content.push(newRow);
                    }
                });
            };

            // 分别处理三个主表 (使用过滤后的列表)
            processTable('CHARACTER_Registry', partyToImport);
            processTable('CHARACTER_Attributes', partyToImport);
            processTable('CHARACTER_Resources', partyToImport);

            // 辅助函数：处理关联数据 (技能/专长/法术)
            const processAuxData = (dataMap, libTableName, linkTableName, idField, nameField, typeField = null, fixedType = null) => {
                if (!dataMap) return;
                
                const libKey = DataManager.findTableKey(rawData, libTableName);
                const linkKey = DataManager.findTableKey(rawData, linkTableName);
                if (!libKey || !linkKey) return;
                
                const libSheet = rawData[libKey];
                const linkSheet = rawData[linkKey];
                const libHeaders = libSheet.content[0];
                const linkHeaders = linkSheet.content[0];
                
                Object.keys(dataMap).forEach(charId => {
                    const items = dataMap[charId];
                    if (!Array.isArray(items)) return;
                    
                    items.forEach(item => {
                        // 1. 处理库 (Library)
                        let itemId = item[idField];
                        const itemName = item[nameField];
                        
                        // 尝试通过 ID 查找
                        let libRowIdx = -1;
                        const libIdColIdx = libHeaders.indexOf(idField);
                        const libNameColIdx = libHeaders.indexOf(nameField);
                        
                        if (itemId && libIdColIdx !== -1) {
                            libRowIdx = libSheet.content.findIndex((r, i) => i > 0 && r[libIdColIdx] === itemId);
                        }
                        
                        // 如果没找到 ID，尝试通过名称查找
                        if (libRowIdx === -1 && itemName && libNameColIdx !== -1) {
                            libRowIdx = libSheet.content.findIndex((r, i) => i > 0 && r[libNameColIdx] === itemName);
                            if (libRowIdx !== -1) {
                                itemId = libSheet.content[libRowIdx][libIdColIdx]; // 使用现有的 ID
                            }
                        }
                        
                        // 如果还是没找到，创建新的
                        if (libRowIdx === -1) {
                            if (!itemId) itemId = (idField.startsWith('SKILL') ? 'SKL_' : 'FEAT_') + Math.random().toString(36).substr(2, 8);
                            
                            const newRow = libHeaders.map(h => {
                                if (h === idField) return itemId;
                                if (fixedType && h === typeField) return fixedType;
                                return item[h] !== undefined ? item[h] : null;
                            });
                            libSheet.content.push(newRow);
                        }
                        
                        // 2. 处理关联 (Link)
                        const linkCharColIdx = linkHeaders.findIndex(h => ['char_id', 'CHAR_ID'].includes(String(h).trim()));
                        const linkItemColIdx = linkHeaders.findIndex(h => [idField.toLowerCase(), idField.toUpperCase(), idField].includes(String(h).trim()));
                        
                        if (linkCharColIdx !== -1 && linkItemColIdx !== -1) {
                            // 检查是否已存在关联
                            const linkExists = linkSheet.content.some((r, i) =>
                                i > 0 && r[linkCharColIdx] === charId && r[linkItemColIdx] === itemId
                            );
                            
                            if (!linkExists) {
                                const newLinkRow = linkHeaders.map(h => {
                                    const col = String(h).trim().toLowerCase();
                                    // 1. 生成关联主键 (SLINK_xxx 或 FLINK_xxx)
                                    if (['skill_link_id', 'feat_link_id', 'link_id'].includes(col)) {
                                        return (idField.toLowerCase().includes('skill') ? 'SLINK_' : 'FLINK_') + Math.random().toString(36).substr(2, 6);
                                    }
                                    // 2. 匹配角色 ID 列 (char_id / CHAR_ID)
                                    if (col === 'char_id') return charId;
                                    // 3. 匹配技能/专长 ID 列 (skill_id / feat_id)
                                    if (col === idField.toLowerCase() || col === idField.toUpperCase()) return itemId;
                                    // 4. 技能关联表默认设为已准备
                                    if (col === '已准备' || col === 'yi_zhun_bei') return '是';
                                    
                                    return item[h] !== undefined ? item[h] : null;
                                });
                                linkSheet.content.push(newLinkRow);
                            }
                        }
                    });
                });
            };

            // 处理技能 (使用过滤后的数据)
            processAuxData(filteredSkills, 'SKILL_Library', 'CHARACTER_Skills', 'SKILL_ID', '技能名称');
            // 处理法术 (也是技能库，但可能有特殊字段)
            processAuxData(filteredSpells, 'SKILL_Library', 'CHARACTER_Skills', 'SKILL_ID', '技能名称', '技能类型', '法术');
            // 处理专长
            processAuxData(filteredFeats, 'FEAT_Library', 'CHARACTER_Feats', 'FEAT_ID', '专长名称');

            // 保存
            await DiceManager.saveData(rawData);

            const modeText = mode === 'replace' ? '替换' : '追加';
            return {
                success: true,
                message: `成功${modeText}导入 ${partyToImport.length} 个角色`,
                count: partyToImport.length
            };
        } catch (err) {
            console.error('[DND DataManager] 导入队伍数据失败:', err);
            return { success: false, message: '导入失败: ' + err.message };
        }
    },
    

    // [新增] 解析角色状态数据 (用于状态栏显示)
    // 支持的状态类型: concentration(专注), exhaustion(力竭), 以及其他可能的buff/debuff
    parseCharacterStatus: (char) => {
        if (!char) return [];
        
        const statuses = [];
        
        // 定义支持的状态类型及其显示配置
        const statusConfig = {
            '专注': { key: 'concentration', icon: 'fa-eye', color: 'var(--dnd-accent-blue)', label: '专注' },
            '力竭': { key: 'exhaustion', icon: 'fa-battery-quarter', color: 'var(--dnd-accent-red)', label: '力竭' },
            '专注中': { key: 'concentration', icon: 'fa-eye', color: 'var(--dnd-accent-blue)', label: '专注' },
            'concentration': { key: 'concentration', icon: 'fa-eye', color: 'var(--dnd-accent-blue)', label: '专注' },
            'exhaustion': { key: 'exhaustion', icon: 'fa-battery-quarter', color: 'var(--dnd-accent-red)', label: '力竭' }
        };
        
        // 解析力竭等级 (如果有)
        const parseExhaustionLevel = (val) => {
            if (!val) return null;
            const match = val.toString().match(/力竭[：:\s]*(\d)/);
            if (match) return parseInt(match[1]);
            return null;
        };
        
        // 1. 检查 "附着状态" 字段 (战斗中的buff/debuff)
        if (char['附着状态']) {
            const statusStr = char['附着状态'].toString();
            
            // 检查专注状态
            if (statusStr.includes('专注')) {
                statuses.push({ ...statusConfig['专注'], type: 'buff' });
            }
            
            // 检查力竭状态
            if (statusStr.includes('力竭')) {
                const level = parseExhaustionLevel(statusStr);
                statuses.push({ 
                    ...statusConfig['力竭'], 
                    type: 'debuff',
                    level: level,
                    label: level ? `力竭${level}` : '力竭'
                });
            }
        }
        
        // 2. 检查其他可能的状态字段
        // 检查 "状态" 字段
        if (char['状态']) {
            const statusStr = char['状态'].toString();
            Object.keys(statusConfig).forEach(key => {
                if (statusStr.includes(key) && !statuses.find(s => s.key === statusConfig[key].key)) {
                    const level = key === '力竭' || key === 'exhaustion' ? parseExhaustionLevel(statusStr) : null;
                    statuses.push({
                        ...statusConfig[key],
                        type: key === '力竭' || key === 'exhaustion' ? 'debuff' : 'buff',
                        level: level,
                        label: level ? `${statusConfig[key].label}${level}` : statusConfig[key].label
                    });
                }
            });
        }
        
        // 3. 检查 "当前状态" 字段
        if (char['当前状态']) {
            const statusStr = char['当前状态'].toString();
            Object.keys(statusConfig).forEach(key => {
                if (statusStr.includes(key) && !statuses.find(s => s.key === statusConfig[key].key)) {
                    const level = key === '力竭' || key === 'exhaustion' ? parseExhaustionLevel(statusStr) : null;
                    statuses.push({
                        ...statusConfig[key],
                        type: key === '力竭' || key === 'exhaustion' ? 'debuff' : 'buff',
                        level: level,
                        label: level ? `${statusConfig[key].label}${level}` : statusConfig[key].label
                    });
                }
            });
        }
        
        // 4. 检查是否有单独的力竭等级字段
        if (char['力竭等级'] || char['exhaustion_level']) {
            const level = parseInt(char['力竭等级'] || char['exhaustion_level']);
            if (level > 0 && !statuses.find(s => s.key === 'exhaustion')) {
                statuses.push({
                    ...statusConfig['力竭'],
                    type: 'debuff',
                    level: level,
                    label: `力竭${level}`
                });
            }
        }
        
        // 5. 检查专注状态字段
        if (char['专注中'] === '是' || char['专注中'] === true || char['专注中'] === 'true' || char['专注中'] === 1 || char['专注中'] === '1') {
            if (!statuses.find(s => s.key === 'concentration')) {
                statuses.push({ ...statusConfig['专注'], type: 'buff' });
            }
        }
        
        return statuses;
    },

    // [新增] 导入 FVTT 角色数据
    importFVTTData: async (json) => {
        try {
            const api = DataManager.getAPI();
            if (!api) return { success: false, message: 'API 不可用' };

            // 简单验证
            if (!json.name || !json.system) {
                return { success: false, message: '无效的 FVTT 角色文件' };
            }

            // 1. 解析基础信息
            const name = json.name;
            const sys = json.system;
            const details = sys.details || {};
            const abilities = sys.abilities || {};
            const attributes = sys.attributes || {};
            
            // 职业
            const classItems = (json.items || []).filter(i => i.type === 'class');
            const classStr = classItems.map(c => `${c.name} ${(c.system?.levels || 1)}`).join(' / ') || '平民 1';
            const level = details.level || classItems.reduce((acc, c) => acc + (c.system?.levels || 0), 0) || 1;

            // 种族
            const raceItem = (json.items || []).find(i => i.type === 'race');
            const raceStr = raceItem ? raceItem.name : (details.race || '未知种族');

            // 属性
            const stats = {};
            const abbrMap = { str:'STR', dex:'DEX', con:'CON', int:'INT', wis:'WIS', cha:'CHA' };
            Object.keys(abilities).forEach(k => {
                if (abbrMap[k]) stats[abbrMap[k]] = abilities[k].value || 10;
            });

            // 技能
            const skillMap = {
                'acr': '杂技', 'ani': '驯兽', 'arc': '奥秘', 'ath': '运动',
                'dec': '欺瞒', 'his': '历史', 'ins': '洞悉', 'itm': '威吓',
                'inv': '调查', 'med': '医药', 'nat': '自然', 'prc': '察觉',
                'prf': '表演', 'per': '说服', 'rel': '宗教', 'slt': '手法',
                'ste': '隐匿', 'sur': '生存'
            };
            const profSkills = [];
            if (sys.skills) {
                Object.keys(sys.skills).forEach(k => {
                    if (sys.skills[k].value >= 1) { // 1=熟练, 2=专精
                        profSkills.push(skillMap[k] || k);
                    }
                });
            }

            //原作者: disocrd类脑 Niccole @niccole0414

            // 豁免
            const saves = [];
            Object.keys(abilities).forEach(k => {
                if (abilities[k].proficient >= 1) saves.push(skillMap[k] || k.toUpperCase()); // 简单映射
            });

            // 构建导入对象
            const charData = {
                'CHAR_ID': 'FVTT_' + Date.now(),
                '成员类型': '同伴',
                '姓名': name,
                '种族/性别/年龄': `${raceStr} / - / -`,
                '职业': classStr,
                '外貌描述': details.appearance || '',
                '性格特点': (details.trait || '') + ' ' + (details.ideal || '') + ' ' + (details.bond || '') + ' ' + (details.flaw || ''),
                '背景故事': details.biography?.value?.replace(/<[^>]+>/g, '') || '', // 去除 HTML
                '加入时间': new Date().toISOString().slice(0,10),
                
                // Attributes
                '等级': level,
                'HP': `${attributes.hp?.value || 0}/${attributes.hp?.max || 1}`,
                'AC': attributes.ac?.value || 10,
                '先攻加值': attributes.init?.total || 0,
                '速度': attributes.movement?.walk ? `${attributes.movement.walk}尺` : '30尺',
                '属性值': JSON.stringify(stats),
                '豁免熟练': JSON.stringify(saves),
                '技能熟练': JSON.stringify(profSkills),
                '被动感知': sys.skills?.prc?.passive || 10,
                
                // Resources
                '法术位': '', // 暂不解析法术位详情
                '金币': sys.currency ? (sys.currency.gp || 0) : 0,
                '生命骰': `${attributes.hd || 0}/${attributes.hd || 0}`
            };

            // 解析物品 (Inventory)
            const inventory = [];
            (json.items || []).forEach(item => {
                if (['weapon', 'equipment', 'consumable', 'loot', 'backpack'].includes(item.type)) {
                    inventory.push({
                        '物品ID': item.name, // 简单使用名称
                        '物品名称': item.name,
                        '类别': item.type === 'weapon' ? '武器' : (item.type === 'equipment' ? '护甲' : '杂物'),
                        '数量': item.system?.quantity || 1,
                        '已装备': item.system?.equipped ? '是' : '否',
                        '所属人': name,
                        '稀有度': item.system?.rarity || '普通',
                        '描述': item.system?.description?.value?.replace(/<[^>]+>/g, '') || '',
                        '重量': item.system?.weight || 0,
                        '价值': item.system?.price?.value ? `${item.system.price.value}gp` : '-'
                    });
                }
            });

            // 解析法术 (Spells) -> 存入技能库并关联
            const spells = [];
            (json.items || []).forEach(item => {
                if (item.type === 'spell') {
                    spells.push({
                        'SKILL_ID': item.name, // 临时ID
                        '技能名称': item.name,
                        '技能类型': '法术',
                        '环阶': item.system?.level || 0,
                        '学派': item.system?.school || '-',
                        '施法时间': item.system?.activation?.type || '-',
                        '射程': item.system?.range?.value ? `${item.system.range.value} ${item.system.range.units}` : '-',
                        '成分': item.system?.components ? Object.keys(item.system.components).filter(k=>item.system.components[k]).join(',').toUpperCase() : '-',
                        '持续时间': item.system?.duration?.value ? `${item.system.duration.value} ${item.system.duration.units}` : '-',
                        '效果描述': item.system?.description?.value?.replace(/<[^>]+>/g, '') || ''
                    });
                }
            });

            // 开始写入数据库
            // 1. 获取现有数据
            const rawData = api.exportTableAsJson();
            const tableData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

            // 2. 写入角色注册表
            const regKey = DataManager.findTableKey(tableData, 'CHARACTER_Registry');
            const regSheet = regKey ? tableData[regKey] : null;
            if (regSheet && regSheet.content) {
                // 映射字段并添加行
                const headers = regSheet.content[0];
                const newRow = headers.map(h => charData[h] !== undefined ? charData[h] : null);
                regSheet.content.push(newRow);
            }

            // 3. 写入角色属性表
            const attrKey = DataManager.findTableKey(tableData, 'CHARACTER_Attributes');
            const attrSheet = attrKey ? tableData[attrKey] : null;
            if (attrSheet && attrSheet.content) {
                const headers = attrSheet.content[0];
                const newRow = headers.map(h => charData[h] !== undefined ? charData[h] : null);
                attrSheet.content.push(newRow);
            }

            // 4. 写入角色资源表
            const resKey = DataManager.findTableKey(tableData, 'CHARACTER_Resources');
            const resSheet = resKey ? tableData[resKey] : null;
            if (resSheet && resSheet.content) {
                const headers = resSheet.content[0];
                const newRow = headers.map(h => charData[h] !== undefined ? charData[h] : null);
                resSheet.content.push(newRow);
            }

            // 5. 写入物品表 (批量)
            const invKey = DataManager.findTableKey(tableData, 'ITEM_Inventory');
            const invSheet = invKey ? tableData[invKey] : null;
            if (invSheet && invSheet.content) {
                const headers = invSheet.content[0];
                inventory.forEach(item => {
                    const newRow = headers.map(h => item[h] !== undefined ? item[h] : null);
                    invSheet.content.push(newRow);
                });
            }

            // 6. 写入技能库和关联 (简化处理：只写入库，不查重可能导致冗余，暂不优化)
            const libKey = DataManager.findTableKey(tableData, 'SKILL_Library');
            const libSheet = libKey ? tableData[libKey] : null;
            
            const linkKey = DataManager.findTableKey(tableData, 'CHARACTER_Skills');
            const linkSheet = linkKey ? tableData[linkKey] : null;
            
            if (libSheet && libSheet.content && linkSheet && linkSheet.content) {
                const libHeaders = libSheet.content[0];
                const linkHeaders = linkSheet.content[0];
                
                spells.forEach(spell => {
                    // 添加到库 (如果不存在)
                    const exists = libSheet.content.some(r => r[1] === spell['技能名称']); // 假设列1是名称
                    let skillId = 'SKL_' + Math.random().toString(36).substr(2, 6);
                    
                    if (!exists) {
                        const libRow = libHeaders.map(h => {
                            if (h === 'SKILL_ID') return skillId;
                            return spell[h] !== undefined ? spell[h] : null;
                        });
                        libSheet.content.push(libRow);
                    } else {
                        // 查找现有ID
                        const row = libSheet.content.find(r => r[1] === spell['技能名称']);
                        if (row) skillId = row[libHeaders.indexOf('SKILL_ID')];
                    }
                    
                    // 添加关联
                    const linkRow = linkHeaders.map(h => {
                        if (h === 'LINK_ID') return 'LNK_' + Math.random().toString(36).substr(2, 6);
                        if (h === 'CHAR_ID') return charData['CHAR_ID'];
                        if (h === 'SKILL_ID') return skillId;
                        if (h === '已准备') return '是'; // 默认已准备
                        return null;
                    });
                    linkSheet.content.push(linkRow);
                });
            }

            // 保存
            await api.importTableAsJson(JSON.stringify(tableData));

            return { success: true, message: `成功导入 FVTT 角色: ${name}` };

        } catch (err) {
            console.error('[DND DataManager] FVTT 导入失败:', err);
            return { success: false, message: '解析或保存失败: ' + err.message };
        }
    },

    // [新增] 在数据库中动态切换主角身份
    updateMainCharacterInDB: async (targetCharId) => {
        try {
            const api = DataManager.getAPI();
            if (!api) return { success: false, message: 'API 不可用' };

            // 1. 获取当前完整数据
            const rawData = DataManager.getAllData();
            const tableKey = DataManager.findTableKey(rawData, 'CHARACTER_Registry');
            if (!tableKey) return { success: false, message: '未找到角色注册表' };

            const sheet = rawData[tableKey];
            const headers = sheet.content[0];
            const idIdx = headers.indexOf('CHAR_ID');
            const typeIdx = headers.indexOf('成员类型');

            if (idIdx === -1 || typeIdx === -1) return { success: false, message: '表结构异常' };

            // 2. 遍历并修改：目标设为主角，其他设为同伴
            let updatedCount = 0;
            for (let i = 1; i < sheet.content.length; i++) {
                const charId = sheet.content[i][idIdx];
                if (charId === targetCharId) {
                    sheet.content[i][typeIdx] = '主角';
                    updatedCount++;
                } else {
                    // 如果原本是主角，则降级为同伴
                    if (sheet.content[i][typeIdx] === '主角') {
                        sheet.content[i][typeIdx] = '同伴';
                    }
                }
            }

            // 3. 写回数据库
            await api.importTableAsJson(JSON.stringify(rawData));
            console.log(`[DataManager] 数据库同步成功：已将 ${targetCharId} 设为主角`);
            return { success: true };
        } catch (err) {
            console.error('[DataManager] 同步主角状态失败:', err);
            return { success: false, message: err.message };
        }
    },




    // [新增] 同步/创建酒馆用户角色 直接调用酒馆内核 API 同步/创建用户角色
    syncSTUserPersona: async (name) => {
        if (!name) return;
        try {
            // 1. 获取酒馆全局 Context
            const core = getCore();
            const stContext = window.SillyTavern?.getContext?.() || core?.getContext?.() || (typeof SillyTavern !== 'undefined' ? SillyTavern.getContext?.() : null);

            // 2. 优先通过官方 Slash Command 切换 (/persona "角色名")
            if (stContext && typeof stContext.executeSlashCommands === 'function') {
                console.log(`[DataManager] 触发酒馆官方斜杠命令切换用户角色: ${name}`);
                await stContext.executeSlashCommands(`/persona ${JSON.stringify(name)}`);
                return;
            }

            // 3. 兜底方案：通过 DOM 模拟点击酒馆原生用户角色列表
            const { $ } = getCore();
            if ($) {
                const $targetCard = $(`#persona_list .persona_item[title="${name}"], #persona_list .persona_item:contains("${name}")`);
                if ($targetCard.length) {
                    $targetCard.first().trigger('click');
                    console.log(`[DataManager] 通过 DOM 模拟点击切换用户角色: ${name}`);
                    return;
                }
            }

            console.warn('[DataManager] 未找到可用的酒馆 Persona 切换接口');
        } catch (err) {
            console.error('[DataManager] 酒馆 Persona 切换失败:', err);
        }
    },

    getAPI: () => getCore().getDB(),


};

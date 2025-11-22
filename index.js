// ==UserScript==
// @name         微店购物车结算脚本
// @version      2
// @description  微店自动抢
// @author       Blackwindow6
// @match        *://weidian.com/new-cart/*
// @match        *://weidian.com/buy/add-order/index.php*
// @icon         https://s1.ax1x.com/2022/10/14/xwsJYT.png
// @grant        none
// ==/UserScript==
(function() {
    'use strict';

    // 状态管理
    let state = {
        isRunning: false,
        timerId: null,
        refreshCount: 0,
        targetTime: null,
        clickDelay: 0,
        refreshInterval: 1000,
        maxRefreshCount: 10
    };

    // 从 localStorage 恢复状态
    function loadState() {
        const saved = localStorage.getItem('weidian_buy_state');
        if (saved) {
            const parsed = JSON.parse(saved);
            state.isRunning = parsed.isRunning || false;
            state.targetTime = parsed.targetTime ? new Date(parsed.targetTime) : null;
            state.clickDelay = parsed.clickDelay || 0;
            state.refreshInterval = parsed.refreshInterval || 1000;
            state.maxRefreshCount = parsed.maxRefreshCount || 10;
            state.refreshCount = parsed.refreshCount || 0;
        }
    }

    // 保存状态到 localStorage
    function saveState() {
        localStorage.setItem('weidian_buy_state', JSON.stringify({
            isRunning: state.isRunning,
            targetTime: state.targetTime ? state.targetTime.getTime() : null,
            clickDelay: state.clickDelay,
            refreshInterval: state.refreshInterval,
            maxRefreshCount: state.maxRefreshCount,
            refreshCount: state.refreshCount
        }));
    }

    // 停止脚本
    function stopScript() {
        state.isRunning = false;
        state.refreshCount = 0;
        if (state.timerId) {
            clearInterval(state.timerId);
            state.timerId = null;
        }
        saveState();
        updateUI();
        console.log('脚本已停止');
    }

    // 清除状态
    function clearState() {
        localStorage.removeItem('weidian_buy_state');
        stopScript();
    }

    // 等待网络空闲（network idle）
    function waitForNetworkIdle(timeout = 30000, idleTime = 1000) {
        return new Promise((resolve, reject) => {
            console.log('等待网络空闲...');
            
            let lastRequestTime = Date.now();
            let idleTimer = null;
            let isResolved = false;
            
            // 记录请求时间的函数
            const recordRequest = () => {
                lastRequestTime = Date.now();
                if (idleTimer) {
                    clearTimeout(idleTimer);
                }
                // 如果 idleTime 时间内没有新请求，认为网络空闲
                idleTimer = setTimeout(() => {
                    if (!isResolved && Date.now() - lastRequestTime >= idleTime) {
                        isResolved = true;
                        cleanup();
                        console.log('网络已空闲');
                        resolve();
                    }
                }, idleTime);
            };
            
            // 监听 fetch 请求
            const originalFetch = window.fetch;
            window.fetch = function(...args) {
                recordRequest();
                return originalFetch.apply(this, args).then(response => {
                    recordRequest();
                    return response;
                }).catch(error => {
                    recordRequest();
                    throw error;
                });
            };
            
            // 监听 XMLHttpRequest
            const originalOpen = XMLHttpRequest.prototype.open;
            const originalSend = XMLHttpRequest.prototype.send;
            
            XMLHttpRequest.prototype.open = function(...args) {
                recordRequest();
                return originalOpen.apply(this, args);
            };
            
            XMLHttpRequest.prototype.send = function(...args) {
                recordRequest();
                const xhr = this;
                xhr.addEventListener('loadend', recordRequest);
                xhr.addEventListener('error', recordRequest);
                return originalSend.apply(this, args);
            };
            
            // 清理函数
            const cleanup = () => {
                if (idleTimer) {
                    clearTimeout(idleTimer);
                }
                window.fetch = originalFetch;
                XMLHttpRequest.prototype.open = originalOpen;
                XMLHttpRequest.prototype.send = originalSend;
            };
            
            // 检查 Performance API 中正在进行的请求
            const checkPerformanceEntries = () => {
                try {
                    const resources = performance.getEntriesByType('resource');
                    const navigationEntries = performance.getEntriesByType('navigation');
                    if (resources.length > 0 || navigationEntries.length > 0) {
                        recordRequest();
                    }
                } catch (e) {
                    // Performance API 可能不支持，忽略
                }
            };
            
            // 初始检查
            checkPerformanceEntries();
            
            // 监听 Performance API 的新资源
            if (typeof PerformanceObserver !== 'undefined') {
                try {
                    const observer = new PerformanceObserver((list) => {
                        recordRequest();
                    });
                    observer.observe({ entryTypes: ['resource', 'navigation'] });
                } catch (e) {
                    // PerformanceObserver 可能不支持，忽略
                }
            }
            
            // 页面加载完成时记录一次
            if (document.readyState === 'complete') {
                recordRequest();
            } else {
                window.addEventListener('load', () => {
                    setTimeout(recordRequest, 100);
                });
            }
            
            // 超时处理
            setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    cleanup();
                    console.log('等待网络空闲超时，继续执行');
                    resolve(); // 超时后也继续执行，避免一直等待
                }
            }, timeout);
            
            // 初始延迟后开始检查
            setTimeout(() => {
                recordRequest();
            }, idleTime);
        });
    }

    // 创建悬浮控制窗口
    function createControlPanel() {
        // 检查是否已存在
        if (document.getElementById('weidian-buy-panel')) {
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'weidian-buy-panel';
        panel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 320px;
            background: #fff;
            border: 2px solid #1890ff;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 99999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
        `;

        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #e8e8e8; padding-bottom: 10px;">
                <h3 style="margin: 0; color: #1890ff; font-size: 16px;">微店自动抢购</h3>
                <button id="weidian-buy-close" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #999;">×</button>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #333;">
                    抢购日期:
                </label>
                <input type="date" id="target-date-input"
                       style="width: 100%; padding: 8px; border: 1px solid #d9d9d9; border-radius: 4px; box-sizing: border-box; font-size: 14px;">
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #333;">
                    抢购时间:
                </label>
                <input type="time" id="target-time-input" step="1"
                       style="width: 100%; padding: 8px; border: 1px solid #d9d9d9; border-radius: 4px; box-sizing: border-box; font-size: 14px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #333;">
                    提前点击延迟 (毫秒):
                </label>
                <input type="number" id="click-delay-input" value="0" min="0" 
                       style="width: 100%; padding: 8px; border: 1px solid #d9d9d9; border-radius: 4px; box-sizing: border-box;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #333;">
                    刷新间隔 (毫秒):
                </label>
                <input type="number" id="refresh-interval-input" value="1000" min="100" 
                       style="width: 100%; padding: 8px; border: 1px solid #d9d9d9; border-radius: 4px; box-sizing: border-box;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #333;">
                    最大刷新次数:
                </label>
                <input type="number" id="max-refresh-input" value="10" min="1" 
                       style="width: 100%; padding: 8px; border: 1px solid #d9d9d9; border-radius: 4px; box-sizing: border-box;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <div style="display: flex; gap: 10px;">
                    <button id="weidian-buy-start" 
                            style="flex: 1; padding: 10px; background: #1890ff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
                        启动
                    </button>
                    <button id="weidian-buy-stop" 
                            style="flex: 1; padding: 10px; background: #ff4d4f; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
                        停止
                    </button>
                </div>
            </div>
            
            <div id="weidian-buy-status" style="padding: 10px; background: #f5f5f5; border-radius: 4px; font-size: 12px; color: #666; text-align: center;">
                状态: 未运行
            </div>
            
            <div id="weidian-buy-info" style="margin-top: 10px; padding: 10px; background: #e6f7ff; border-radius: 4px; font-size: 12px; color: #1890ff; display: none;">
                <div id="weidian-buy-timer"></div>
                <div id="weidian-buy-refresh-count" style="margin-top: 5px;"></div>
            </div>
        `;

        document.body.appendChild(panel);

        // 关闭按钮
        document.getElementById('weidian-buy-close').addEventListener('click', () => {
            panel.style.display = 'none';
        });

        // 启动按钮
        document.getElementById('weidian-buy-start').addEventListener('click', startScript);
        
        // 停止按钮
        document.getElementById('weidian-buy-stop').addEventListener('click', stopScript);

        // 恢复输入框的值
        if (state.targetTime) {
            const dateInput = document.getElementById('target-date-input');
            const timeInput = document.getElementById('target-time-input');
            if (dateInput) {
                dateInput.value = formatDateValue(state.targetTime);
            }
            if (timeInput) {
                timeInput.value = formatTimeValue(state.targetTime);
            }
        }
        document.getElementById('click-delay-input').value = state.clickDelay;
        document.getElementById('refresh-interval-input').value = state.refreshInterval;
        document.getElementById('max-refresh-input').value = state.maxRefreshCount;
    }

    // 格式化日期
    function formatDateValue(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // 格式化时间，保留秒
    function formatTimeValue(date) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    // 更新UI状态
    function updateUI() {
        const statusEl = document.getElementById('weidian-buy-status');
        const infoEl = document.getElementById('weidian-buy-info');
        const timerEl = document.getElementById('weidian-buy-timer');
        const refreshCountEl = document.getElementById('weidian-buy-refresh-count');

        if (!statusEl) return;

        if (state.isRunning) {
            statusEl.textContent = '状态: 运行中';
            statusEl.style.background = '#f6ffed';
            statusEl.style.color = '#52c41a';
            infoEl.style.display = 'block';
        } else {
            statusEl.textContent = '状态: 未运行';
            statusEl.style.background = '#f5f5f5';
            statusEl.style.color = '#666';
            infoEl.style.display = 'none';
        }

        if (state.isRunning && state.targetTime && timerEl) {
            const now = new Date();
            const diff = state.targetTime.getTime() - now.getTime();
            if (diff > 0) {
                const seconds = Math.floor(diff / 1000);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                timerEl.textContent = `倒计时: ${hours}小时 ${minutes % 60}分 ${seconds % 60}秒`;
            } else {
                timerEl.textContent = '倒计时: 已到点';
            }
        }

        if (state.refreshCount > 0 && refreshCountEl) {
            refreshCountEl.textContent = `刷新次数: ${state.refreshCount} / ${state.maxRefreshCount}`;
        }
    }

    // 启动脚本
    function startScript() {
        const targetDateInput = document.getElementById('target-date-input').value.trim();
        let targetTimeInput = document.getElementById('target-time-input').value.trim();
        const clickDelay = parseInt(document.getElementById('click-delay-input').value) || 0;
        const refreshInterval = parseInt(document.getElementById('refresh-interval-input').value) || 1000;
        const maxRefreshCount = parseInt(document.getElementById('max-refresh-input').value) || 10;

        if (!targetDateInput || !targetTimeInput) {
            alert('请选择抢购日期和时间');
            return;
        }

        // time input 可能只有HH:mm，手动补足秒
        if (targetTimeInput.length === 5) {
            targetTimeInput = `${targetTimeInput}:00`;
        }

        // 解析时间（组合 date + time）
        const targetTime = new Date(`${targetDateInput}T${targetTimeInput}`);
        if (isNaN(targetTime.getTime())) {
            alert('时间格式错误');
            return;
        }

        // 检查时间是否在未来
        if (targetTime.getTime() <= Date.now()) {
            if (!confirm('选择的抢购时间已过期，是否仍要继续？')) {
                return;
            }
        }

        state.targetTime = targetTime;
        state.clickDelay = clickDelay;
        state.refreshInterval = refreshInterval;
        state.maxRefreshCount = maxRefreshCount;
        state.refreshCount = 0;
        state.isRunning = true;

        saveState();
        updateUI();

        // 判断当前页面类型
        if (window.location.pathname.includes('/new-cart/')) {
            startCartPage();
        } else if (window.location.pathname.includes('/buy/add-order/')) {
            startOrderPage();
        }
    }

    // 购物车页面逻辑
    function startCartPage() {
        if (state.timerId) {
            clearInterval(state.timerId);
        }

        state.timerId = setInterval(() => {
            if (!state.isRunning) {
                clearInterval(state.timerId);
                return;
            }

            updateUI();

            const now = new Date();
            const diff = state.targetTime.getTime() - now.getTime() - state.clickDelay;

            if (diff <= 0) {
                // 时间到了，点击结算按钮
        const checkoutButton = document.querySelector('.go_buy.wd-theme__button1');
                if (checkoutButton) {
                    console.log('时间到，点击结算按钮');
                    clearInterval(state.timerId);
                    state.timerId = null;
                    checkoutButton.click();
                    
                    // 点击后等待页面跳转，然后等待页面加载完成和提交按钮出现
                    waitForOrderPage();
                }
            }
        }, 100);
    }

    // 等待订单页面加载完成并等待提交按钮出现
    function waitForOrderPage() {
        console.log('等待页面跳转到订单页面...');
        
        // 检查是否已经跳转到订单页面
        const checkPageChange = setInterval(() => {
            if (window.location.pathname.includes('/buy/add-order/')) {
                clearInterval(checkPageChange);
                console.log('已跳转到订单页面，等待页面加载完成...');
                
                // 先等待网络空闲
                waitForNetworkIdle(30000, 10).then(() => {
                    console.log('网络空闲，等待提交按钮出现...');
                    
                    // 等待提交按钮出现，最多等待30秒
                    let waitCount = 0;
                    const maxWait = 300; // 30秒，每100ms检查一次
                    
                    const checkButton = setInterval(() => {
                        waitCount++;
                        const payButton = document.querySelector('#pay_btn');
                        
                        if (payButton) {
                            console.log('提交按钮已出现，开始检查按钮状态');
                            clearInterval(checkButton);
                            // 等待一下确保按钮状态已更新，跳过网络空闲等待（因为已经等待过了）
                            setTimeout(() => {
                                startOrderPage(true);
                            }, 500);
                        } else if (waitCount >= maxWait) {
                            console.log('等待超时，未找到提交按钮');
                            clearInterval(checkButton);
                            alert('等待提交按钮超时，请手动检查页面');
                            stopScript();
                        }
                    }, 100);
                }).catch(() => {
                    console.log('等待网络空闲出错，继续执行');
                    startOrderPage(true);
                });
            }
        }, 100);
        
        // 如果10秒内还没跳转，提示用户
        setTimeout(() => {
            clearInterval(checkPageChange);
            if (!window.location.pathname.includes('/buy/add-order/')) {
                console.log('页面跳转超时');
                alert('点击结算后页面未跳转，请手动检查');
                stopScript();
            }
        }, 10000);
    }

    // 订单页面检查逻辑（内部函数）
    function startOrderPageCheck() {
        // 等待一下确保页面完全加载
        let checkCount = 0;
        const maxCheckBeforeRefresh = 20; // 检查20次（10秒）后才刷新，确保按钮有时间出现
        
        state.timerId = setInterval(() => {
            if (!state.isRunning) {
                clearInterval(state.timerId);
                return;
            }

            updateUI();
            checkCount++;

            // 检查提交订单按钮（查找 #pay_btn 元素）
            const payButtonContainer = document.querySelector('#pay_btn > span');
            
            if (payButtonContainer) {
                // 根据class判断按钮是否可点击
                // 可点击：class包含 "submit_order" 和 "submit_no_margin"，不包含 "submit_bottom_cannot"
                // 不可点击：class包含 "submit_bottom_cannot"
                const buttonClasses = payButtonContainer.className || '';
                const isDisabled = buttonClasses.includes('submit_bottom_cannot');
                const hasSubmitOrder = buttonClasses.includes('submit_order');
                const isEnabled = hasSubmitOrder && !isDisabled;

                // 每5次检查输出一次日志，方便调试
                if (checkCount % 5 === 0 || checkCount === 1) {
                    console.log(`检查提交按钮状态 (第${checkCount}次):`, {
                        className: buttonClasses,
                        hasSubmitOrder: hasSubmitOrder,
                        hasSubmitNoMargin: hasSubmitNoMargin,
                        isDisabled: isDisabled,
                        isEnabled: isEnabled
                    });
                }

                if (isEnabled) {
                    console.log('提交订单按钮可点击，点击按钮');
                    clearInterval(state.timerId);
                    // 查找按钮内的span元素或直接点击容器
                    const payButton = payButtonContainer.querySelector('span') || payButtonContainer;
                    payButton.click();
                    
                    // 点击后停止脚本
                    stopScript();
                    clearState();
                    return;
                } else if (isDisabled) {
                    // 按钮明确不可点击，立即刷新（无需等待）
                    if (state.refreshCount >= state.maxRefreshCount) {
                        console.log(`已达到最大刷新次数 ${state.maxRefreshCount}，停止脚本`);
                        alert(`已达到最大刷新次数 ${state.maxRefreshCount}，脚本已停止`);
                        clearInterval(state.timerId);
                        stopScript();
                        clearState();
                        return;
                    }

                    console.log('提交订单按钮不可点击，立即刷新页面');
                    clearInterval(state.timerId);
                    state.refreshCount++;
                    saveState();
                    console.log(`准备刷新页面 (${state.refreshCount}/${state.maxRefreshCount})`);

                    setTimeout(() => {
                        window.location.reload();
                    }, state.refreshInterval);
                    return;
                } else {
                    // 按钮存在但状态不明确（既不是可点击也不是禁用状态）
                    // 可能是按钮的class名称不匹配，或者按钮还未完全加载
                    if (checkCount >= maxCheckBeforeRefresh) {
                        console.warn('按钮状态不明确，class可能不匹配:', buttonClasses);
                        console.warn('尝试直接点击按钮');
                        
                        // 尝试直接点击按钮
                        const payButton = payButtonContainer.querySelector('span') || payButtonContainer;
                        if (payButton && !payButton.disabled) {
                            console.log('按钮未被禁用，尝试点击');
                            payButton.click();
                            stopScript();
                            clearState();
                            return;
                        }
                        
                        // 如果点击无效，则刷新页面
                        if (state.refreshCount >= state.maxRefreshCount) {
                            console.log(`已达到最大刷新次数 ${state.maxRefreshCount}，停止脚本`);
                            alert(`已达到最大刷新次数 ${state.maxRefreshCount}，脚本已停止`);
                            stopScript();
                            clearState();
                            return;
                        }

                        clearInterval(state.timerId);
                        state.refreshCount++;
                        saveState();
                        console.log(`准备刷新页面 (${state.refreshCount}/${state.maxRefreshCount})`);
                        
                        setTimeout(() => {
                            window.location.reload();
                        }, state.refreshInterval);
                    } else {
                        // 还在等待
                        if (checkCount % 5 === 0) {
                            console.log(`按钮状态不明确，继续等待... (${checkCount}/${maxCheckBeforeRefresh})`);
                        }
                    }
                }
            } else {
                // 按钮未找到
                if (checkCount >= maxCheckBeforeRefresh) {
                    console.log('未找到提交按钮，准备刷新...');
                    
                    // 检查是否需要刷新
                    if (state.refreshCount >= state.maxRefreshCount) {
                        console.log(`已达到最大刷新次数 ${state.maxRefreshCount}，停止脚本`);
                        alert(`已达到最大刷新次数 ${state.maxRefreshCount}，脚本已停止`);
                        stopScript();
                        clearState();
                        return;
                    }

                    // 刷新页面
                    clearInterval(state.timerId);
                    state.refreshCount++;
                    saveState();
                    console.log(`准备刷新页面 (${state.refreshCount}/${state.maxRefreshCount})`);
                    
                    setTimeout(() => {
                        window.location.reload();
                    }, state.refreshInterval);
                } else {
                    // 还在等待按钮出现
                    if (checkCount % 5 === 0) {
                        console.log(`未找到提交按钮，继续等待... (${checkCount}/${maxCheckBeforeRefresh})`);
                    }
                }
            }
        }, 500); // 每500ms检查一次
    }

    // 订单页面逻辑
    function startOrderPage(skipNetworkIdle = false) {
        if (state.timerId) {
            clearInterval(state.timerId);
        }

        // 如果需要等待网络空闲，则等待；否则直接开始检查
        if (skipNetworkIdle) {
            console.log('跳过网络空闲等待，直接开始检查');
            setTimeout(() => {
                startOrderPageCheck();
            }, 500);
        } else {
            // 先等待网络空闲
            waitForNetworkIdle(30000, 10).then(() => {
                console.log('网络空闲，开始检查提交按钮状态');
                startOrderPageCheck();
            }).catch(() => {
                console.log('等待网络空闲出错，继续执行');
                startOrderPageCheck();
            });
        }
    }

    // 初始化
    function init() {
        loadState();
        createControlPanel();
        updateUI();

        // 如果脚本正在运行，根据页面类型启动相应逻辑
        if (state.isRunning) {
            if (window.location.pathname.includes('/new-cart/')) {
                startCartPage();
            } else if (window.location.pathname.includes('/buy/add-order/')) {
                // 订单页面：startOrderPage 内部会等待网络空闲
                startOrderPage();
            }
        }
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

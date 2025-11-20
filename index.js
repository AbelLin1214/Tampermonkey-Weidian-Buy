// ==UserScript==
// @name         微店自动抢购
// @namespace    http://tampermonkey.net/
// @version      2
// @description  微店自动抢购
// @author       Abel
// @match        *://weidian.com/item.html*
// ==/UserScript==

(function() {
    'use strict';

    // 设置检查间隔时间（例如每0.1秒检查一次）
    const checkInterval = 100;  // 每100毫秒检查一次
    // 日志输出最多保留的行数，避免无限增长
    const LOG_MAX_LINES = 50;
    // 记录定时器 ID，便于支付后及时清理
    let autoCheckoutTimerId = null;
    // 缓存启动按钮引用，便于更新状态
    let startButtonRef = null;
    // 缓存日志容器与面板引用，方便复用
    let logContainerRef = null;
    let controlPanelRef = null;

    // 统一的日志输出函数，既打印控制台也输出到浮窗
    function logMessage(message) {
        const timestamp = new Date().toLocaleTimeString();
        const formattedMessage = `[${timestamp}] ${message}`;
        console.log(formattedMessage);

        if (!logContainerRef) {
            return;
        }

        const line = document.createElement('div');
        line.textContent = formattedMessage;
        line.style.fontSize = '12px';
        logContainerRef.appendChild(line);

        while (logContainerRef.childElementCount > LOG_MAX_LINES) {
            logContainerRef.removeChild(logContainerRef.firstChild);
        }

        logContainerRef.scrollTop = logContainerRef.scrollHeight;
    }

    // 判断按钮是否真正可点击，避免提前触发
    function isButtonClickable(button) {
        if (!button) {
            return false;
        }

        const disabledAttr = button.getAttribute('disabled');
        const ariaDisabled = button.getAttribute('aria-disabled');
        const hasDisabledClass = button.classList.contains('disabled') || button.classList.contains('is-disabled');
        const pointerEvents = window.getComputedStyle(button).pointerEvents;

        return !button.disabled
            && disabledAttr !== 'true'
            && ariaDisabled !== 'true'
            && !hasDisabledClass
            && pointerEvents !== 'none';
    }

    // 辅助函数：安全获取 Vue 实例
    function getVueInstance(element) {
        if (!element) return null;
        return element.__vue__ ||
            (element._vnode && element._vnode.component && element._vnode.component.proxy) ||
            (element.__vue_app__ && element.__vue_app__._instance && element.__vue_app__._instance.proxy);
    }

    // 自动结算的函数
    function autoCheckout() {
        // 如果出现立即支付按钮，则优先点击并清理定时器
        const payNowButton = document.querySelector('#buyNow');
        if (payNowButton) {
            if (isButtonClickable(payNowButton)) {
                // 在点击“立即支付”前，确保 #buyerOrder 的校验逻辑已通过
                const buyerOrderEl = document.querySelector('#buyerOrder');
                if (buyerOrderEl) {
                    const vueInstance = getVueInstance(buyerOrderEl);
                    if (!vueInstance) {
                        logMessage('等待 #buyerOrder Vue 实例绑定...');
                        return;
                    }
                    
                    if (typeof vueInstance.checkCreateOrderParam === 'function') {
                         // 避免重复弹窗：先检查 cannotSubmit 状态
                         if (vueInstance.cannotSubmit) {
                             logMessage('页面 cannotSubmit 为 true，暂停下单');
                             return;
                         }
                         // 执行完整校验
                         const result = vueInstance.checkCreateOrderParam.call(vueInstance);
                         if (result === false) {
                             logMessage('正在等待下单弹窗加载...');
                             return;
                         }
                    }
                } else {
                    // 如果找不到 #buyerOrder，视情况决定是否等待
                    // 根据描述，#buyerOrder 是下单核心，如果不出现可能还没加载好
                    logMessage('未找到 #buyerOrder 元素，等待加载...');
                    return;
                }

                logMessage('点击立即支付按钮...');

                payNowButton.click();
                stopAutoCheckoutTimer();
                logMessage('立即支付按钮已点击，脚本已停止');
            } else {
                logMessage('立即支付按钮已出现但尚不可点击，继续等待');
            }

            return;
        }

        // 获取结算按钮
        const checkoutButton = document.querySelector('div.footer-wrap > div > span.footer-btn-container > span.buy-now.wd-theme__button1');

        // 如果结算按钮存在且没有被禁用，模拟点击操作
        if (checkoutButton && !checkoutButton.disabled) {
            logMessage('点击结算按钮...');
            
            checkoutButton.click();
        } else {
            logMessage('等待抢购时间到...');
        }
    }

    // 统一封装停止定时器并恢复按钮状态
    function stopAutoCheckoutTimer() {
        if (autoCheckoutTimerId) {
            clearInterval(autoCheckoutTimerId);
            autoCheckoutTimerId = null;
            logMessage('自动抢购已停止');
        }

        if (startButtonRef) {
            startButtonRef.disabled = false;
            startButtonRef.textContent = '启动自动抢购';
            startButtonRef.style.opacity = '1';
        }
    }

    // 启动自动抢购逻辑，确保不会重复创建定时器
    function startAutoCheckout() {
        if (autoCheckoutTimerId) {
            logMessage('自动抢购已在运行，无需重复启动');
            return;
        }

        autoCheckoutTimerId = setInterval(autoCheckout, checkInterval);
        logMessage('自动抢购启动，开始监控结算与支付按钮');
    }

    // 创建悬浮控制面板，集成启动按钮与日志输出
    function createControlPanel() {
        const existingPanel = document.querySelector('#wd-auto-helper-panel');
        if (existingPanel) {
            controlPanelRef = existingPanel;
            startButtonRef = existingPanel.querySelector('#wd-auto-start-btn');
            logContainerRef = existingPanel.querySelector('.wd-auto-log');
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'wd-auto-helper-panel';
        panel.style.position = 'fixed';
        panel.style.bottom = '20px';
        panel.style.right = '20px';
        panel.style.width = '280px';
        panel.style.maxHeight = '360px';
        panel.style.backgroundColor = 'rgba(26, 26, 26, 0.9)';
        panel.style.color = '#fff';
        panel.style.borderRadius = '12px';
        panel.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
        panel.style.padding = '16px';
        panel.style.zIndex = '9999';
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        panel.style.gap = '12px';
        panel.style.fontFamily = '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';

        const title = document.createElement('div');
        title.textContent = '微店抢购助手';
        title.style.fontSize = '16px';
        title.style.fontWeight = '600';
        title.style.textAlign = 'center';

        const startButton = document.createElement('button');
        startButton.id = 'wd-auto-start-btn';
        startButton.textContent = '启动自动抢购';
        startButton.style.padding = '10px 16px';
        startButton.style.border = 'none';
        startButton.style.borderRadius = '8px';
        startButton.style.backgroundColor = '#ff4d4f';
        startButton.style.color = '#fff';
        startButton.style.fontSize = '14px';
        startButton.style.cursor = 'pointer';
        startButton.style.fontWeight = '600';
        startButton.style.transition = 'opacity 0.2s ease';

        startButton.addEventListener('click', () => {
            startAutoCheckout();
            startButton.disabled = true;
            startButton.style.opacity = '0.7';
            startButton.textContent = '自动抢购中...';
        });

        const stopButton = document.createElement('button');
        stopButton.textContent = '停止自动抢购';
        stopButton.style.padding = '8px 16px';
        stopButton.style.border = '1px solid rgba(255,255,255,0.2)';
        stopButton.style.borderRadius = '8px';
        stopButton.style.backgroundColor = 'transparent';
        stopButton.style.color = '#aaa';
        stopButton.style.fontSize = '13px';
        stopButton.style.cursor = 'pointer';
        stopButton.style.marginTop = '4px';

        stopButton.addEventListener('click', () => {
            if (autoCheckoutTimerId) {
                stopAutoCheckoutTimer();
                logMessage('用户手动停止抢购');
            }
        });

        const logTitle = document.createElement('div');
        logTitle.textContent = '日志输出';
        logTitle.style.fontSize = '13px';
        logTitle.style.opacity = '0.8';

        const logContainer = document.createElement('div');
        logContainer.className = 'wd-auto-log';
        logContainer.style.flex = '1';
        logContainer.style.backgroundColor = 'rgba(255,255,255,0.08)';
        logContainer.style.borderRadius = '8px';
        logContainer.style.padding = '8px';
        logContainer.style.overflowY = 'auto';
        logContainer.style.minHeight = '120px';
        logContainer.style.maxHeight = '200px';

        panel.appendChild(title);
        panel.appendChild(startButton);
        panel.appendChild(stopButton);
        panel.appendChild(logTitle);
        panel.appendChild(logContainer);

        document.body.appendChild(panel);

        controlPanelRef = panel;
        startButtonRef = startButton;
        logContainerRef = logContainer;
        logMessage('悬浮控制面板已创建，点击按钮即可启动自动抢购');
    }

    // 初始化入口，确保 DOM 就绪后再注入按钮
    function initAutoCheckoutStarter() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createControlPanel);
        } else {
            createControlPanel();
        }
    }

    initAutoCheckoutStarter();
})();

/**
 * DevLoop Dashboard JavaScript
 * Handles webview interactions and messaging with extension host
 */

(function () {
    console.log('DevLoop: main.js loading...');
    
    // Get VS Code API from window (set in HTML head)
    const vscode = window.vscode || acquireVsCodeApi();
    
    if (!vscode) {
        console.error('DevLoop: Failed to acquire VS Code API!');
        return;
    }
    
    console.log('DevLoop: VS Code API acquired');
    console.log('DevLoop: Dashboard state:', window.dashboardState);

    // Store state
    let timerInterval = null;
    let currentSeconds = window.dashboardState?.timeTracker?.elapsedSeconds || 0;

    /**
     * Send message to extension host
     */
    window.sendMessage = function(type, payload) {
        console.log('DevLoop: Sending message:', type, payload);
        try {
            vscode.postMessage({ type, payload });
            console.log('DevLoop: Message sent successfully');
        } catch (error) {
            console.error('DevLoop: Error sending message:', error);
        }
    };

    /**
     * Toggle widget collapse state
     */
    window.toggleWidget = function(widgetId) {
        const widget = document.getElementById(widgetId);
        if (widget) {
            widget.classList.toggle('collapsed');
        }
    };

    /**
     * Switch between tabs
     */
    window.switchTab = function(tabName) {
        console.log('DevLoop: Switching to tab:', tabName);
        
        // Update tab navigation
        const tabs = document.querySelectorAll('.tab-nav .tab');
        tabs.forEach(tab => {
            if (tab.getAttribute('data-tab') === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        // Update tab content
        const panes = document.querySelectorAll('.tab-pane');
        panes.forEach(pane => {
            if (pane.id === `tab-${tabName}`) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });
    };

    /**
     * Log action (for debugging)
     */
    window.logAction = function(action) {
        console.log('DevLoop Action:', action);
        vscode.postMessage({ type: 'log', value: action });
    };

    /**
     * Format seconds to HH:MM:SS
     */
    function formatTime(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return [hours, minutes, seconds]
            .map(v => v.toString().padStart(2, '0'))
            .join(':');
    }

    /**
     * Update timer display
     */
    function updateTimerDisplay(seconds) {
        const timerElement = document.getElementById('timer-display');
        if (timerElement) {
            timerElement.textContent = formatTime(seconds);
        }
    }

    /**
     * Handle messages from extension host
     */
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.type) {
            case 'updateTimer':
                const state = message.payload;
                currentSeconds = state.elapsedSeconds;
                updateTimerDisplay(currentSeconds);

                // Update timer class based on state
                const timerElement = document.getElementById('timer-display');
                if (timerElement) {
                    timerElement.classList.remove('active', 'paused', 'inactive');
                    if (!state.isRunning) {
                        timerElement.classList.add('inactive');
                    } else if (state.isPaused) {
                        timerElement.classList.add('paused');
                    } else {
                        timerElement.classList.add('active');
                    }
                }
                break;

            case 'updateDashboard':
                // Full dashboard refresh would reload the webview
                break;

            case 'showNotification':
                // Could show in-webview notification
                break;
        }
    });

    /**
     * Get commit message from textarea
     */
    window.getCommitMessage = function() {
        const textarea = document.getElementById('commit-message');
        return textarea ? textarea.value : '';
    };

    /**
     * Setup tab click listeners
     */
     function setupTabListeners() {
        document.addEventListener('click', function(event) {
            const tab = event.target.closest('.tab');
            if (tab) {
                const tabName = tab.getAttribute('data-tab');
                if (tabName) {
                    switchTab(tabName);
                }
            }
        });
        console.log('DevLoop: Tab listeners setup complete');
    }

    /**
     * Initialize on load
     */
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DevLoop: DOM Content Loaded');
        console.log('DevLoop: Dashboard state:', window.dashboardState);
        
        // Set initial timer value if available
        if (window.dashboardState?.timeTracker?.isRunning) {
            currentSeconds = window.dashboardState.timeTracker.elapsedSeconds;
            updateTimerDisplay(currentSeconds);
            console.log('DevLoop: Timer initialized:', currentSeconds);
        }

        // Add event listeners for all vscode-button elements
        setupButtonListeners();
        setupTabListeners();

        console.log('DevLoop: Dashboard initialized successfully');
    });

    /**
     * Setup button click listeners
     * vscode-button web components need event listeners, onclick attributes don't work reliably
     */
    function setupButtonListeners() {
        console.log('DevLoop: Setting up button listeners...');
        
        // Use event delegation on document for all button clicks
        document.addEventListener('click', function(event) {
            const button = event.target.closest('vscode-button');
            if (button) {
                console.log('DevLoop: Button clicked:', button);
                
                // Check for data attributes first (preferred)
                const msgType = button.getAttribute('data-msg-type');
                if (msgType) {
                    let payload = undefined;
                    const payloadStr = button.getAttribute('data-msg-payload');
                    
                    if (payloadStr) {
                        try {
                            payload = JSON.parse(payloadStr);
                        } catch (e) {
                            console.error('DevLoop: Error parsing payload:', e);
                        }
                    }
                    
                    console.log('DevLoop: Sending message via data attributes:', msgType, payload);
                    
                     if (msgType === 'commitAll' && !payload) {
                        sendMessage(msgType, getCommitMessage());
                    } else {
                        sendMessage(msgType, payload);
                    }
                    return;
                }

                // Fallback to onclick parsing (legacy)
                const onclick = button.getAttribute('onclick');
                if (onclick) {
                    // ... (existing regex logic)
                    try {
                        const match = onclick.match(/sendMessage\(['"]([^'"]+)['"](?:,\s*['"]([^'"]*)['"])?\)/);
                        if (match) {
                            const type = match[1];
                            const payload = match[2] || undefined;
                            sendMessage(type, payload);
                        }
                    } catch (error) {
                         console.error('DevLoop: Error parsing onclick:', error);
                    }
                }
            }
        });
        
        console.log('DevLoop: Button listeners setup complete');
    }

    // Override commit button to include message
    const originalSendMessage = window.sendMessage;
    window.sendMessage = function(type, payload) {
        if (type === 'commitAll' && !payload) {
            payload = getCommitMessage();
        }
        originalSendMessage(type, payload);
    };
})();

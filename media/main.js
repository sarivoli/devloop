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
    let searchDebounce = null;

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

    window.toggleWidget = function(widgetId, event) {
        if (event) {
            // If the click was on a button or something interactive, don't toggle
            if (event.target.closest('vscode-button') || event.target.closest('vscode-checkbox') || event.target.closest('vscode-text-field')) {
                console.log('DevLoop: Suppressing accordion toggle for interactive element');
                return;
            }
        }
        
        console.log('DevLoop: Toggling widget:', widgetId);
        const widget = document.getElementById(widgetId);
        if (widget) {
            widget.classList.toggle('collapsed');
            console.log('DevLoop: New collapsed state:', widget.classList.contains('collapsed'));
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

            case 'updatePanel':
                const container = document.getElementById(message.containerId);
                if (container) {
                    // Preserve focus
                    const activeElementId = document.activeElement ? document.activeElement.id : null;
                    const selectionStart = document.activeElement ? document.activeElement.selectionStart : null;
                    const selectionEnd = document.activeElement ? document.activeElement.selectionEnd : null;

                    // Preserve scroll position if it's the issue list
                    const issueList = container.querySelector('.issue-list');
                    const scrollTop = issueList ? issueList.scrollTop : 0;
                    
                    container.innerHTML = message.html;
                    
                    // Sync values for web components which might not react to innerHTML change correctly
                    const searchInput = container.querySelector('#lint-search');
                    if (searchInput) {
                        // The value from message.html might not be enough for a living web component
                        const stateValue = window.dashboardState.searchQuery || '';
                        if (searchInput.value !== stateValue) {
                            searchInput.value = stateValue;
                        }
                    }
                    
                    // Restore focus
                    if (activeElementId) {
                        const newElement = document.getElementById(activeElementId);
                        if (newElement) {
                            newElement.focus();
                            if (selectionStart !== null && selectionEnd !== null) {
                                try {
                                    newElement.setSelectionRange(selectionStart, selectionEnd);
                                } catch (e) {}
                            }
                        }
                    }
                    
                    // Restore scroll position
                    const newIssueList = container.querySelector('.issue-list');
                    if (newIssueList) newIssueList.scrollTop = scrollTop;
                    
                    // Auto-scroll to highlighted issue if any
                    const highlighted = container.querySelector('.issue-item.highlight');
                    if (highlighted) {
                        setTimeout(() => {
                            highlighted.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }, 100);
                    }
                }
                break;
            
            case 'updateBadge':
                const badge = document.getElementById(message.containerId);
                if (badge) {
                    badge.textContent = message.count;
                }
                break;
            
            case 'updateState':
                window.dashboardState = message.state;
                // Sync search input if it exists
                const searchField = document.getElementById('lint-search');
                if (searchField) {
                    const stateQuery = window.dashboardState.searchQuery || '';
                    if (searchField.value !== stateQuery) {
                        searchField.value = stateQuery;
                    }
                }
                
                // Switch tab if activeMainTab changed
                if (window.dashboardState.activeMainTab) {
                    switchTab(window.dashboardState.activeMainTab);
                }
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

        // Add event listeners for message elements
        setupMessageListeners();
        setupTabListeners();

        console.log('DevLoop: Dashboard initialized successfully');
    });

    /**
     * Setup message click listeners
     * Elements with data-msg-type will send messages to extension
     */
    function setupMessageListeners() {
        console.log('DevLoop: Setting up centralized event delegation...');
        
        document.addEventListener('click', function(event) {
            // 1. Handle Widget Header Toggle
            const header = event.target.closest('.widget-header');
            if (header) {
                // If the click was on a button or something interactive inside the header, don't toggle
                if (event.target.closest('vscode-button') || event.target.closest('vscode-checkbox') || event.target.closest('vscode-text-field')) {
                    console.log('DevLoop: Suppressing accordion toggle for interactive element');
                } else {
                    const widget = header.closest('.widget');
                    if (widget && widget.id) {
                        toggleWidget(widget.id, event);
                        return; // Handled
                    }
                }
            }

            // 2. Handle Tab Switching
            const tab = event.target.closest('.tab');
            if (tab) {
                const tabName = tab.getAttribute('data-tab');
                const msgType = tab.getAttribute('data-msg-type');
                
                if (tabName) {
                    switchTab(tabName);
                }
                
                // If it ALSO has a message type (like sub-tabs), fall through to message handling
                if (!msgType) return; 
            }

            // 3. Handle data-msg-type Messaging
            const target = event.target.closest('[data-msg-type]');
            if (target) {
                const msgType = target.getAttribute('data-msg-type');
                if (msgType) {
                    console.log('DevLoop: Handing message click:', msgType);
                    
                    // Add visual feedback
                    target.classList.add('click-feedback');
                    setTimeout(() => target.classList.remove('click-feedback'), 200);

                    let payload = undefined;
                    const payloadStr = target.getAttribute('data-msg-payload');
                    
                    if (payloadStr) {
                        try {
                            payload = JSON.parse(payloadStr);
                        } catch (e) {
                            payload = payloadStr;
                        }
                    }
                    
                    if (msgType === 'commitAll' && !payload) {
                        sendMessage(msgType, getCommitMessage());
                    } else {
                        sendMessage(msgType, payload);
                    }
                    return;
                }
            }
        });
        
        // Handle checkbox changes via delegation (CSP safe)
        document.addEventListener('change', function(event) {
            const target = event.target.closest('vscode-checkbox[data-msg-type]');
            if (target) {
                const msgType = target.getAttribute('data-msg-type');
                let payload = target.getAttribute('data-msg-payload');
                
                if (msgType) {
                    console.log('DevLoop: Checkbox change:', msgType, payload);
                    sendMessage(msgType, payload);
                }
            }
        });
        
        // Search input remains keydown
        document.addEventListener('keydown', function(event) {
            if (event.target.id === 'lint-search' && event.key === 'Enter') {
                sendMessage('searchLint', event.target.value);
            }
        });
        
        console.log('DevLoop: Event delegation setup complete');
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

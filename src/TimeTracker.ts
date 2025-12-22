import * as vscode from 'vscode';
import { TimeTrackerState, ActivitySegment, TicketSnapshot, WorkLog } from './types';

/**
 * Manages time tracking for development tasks
 * Tracks active coding time, handles pause/resume, and idle detection
 */
export class TimeTracker {
    private state: TimeTrackerState;
    private timer: NodeJS.Timeout | null = null;
    private lastActivityTime: number = Date.now();
    private pauseStartTime: number | null = null;
    private accumulatedPauseTime: number = 0;
    private activityListener: vscode.Disposable | null = null;
    private onUpdateCallback: ((state: TimeTrackerState) => void) | null = null;
    private onPersistCallback: ((state: import('./types').TimerPersistenceState) => void) | null = null;
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.state = {
            isRunning: false,
            isPaused: false,
            currentTicketId: null,
            elapsedSeconds: 0,
            sessionStartTime: null
        };
    }

    /**
     * Get current tracker state
     */
    getState(): TimeTrackerState {
        return { ...this.state };
    }

    /**
     * Set callback for state updates
     */
    onUpdate(callback: (state: TimeTrackerState) => void): void {
        this.onUpdateCallback = callback;
    }

    /**
     * Set callback for periodic persistence (e.g., to disk)
     */
    onPersist(callback: (state: import('./types').TimerPersistenceState) => void): void {
        this.onPersistCallback = callback;
    }

    /**
     * Start tracking time for a ticket
     */
    start(ticketId: string, snapshot?: TicketSnapshot): void {
        if (this.state.isRunning) {
            this.log(`Timer already running for ${this.state.currentTicketId}`);
            return;
        }

        this.state = {
            isRunning: true,
            isPaused: false,
            currentTicketId: ticketId,
            elapsedSeconds: 0,
            sessionStartTime: new Date().toISOString(),
            ticketSnapshot: snapshot
        };

        this.accumulatedPauseTime = 0;
        this.lastActivityTime = Date.now();
        this.startTimer();
        this.setupActivityListener();

        this.log(`Timer started for ${ticketId}`);
        this.notifyUpdate();
    }

    /**
     * Pause the timer
     */
    pause(): void {
        if (!this.state.isRunning || this.state.isPaused) {
            return;
        }

        this.state.isPaused = true;
        this.pauseStartTime = Date.now();
        this.stopTimer();

        this.log('Timer paused');
        this.notifyUpdate();
    }

    /**
     * Resume the timer
     * @param includeIdle If true, adds the time spent in idle/pause to the elapsed seconds
     */
    resume(includeIdle: boolean = false): void {
        if (!this.state.isRunning || !this.state.isPaused) {
            return;
        }

        if (this.pauseStartTime) {
            const pauseDurationMs = Date.now() - this.pauseStartTime;
            if (includeIdle) {
                const pauseSeconds = Math.floor(pauseDurationMs / 1000);
                this.state.elapsedSeconds += pauseSeconds;
                this.log(`Resumed: Included ${pauseSeconds}s of idle time`);
            }
            this.accumulatedPauseTime += pauseDurationMs;
            this.pauseStartTime = null;
        }

        this.state.isPaused = false;
        this.lastActivityTime = Date.now();
        this.startTimer();

        this.log(includeIdle ? 'Timer resumed (with idle)' : 'Timer resumed');
        this.notifyUpdate();
    }

    /**
     * Stop and return the work log
     */
    stop(): WorkLog | null {
        if (!this.state.isRunning) {
            return null;
        }

        this.stopTimer();
        this.cleanupActivityListener();

        const log: WorkLog = {
            id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            startTime: this.state.sessionStartTime!,
            endTime: new Date().toISOString(),
            duration: Math.floor(this.state.elapsedSeconds / 60), // Convert to minutes
            ticketSnapshot: this.state.ticketSnapshot || { 
                status: 'unknown', 
                assignee: 'unknown', 
                timestamp: new Date().toISOString() 
            },
            synced: false
        };

        this.log(`Timer stopped. Total time: ${this.formatTime(this.state.elapsedSeconds)}`);

        // Reset state
        this.state = {
            isRunning: false,
            isPaused: false,
            currentTicketId: null,
            elapsedSeconds: 0,
            sessionStartTime: null,
            ticketSnapshot: undefined
        };

        this.notifyUpdate();
        this.triggerPersist();
        return log;
    }

    /**
     * Get elapsed time in seconds
     */
    getElapsedSeconds(): number {
        return this.state.elapsedSeconds;
    }

    /**
     * Get elapsed time formatted as HH:MM:SS
     */
    getFormattedTime(): string {
        return this.formatTime(this.state.elapsedSeconds);
    }

    /**
     * Format seconds to HH:MM:SS
     */
    formatTime(totalSeconds: number): string {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return [hours, minutes, seconds]
            .map(v => v.toString().padStart(2, '0'))
            .join(':');
    }

    /**
     * Start the interval timer
     */
    private startTimer(): void {
        if (this.timer) {
            clearInterval(this.timer);
        }

        this.timer = setInterval(() => {
            if (!this.state.isPaused) {
                this.state.elapsedSeconds++;
                this.checkIdleTime();
                
                // Persist every 30 seconds
                if (this.state.elapsedSeconds % 30 === 0) {
                    this.triggerPersist();
                }
                
                this.notifyUpdate();
            }
        }, 1000);
    }

    /**
     * Stop the interval timer
     */
    private stopTimer(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Set up activity detection listener
     */
    private setupActivityListener(): void {
        // Listen for text document changes as activity indicator
        this.activityListener = vscode.workspace.onDidChangeTextDocument(() => {
            this.recordActivity();
        });

        // Also listen for active editor changes
        vscode.window.onDidChangeActiveTextEditor(() => {
            this.recordActivity();
        });
    }

    /**
     * Clean up activity listener
     */
    private cleanupActivityListener(): void {
        if (this.activityListener) {
            this.activityListener.dispose();
            this.activityListener = null;
        }
    }

    /**
     * Record activity to reset idle timer
     */
    private recordActivity(): void {
        this.lastActivityTime = Date.now();

        // If timer was auto-paused due to idle, resume it
        if (this.state.isRunning && this.state.isPaused) {
            this.log('Activity detected, resuming timer');
            this.resume();
        }
    }

    /**
     * Check for idle time and auto-pause if needed
     */
    private checkIdleTime(): void {
        const idleThreshold = vscode.workspace
            .getConfiguration('devloop')
            .get<number>('timeTracker.idleThreshold', 5);

        const idleMs = Date.now() - this.lastActivityTime;
        const idleMinutes = idleMs / (1000 * 60);

        if (idleMinutes >= idleThreshold && !this.state.isPaused) {
            this.log(`Idle detected (${Math.floor(idleMinutes)} min), auto-pausing`);
            this.pause();
            
            const idleDisplay = Math.floor(idleMinutes);
            vscode.window.showInformationMessage(
                `DevLoop: Timer paused due to ${idleDisplay}m of inactivity.`,
                'Resume',
                'Resume (Include Idle Time)'
            ).then(selection => {
                if (selection === 'Resume') {
                    this.resume(false);
                } else if (selection === 'Resume (Include Idle Time)') {
                    this.resume(true);
                }
            });
        }
    }

    /**
     * Notify callback of state update
     */
    private notifyUpdate(): void {
        if (this.onUpdateCallback) {
            this.onUpdateCallback(this.getState());
        }
    }

    /**
     * Get state for persistence
     */
    getPersistenceState(): import('./types').TimerPersistenceState {
        return {
            isRunning: this.state.isRunning,
            isPaused: this.state.isPaused,
            currentTicketId: this.state.currentTicketId,
            elapsedSeconds: this.state.elapsedSeconds,
            lastTickTime: new Date().toISOString(),
            ticketSnapshot: this.state.ticketSnapshot
        };
    }

    /**
     * Restore state from persistence
     */
    restore(persistence: import('./types').TimerPersistenceState, includeDrift: boolean = false): void {
        this.log(`Restoring timer for ${persistence.currentTicketId}...`);
        
        let elapsed = persistence.elapsedSeconds;
        if (includeDrift && persistence.isRunning && !persistence.isPaused) {
            const driftMs = Date.now() - new Date(persistence.lastTickTime).getTime();
            const driftSeconds = Math.floor(driftMs / 1000);
            if (driftSeconds > 0) {
                elapsed += driftSeconds;
                this.log(`Applied drift: ${driftSeconds}s`);
            }
        }

        this.state = {
            isRunning: persistence.isRunning,
            isPaused: persistence.isPaused,
            currentTicketId: persistence.currentTicketId,
            elapsedSeconds: elapsed,
            sessionStartTime: persistence.lastTickTime, // Best guess
            ticketSnapshot: persistence.ticketSnapshot
        };

        if (this.state.isRunning && !this.state.isPaused) {
            this.startTimer();
            this.setupActivityListener();
        } else if (this.state.isRunning && this.state.isPaused) {
            this.pauseStartTime = Date.now();
        }

        this.notifyUpdate();
        this.triggerPersist();
    }

    /**
     * Trigger persistence callback
     */
    private triggerPersist(): void {
        if (this.onPersistCallback && this.state.isRunning) {
            this.onPersistCallback(this.getPersistenceState());
        }
    }

    /**
     * Log message to output channel
     */
    private log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [Timer] ${message}`);
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.stop();
        this.cleanupActivityListener();
    }
}

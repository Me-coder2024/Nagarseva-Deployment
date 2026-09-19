import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const QUEUE_STORAGE_KEY = '@nagarseva_offline_frames_queue';
const MAX_UPLOAD_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 2000; // 2 seconds
const MAX_RETRY_DELAY_MS = 60000; // 1 minute

// Queue item states
export enum QueueItemStatus {
    PENDING = 'PENDING',
    UPLOADING = 'UPLOADING',
    FAILED = 'FAILED',
    COMPLETED = 'COMPLETED',
}

// HTTP status code classification
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];
const PERMANENT_ERROR_STATUS_CODES = [400, 401, 403, 404, 422];

export interface OfflineQueueItem {
    id: string;
    frames: string[];
    routeId: string;
    wardId: string;
    surveySessionId: string;
    assignmentId: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
    capturedAt?: string;
    timestamp: number;
    retryCount: number;
    status: QueueItemStatus;
    lastError?: string;
    nextRetryAt?: number;
    httpStatus?: number;
}

class OfflineQueueManager {
    private isProcessingQueue: boolean = false;
    private isPaused: boolean = false;
    private pauseReason?: string;
    private listeners: ((pendingCount: number) => void)[] = [];

    private log(message: string, data?: any) {
        const timestamp = new Date().toISOString();
        console.log(`[QUEUE ${timestamp}] ${message}`, data || '');
    }

    private isRetryableError(statusCode?: number, errorMessage?: string): boolean {
        if (!statusCode) {
            // Network errors (no status code) are retryable
            return true;
        }
        if (RETRYABLE_STATUS_CODES.includes(statusCode)) {
            return true;
        }
        // 409 Conflict - check if it's a duplicate detection
        if (statusCode === 409) {
            if (errorMessage && errorMessage.toLowerCase().includes('already exists')) {
                // Already exists - treat as success (idempotent)
                return false;
            }
            // Other conflicts - retryable
            return true;
        }
        return false;
    }

    private isPermanentError(statusCode?: number): boolean {
        if (!statusCode) return false;
        return PERMANENT_ERROR_STATUS_CODES.includes(statusCode);
    }

    private calculateBackoff(retryCount: number): number {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
        return Math.min(delay, MAX_RETRY_DELAY_MS);
    }

    async getQueue(): Promise<OfflineQueueItem[]> {
        try {
            const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
            const queue = raw ? JSON.parse(raw) : [];
            // Reset any stuck UPLOADING items to PENDING
            return queue.map((item: OfflineQueueItem) => ({
                ...item,
                status: item.status === QueueItemStatus.UPLOADING ? QueueItemStatus.PENDING : item.status,
            }));
        } catch (error) {
            this.log('Failed to read offline queue', error);
            return [];
        }
    }

    async enqueueBatch(
        frames: string[],
        routeId: string,
        wardId: string,
        surveySessionId: string,
        assignmentId: string,
        latitude: number,
        longitude: number,
        accuracy?: number,
        capturedAt?: string
    ): Promise<void> {
        if (frames.length === 0) return;

        try {
            const currentQueue = await this.getQueue();
            const newItem: OfflineQueueItem = {
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                frames,
                routeId,
                wardId,
                surveySessionId,
                assignmentId,
                latitude,
                longitude,
                accuracy,
                capturedAt,
                timestamp: Date.now(),
                retryCount: 0,
                status: QueueItemStatus.PENDING,
            };

            const updatedQueue = [...currentQueue, newItem];
            await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updatedQueue));
            this.log(`Added detection`, { id: newItem.id, queueSize: updatedQueue.length });
        } catch (error) {
            this.log('Failed to enqueue offline frames', error);
        }
    }

    async syncQueue(
        uploadFn: (item: OfflineQueueItem) => Promise<{ success: boolean; httpStatus?: number; message?: string }>
    ): Promise<{ synced: number; remaining: number; failed: number }> {
        // Prevent concurrent processing
        if (this.isProcessingQueue) {
            this.log('Queue already processing, skipping duplicate sync');
            return { synced: 0, remaining: 0, failed: 0 };
        }

        // Check if queue is paused (e.g., due to auth error)
        if (this.isPaused) {
            this.log('Queue paused', { reason: this.pauseReason });
            return { synced: 0, remaining: 0, failed: 0 };
        }

        // Check network connectivity
        const netInfo = await NetInfo.fetch();
        if (!netInfo.isConnected) {
            this.log('Device offline, skipping sync');
            return { synced: 0, remaining: 0, failed: 0 };
        }

        this.isProcessingQueue = true;

        try {
            const currentQueue = await this.getQueue();
            if (currentQueue.length === 0) {
                return { synced: 0, remaining: 0, failed: 0 };
            }

            this.log('Processing queue', { itemCount: currentQueue.length });

            let syncedCount = 0;
            let failedCount = 0;
            const remainingQueue: OfflineQueueItem[] = [];

            for (const item of currentQueue) {
                // Skip completed items
                if (item.status === QueueItemStatus.COMPLETED) {
                    continue;
                }

                // Skip permanently failed items
                if (item.status === QueueItemStatus.FAILED) {
                    remainingQueue.push(item);
                    failedCount++;
                    continue;
                }

                // Check if we've exceeded max retries
                if (item.retryCount >= MAX_UPLOAD_RETRIES) {
                    this.log('Max retries exceeded', { id: item.id, retryCount: item.retryCount });
                    remainingQueue.push({ ...item, status: QueueItemStatus.FAILED });
                    failedCount++;
                    continue;
                }

                // Check if it's too early to retry (backoff)
                if (item.nextRetryAt && item.nextRetryAt > Date.now()) {
                    remainingQueue.push(item);
                    continue;
                }

                try {
                    this.log('Upload attempt', { id: item.id, attempt: item.retryCount + 1 });

                    // Mark as uploading
                    item.status = QueueItemStatus.UPLOADING;
                    await this.saveQueue([...currentQueue.filter(i => i.id !== item.id), item]);

                    const result = await uploadFn(item);

                    if (result.success) {
                        this.log('Upload succeeded', { id: item.id });
                        syncedCount++;
                        // Item is removed from queue (not added to remainingQueue)
                    } else {
                        const httpStatus = result.httpStatus;
                        const errorMessage = result.message;

                        if (httpStatus === 401) {
                            // Authentication error - pause queue
                            this.isPaused = true;
                            this.pauseReason = 'Authentication required';
                            this.log('Queue paused - authentication required', { id: item.id });
                            remainingQueue.push({ ...item, status: QueueItemStatus.PENDING, retryCount: item.retryCount, httpStatus, lastError: errorMessage });
                            break; // Stop processing
                        } else if (this.isPermanentError(httpStatus)) {
                            // Permanent error - mark as failed
                            this.log('Permanent failure', { id: item.id, httpStatus, message: errorMessage });
                            remainingQueue.push({ ...item, status: QueueItemStatus.FAILED, retryCount: item.retryCount, httpStatus, lastError: errorMessage });
                            failedCount++;
                        } else if (httpStatus === 409 && errorMessage && errorMessage.toLowerCase().includes('already exists')) {
                            // Duplicate detection - treat as success
                            this.log('Duplicate detection - treating as success', { id: item.id });
                            syncedCount++;
                        } else {
                            // Retryable error - increment retry count and schedule backoff
                            const newRetryCount = item.retryCount + 1;
                            const backoffDelay = this.calculateBackoff(newRetryCount);
                            const nextRetryAt = Date.now() + backoffDelay;

                            this.log('Retry scheduled', { id: item.id, attempt: newRetryCount, delayMs: backoffDelay });
                            remainingQueue.push({
                                ...item,
                                status: QueueItemStatus.PENDING,
                                retryCount: newRetryCount,
                                nextRetryAt,
                                httpStatus,
                                lastError: errorMessage,
                            });
                        }
                    }
                } catch (error: any) {
                    // Network or unexpected error - retryable
                    const newRetryCount = item.retryCount + 1;
                    const backoffDelay = this.calculateBackoff(newRetryCount);
                    const nextRetryAt = Date.now() + backoffDelay;

                    this.log('Upload error - retry scheduled', { id: item.id, attempt: newRetryCount, error: error?.message });
                    remainingQueue.push({
                        ...item,
                        status: QueueItemStatus.PENDING,
                        retryCount: newRetryCount,
                        nextRetryAt,
                        lastError: error?.message || 'Network error',
                    });
                }
            }

            await this.saveQueue(remainingQueue);

            this.log('Sync completed', { synced: syncedCount, remaining: remainingQueue.length, failed: failedCount });
            return { synced: syncedCount, remaining: remainingQueue.length, failed: failedCount };
        } finally {
            this.isProcessingQueue = false;
        }
    }

    private async saveQueue(queue: OfflineQueueItem[]): Promise<void> {
        try {
            await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
            this.notifyListeners();
        } catch (error) {
            this.log('Failed to save queue', error);
        }
    }

    async getQueueLength(): Promise<number> {
        const queue = await this.getQueue();
        return queue.length;
    }

    async getTotalPendingPhotosCount(): Promise<number> {
        const queue = await this.getQueue();
        return queue.reduce((acc, item) => acc + (item.frames?.length || 1), 0);
    }

    subscribe(callback: (pendingCount: number) => void): () => void {
        this.listeners.push(callback);
        this.getTotalPendingPhotosCount().then(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    private async notifyListeners() {
        try {
            const count = await this.getTotalPendingPhotosCount();
            this.listeners.forEach(cb => {
                try {
                    cb(count);
                } catch (e) {}
            });
        } catch (e) {}
    }

    async getFailedItems(): Promise<OfflineQueueItem[]> {
        const queue = await this.getQueue();
        return queue.filter(item => item.status === QueueItemStatus.FAILED);
    }

    async retryFailedItem(itemId: string): Promise<boolean> {
        const queue = await this.getQueue();
        const item = queue.find(i => i.id === itemId);
        if (!item) return false;

        // Reset retry state for manual retry
        const updatedItem = {
            ...item,
            status: QueueItemStatus.PENDING,
            retryCount: 0,
            nextRetryAt: undefined,
            lastError: undefined,
            httpStatus: undefined,
        };

        const updatedQueue = queue.map(i => i.id === itemId ? updatedItem : i);
        await this.saveQueue(updatedQueue);
        this.log('Manual retry triggered', { id: itemId });
        return true;
    }

    async clearQueue(): Promise<void> {
        try {
            await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
            this.notifyListeners();
            this.log('Queue cleared');
        } catch (error) {
            this.log('Failed to clear queue', error);
        }
    }

    async resumeQueue(): Promise<void> {
        this.isPaused = false;
        this.pauseReason = undefined;
        this.log('Queue resumed');
    }

    isQueuePaused(): boolean {
        return this.isPaused;
    }

    getPauseReason(): string | undefined {
        return this.pauseReason;
    }
}

export const offlineQueue = new OfflineQueueManager();
export default offlineQueue;

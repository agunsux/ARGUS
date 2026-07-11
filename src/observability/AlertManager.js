/**
 * AlertManager — Phase 20 Observability Platform
 * 
 * Watches for error threshold breaches and fires critical alert notifications.
 */
class AlertManager {
  constructor(threshold = 5) {
    this.errorThreshold = threshold;
    this.errors = [];
    this.alertsFired = [];
  }

  /**
   * Tracks an error event. Triggers an alert if the threshold is breached.
   */
  recordError(err, context = {}) {
    const errorRecord = {
      timestamp: new Date().toISOString(),
      message: err.message || err.toString(),
      context
    };
    
    this.errors.push(errorRecord);
    
    if (this.errors.length >= this.errorThreshold) {
      this.triggerAlert(errorRecord);
    }
  }

  /**
   * Fires a critical system alert.
   */
  triggerAlert(lastError) {
    const alert = {
      id: `alert-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      message: `Alert triggered: Error threshold exceeded ${this.errorThreshold} events.`,
      lastError
    };

    this.alertsFired.push(alert);

    if (process.env.NODE_ENV !== 'test') {
      console.error(`[ALERT_MANAGER] !!! CRITICAL SYSTEM ALERT !!! ${alert.message}`);
    }
  }

  getAlerts() {
    return this.alertsFired;
  }

  clear() {
    this.errors = [];
    this.alertsFired = [];
  }
}

const alertManager = new AlertManager();

module.exports = {
  AlertManager,
  alertManager
};

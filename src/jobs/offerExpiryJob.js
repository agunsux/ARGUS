const { OfferService } = require('../services/offerService');

let timer = null;

function startOfferExpiryJob(intervalMs = 60000) {
  if (timer) return timer;

  timer = setInterval(async () => {
    try {
      const expired = await OfferService.expirePendingOffers();
      if (expired && expired.length > 0) {
        console.log(`[ARGUS Cron] Expired ${expired.length} pending offers.`);
      }
    } catch (err) {
      console.error('[ARGUS Cron] Error expiring pending offers:', err);
    }
  }, intervalMs);

  // Do not hold Node process open if running tests
  if (timer.unref) {
    timer.unref();
  }

  return timer;
}

function stopOfferExpiryJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  startOfferExpiryJob,
  stopOfferExpiryJob
};

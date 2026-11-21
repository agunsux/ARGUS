const fs = require('fs');

// 1. Patch public/pay.html
let payHtml = fs.readFileSync('public/pay.html', 'utf8');

const payTarget = `<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">`;
const payRepl = `<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; flex-wrap: wrap; gap: 14px;">
          <div style="display: flex; gap: 14px; align-items: flex-start;">
            <div class="event-poster-container event-poster-container--thumb" id="eventPosterContainer">
              <img id="eventPosterImg" src="/images/events/concert-default.svg" alt="Event Poster" onerror="this.onerror=null; this.src='/images/events/concert-default.svg';">
            </div>`;

if (payHtml.includes(payTarget)) {
  payHtml = payHtml.replace(payTarget, payRepl);
  const verBadgeTarget = `<div id="eventVerificationBadge"></div>`;
  const verBadgeRepl = `</div>
          <div id="eventVerificationBadge"></div>`;
  payHtml = payHtml.replace(verBadgeTarget, verBadgeRepl);

  const populateTarget = `document.getElementById('eventTitle').innerText = ev.name || ev.title || 'Event Tanpa Judul';`;
  const populateRepl = `document.getElementById('eventTitle').innerText = ev.name || ev.title || 'Event Tanpa Judul';
      if (document.getElementById('eventPosterImg')) document.getElementById('eventPosterImg').src = ev.image_url || '/images/events/concert-default.svg';`;
  payHtml = payHtml.replace(populateTarget, populateRepl);

  fs.writeFileSync('public/pay.html', payHtml, 'utf8');
  console.log('Successfully patched public/pay.html');
} else {
  console.log('payTarget not found in public/pay.html');
}

// 2. Patch public/track.html
let trackHtml = fs.readFileSync('public/track.html', 'utf8');

const trackTarget = `<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">`;
const trackRepl = `<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px; margin-bottom: 16px;">
          <div style="display: flex; gap: 14px; align-items: flex-start;">
            <div class="event-poster-container event-poster-container--thumb" id="transEventPosterContainer">
              <img id="transEventPosterImg" src="/images/events/concert-default.svg" alt="Event Poster" onerror="this.onerror=null; this.src='/images/events/concert-default.svg';">
            </div>`;

if (trackHtml.includes(trackTarget)) {
  trackHtml = trackHtml.replace(trackTarget, trackRepl);
  const trackCloseTarget = `<div style="text-align: right;">`;
  const trackCloseRepl = `</div>
          <div style="text-align: right;">`;
  trackHtml = trackHtml.replace(trackCloseTarget, trackCloseRepl);

  const renderOrderTarget = `document.getElementById('transEventTitle').innerText = tx.event?.name || tx.event?.title || tx.listing?.event?.name || 'Event Tikum';`;
  const renderOrderRepl = `document.getElementById('transEventTitle').innerText = tx.event?.name || tx.event?.title || tx.listing?.event?.name || 'Event Tikum';
      if (document.getElementById('transEventPosterImg')) document.getElementById('transEventPosterImg').src = tx.event?.image_url || tx.listing?.event?.image_url || tx.image_url || '/images/events/concert-default.svg';`;
  trackHtml = trackHtml.replace(renderOrderTarget, renderOrderRepl);

  fs.writeFileSync('public/track.html', trackHtml, 'utf8');
  console.log('Successfully patched public/track.html');
} else {
  console.log('trackTarget not found in public/track.html');
}

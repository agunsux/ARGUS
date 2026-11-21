const path = require('path');
const { state } = require('../src/database');
const { TicketInventoryService } = require('../src/services/marketplace/TicketInventoryService');

async function testCreate() {
  console.log('Testing TicketInventoryService.createTicket for event-gnr-jakarta-2026...');
  try {
    const res = await TicketInventoryService.createTicket({
      sellerId: 'usr-9a825b68',
      canonicalEventId: 'event-gnr-jakarta-2026',
      ticketType: 'GENERAL_ADMISSION',
      section: 'Festival',
      faceValue: 1749999,
      currency: 'IDR',
      barcodeHash: 'test-hash-12345'
    });
    console.log('Result:', res);
  } catch (err) {
    console.error('createTicket THREW ERROR:', err.message, err.code);
  }
}

testCreate();

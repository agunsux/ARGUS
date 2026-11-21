const path = require('path');
const { state } = require('../src/database');
const { TicketInventoryService } = require('../src/services/marketplace/TicketInventoryService');

async function testSubmit() {
  console.log('Testing TicketInventoryService.submitForVerification...');
  try {
    const res = await TicketInventoryService.submitForVerification(
      'tkt-18f2f68c-4e3c-49c2-ac78-89bdbbd1da66',
      'usr-9a825b68',
      null
    );
    console.log('Result:', res);
  } catch (err) {
    console.error('submitForVerification THREW ERROR:', err.message, err.code);
  }
}

testSubmit();

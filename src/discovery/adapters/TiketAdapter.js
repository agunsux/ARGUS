/**
 * TiketAdapter
 * Alias / wrapper for TiketComAdapter
 */

const { TiketComAdapter } = require('./TiketComAdapter');

class TiketAdapter extends TiketComAdapter {
  constructor(sourceId = 'src-tiket-com', options = {}) {
    super(sourceId, options);
  }
}

module.exports = {
  TiketAdapter,
  TiketComAdapter
};

/**
 * TIKUM / ARGUS Adapter Registry
 * 
 * Factory and registry mapping source identifiers to concrete adapter instances.
 */

const { TicketmasterAdapter } = require('./TicketmasterAdapter');
const { TiketComAdapter } = require('./TiketComAdapter');
const { LoketAdapter } = require('./LoketAdapter');
const { GoersAdapter } = require('./GoersAdapter');
const { BboAdapter } = require('./BboAdapter');
const { BandsintownAdapter } = require('./BandsintownAdapter');
const { SongkickAdapter } = require('./SongkickAdapter');
const { LiveNationAdapter } = require('./LiveNationAdapter');
const { PromoterAdapter } = require('./PromoterAdapter');
const { VenueAdapter } = require('./VenueAdapter');
const { SocialDiscoveryAdapter } = require('./SocialDiscoveryAdapter');
const { DewatiketAdapter } = require('./DewatiketAdapter');
const { YesplisAdapter } = require('./YesplisAdapter');
const { ArtatixAdapter } = require('./ArtatixAdapter');
const { EventSourceAdapter } = require('./EventSourceAdapter');
const { sourceRegistry } = require('../SourceRegistry');

class AdapterRegistry {
  constructor() {
    this.adapters = new Map();
  }

  getAdapter(sourceId, options = {}) {
    if (this.adapters.has(sourceId)) {
      return this.adapters.get(sourceId);
    }

    const srcMeta = sourceRegistry.getSource(sourceId) || {};
    let adapterInstance;

    if (sourceId === 'src-ticketmaster') {
      adapterInstance = new TicketmasterAdapter(sourceId, options);
    } else if (sourceId === 'src-tiket-com' || sourceId === 'src-tiket') {
      adapterInstance = new TiketComAdapter(sourceId, options);
    } else if (sourceId === 'src-loket') {
      adapterInstance = new LoketAdapter(sourceId, options);
    } else if (sourceId === 'src-goers') {
      adapterInstance = new GoersAdapter(sourceId, options);
    } else if (sourceId === 'src-bbo') {
      adapterInstance = new BboAdapter(sourceId, options);
    } else if (sourceId === 'src-bandsintown-jakarta' || sourceId === 'src-bandsintown') {
      adapterInstance = new BandsintownAdapter(sourceId, options);
    } else if (sourceId === 'src-songkick-jakarta' || sourceId === 'src-songkick') {
      adapterInstance = new SongkickAdapter(sourceId, options);
    } else if (sourceId === 'src-dewatiket') {
      adapterInstance = new DewatiketAdapter(sourceId, options);
    } else if (sourceId === 'src-yesplis') {
      adapterInstance = new YesplisAdapter(sourceId, options);
    } else if (sourceId === 'src-artatix') {
      adapterInstance = new ArtatixAdapter(sourceId, options);
    } else if (sourceId === 'src-livenation') {
      adapterInstance = new LiveNationAdapter(sourceId, options);
    } else if (sourceId.includes('venue') || sourceId.includes('league')) {
      adapterInstance = new VenueAdapter(sourceId, { venueName: srcMeta.source_name, ...options });
    } else if (sourceId.includes('instagram') || sourceId.includes('social') || srcMeta.source_type === 'PROMOTER_OFFICIAL_SOCIAL') {
      adapterInstance = new SocialDiscoveryAdapter(sourceId, { accountHandle: srcMeta.account_handle, ...options });
    } else if (sourceId.includes('promoter') || sourceId.includes('assoc')) {
      adapterInstance = new PromoterAdapter(sourceId, { promoterName: srcMeta.source_name, ...options });
    } else {
      adapterInstance = new EventSourceAdapter(sourceId, options);
    }

    this.adapters.set(sourceId, adapterInstance);
    return adapterInstance;
  }

  registerAdapter(sourceId, adapterInstance) {
    this.adapters.set(sourceId, adapterInstance);
    return adapterInstance;
  }

  reset() {
    this.adapters.clear();
  }
}

const adapterRegistryInstance = new AdapterRegistry();

module.exports = {
  AdapterRegistry,
  adapterRegistry: adapterRegistryInstance
};

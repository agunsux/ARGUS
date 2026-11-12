// Preload for forensic tests: permit loopback HTTP only, never external money/DB calls.
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns');

function checkHost(host) {
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(host).toLowerCase())) {
    const error = new Error('OFFLINE_TEST_EXTERNAL_NETWORK_BLOCKED');
    error.code = 'OFFLINE_TEST_EXTERNAL_NETWORK_BLOCKED';
    throw error;
  }
}

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = args[0];
  if (Array.isArray(options)) options = options[0];
  if (options && typeof options === 'object') {
    if (options.path) throw new Error('OFFLINE_TEST_SOCKET_PATH_BLOCKED');
    checkHost(options.host || 'localhost');
  } else if (typeof options === 'number') {
    checkHost(typeof args[1] === 'string' ? args[1] : 'localhost');
  } else {
    throw new Error('OFFLINE_TEST_SOCKET_PATH_BLOCKED');
  }
  return connect.apply(this, args);
};

for (const transport of [http, https]) {
  for (const method of ['request', 'get']) {
    const original = transport[method];
    transport[method] = function (target, ...args) {
      const options = typeof target === 'string' ? new URL(target) : target;
      checkHost(options?.hostname || options?.host || 'localhost');
      return original.call(this, target, ...args);
    };
  }
}
const fetchOriginal = global.fetch;
global.fetch = function (input, ...args) {
  checkHost(new URL(typeof input === 'string' || input instanceof URL ? input : input.url).hostname);
  return fetchOriginal(input, ...args);
};
const lookup = dns.lookup;
dns.lookup = function (host, ...args) {
  checkHost(host);
  return lookup.call(this, host, ...args);
};
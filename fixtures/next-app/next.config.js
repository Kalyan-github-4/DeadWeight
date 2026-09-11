const path = require('path');

module.exports = {
  webpack(config) {
    config.resolve.alias['legacy-shim'] = path.join(__dirname, 'shims/legacy-shim.js');
    return config;
  },
};

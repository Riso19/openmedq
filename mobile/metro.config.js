// metro.config.js
const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add 'wasm' to asset extensions so Metro can bundle wa-sqlite
config.resolver.assetExts.push('wasm');

// Add Cross-Origin-Embedder-Policy and Cross-Origin-Opener-Policy headers
// required for wa-sqlite/SharedArrayBuffer in web environments
config.server = config.server || {};
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return middleware(req, res, next);
  };
};

module.exports = config;

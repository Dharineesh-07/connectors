const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// react-native-webrtc bundles an old event-target-shim that doesn't declare
// its subpaths in "exports". Turning off the experimental exports resolver
// lets Metro fall back to file-based resolution silently (no warning).
config.resolver.unstable_enablePackageExports = false;

module.exports = config;

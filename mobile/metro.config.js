const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

// Resolve the monorepo root and shared package
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');
const sharedRoot = path.resolve(monorepoRoot, 'shared');

const config = getDefaultConfig(projectRoot);

// SVG transformer support
const { transformer, resolver } = config;

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};

config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
  // Let Metro find packages in both mobile/node_modules and root node_modules
  nodeModulesPaths: [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(monorepoRoot, 'node_modules'),
  ],
};

// Watch the shared package directory so Metro picks up @buddy/shared
config.watchFolders = [sharedRoot, monorepoRoot];

module.exports = withNativeWind(config, { input: './global.css' });

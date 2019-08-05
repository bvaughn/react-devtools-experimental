const { resolve } = require('path');
const { DefinePlugin } = require('webpack');
const { getGitHubURL, getVersionString } = require('../../shells/utils');

const NODE_ENV = process.env.NODE_ENV;
if (!NODE_ENV) {
  console.error('NODE_ENV not set');
  process.exit(1);
}

const __DEV__ = true; // NODE_ENV === 'development';

const GITHUB_URL = getGitHubURL();
const DEVTOOLS_VERSION = getVersionString();

module.exports = {
  mode: __DEV__ ? 'development' : 'production',
  devtool: false,
  entry: {
    backend: './src/backend.js',
    frontend: './src/frontend.js',
  },
  output: {
    path: __dirname + '/dist',
    filename: '[name].js',
    library: '[name]',
    libraryTarget: 'commonjs2',
  },
  resolve: {
    alias: {
      src: resolve(__dirname, '../../src'),
    },
  },
  externals: {
    react: 'react',
    'react-dom': 'react-dom',
    scheduler: 'scheduler',
  },
  plugins: [
    new DefinePlugin({
      __DEV__: __DEV__,
      'process.env.DEVTOOLS_VERSION': `"${DEVTOOLS_VERSION}"`,
      'process.env.GITHUB_URL': `"${GITHUB_URL}"`,
      'process.env.NODE_ENV': `"${NODE_ENV}"`,
    }),
  ],
  module: {
    rules: [
      {
        test: /\.js$/,
        loader: 'babel-loader',
        options: {
          configFile: resolve(__dirname, '../../babel.config.js'),
        },
      },
      {
        test: /\.css$/,
        use: [
          {
            loader: 'style-loader',
          },
          {
            loader: 'css-loader',
            options: {
              sourceMap: true,
              modules: true,
              localIdentName: '[local]___[hash:base64:5]',
            },
          },
        ],
      },
    ],
  },
};

//@ts-check

'use strict';

const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node', // VS Code extensions run in a Node.js-context
  mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode',
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        // Import webview .html/.css/.js files as raw strings (asset/source)
        test: /\.(?:html|css|js)$/,
        include: path.resolve(__dirname, 'src/views/webview'),
        type: 'asset/source',
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        // Copy tree-sitter WASM runtime
        {
          from: 'node_modules/web-tree-sitter/tree-sitter.wasm',
          to: path.resolve(__dirname, 'wasm/tree-sitter.wasm'),
        },
        // Copy language grammar WASM files (downloaded by scripts/fetch-grammars.js)
        {
          from: 'grammars/*.wasm',
          to: path.resolve(__dirname, 'wasm/[name][ext]'),
          noErrorOnMissing: true,
        },
      ],
    }),
  ],
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log",
  },
};
module.exports = [ extensionConfig ];

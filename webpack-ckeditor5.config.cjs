const path = require('path');
const CKEditorWebpackPlugin = require('@ckeditor/ckeditor5-dev-webpack-plugin');

module.exports = {
  entry: path.resolve(__dirname, 'src/ckeditor5-build.js'),
  output: {
    path: path.resolve(__dirname, 'public/ckeditor5'),
    filename: 'ckeditor.js',
    library: 'ClassicEditor',
    libraryTarget: 'umd',
    libraryExport: 'default',
    clean: false,
  },
  resolve: {
    fullySpecified: false,
    alias: {
      '@ckeditor/ckeditor5-core': path.resolve(__dirname, 'node_modules/@ckeditor/ckeditor5-core'),
      '@ckeditor/ckeditor5-engine': path.resolve(__dirname, 'node_modules/@ckeditor/ckeditor5-engine'),
      '@ckeditor/ckeditor5-ui': path.resolve(__dirname, 'node_modules/@ckeditor/ckeditor5-ui'),
      '@ckeditor/ckeditor5-utils': path.resolve(__dirname, 'node_modules/@ckeditor/ckeditor5-utils'),
      '@ckeditor/ckeditor5-watchdog': path.resolve(__dirname, 'node_modules/@ckeditor/ckeditor5-watchdog'),
      '@ckeditor/ckeditor5-widget': path.resolve(__dirname, 'node_modules/@ckeditor/ckeditor5-widget'),
      '@ckeditor/ckeditor5-clipboard': path.resolve(__dirname, 'node_modules/@ckeditor/ckeditor5-clipboard'),
      '@ckeditor/ckeditor5-enter': path.resolve(__dirname, 'node_modules/@ckeditor/ckeditor5-enter'),
      '@ckeditor/ckeditor5-paragraph': path.resolve(__dirname, 'node_modules/@ckeditor/ckeditor5-paragraph'),
      '@ckeditor/ckeditor5-select-all': path.resolve(__dirname, 'node_modules/@ckeditor/ckeditor5-select-all'),
      '@ckeditor/ckeditor5-typing': path.resolve(__dirname, 'node_modules/@ckeditor/ckeditor5-typing'),
      '@ckeditor/ckeditor5-undo': path.resolve(__dirname, 'node_modules/@ckeditor/ckeditor5-undo'),
      '@ckeditor/ckeditor5-upload': path.resolve(__dirname, 'node_modules/@ckeditor/ckeditor5-upload'),
    },
  },
  plugins: [
    new CKEditorWebpackPlugin({
      language: 'zh-cn',
    }),
  ],
  module: {
    rules: [
      {
        test: /ckeditor5-[^/\\]+[/\\]theme[/\\]icons[/\\][^/\\]+\.svg$/,
        use: ['raw-loader'],
      },
      {
        test: /ckeditor5-[^/\\]+[/\\]theme[/\\].+\.(css|scss)$/,
        use: [
          {
            loader: 'style-loader',
            options: {
              injectType: 'singletonStyleTag',
              attributes: { 'data-cke': true },
            },
          },
          'css-loader',
        ],
      },
    ],
  },
  mode: 'production',
  devtool: false,
};

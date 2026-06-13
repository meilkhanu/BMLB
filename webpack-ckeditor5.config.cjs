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
